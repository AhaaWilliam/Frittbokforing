/**
 * PDF feature tests (Feature 1, docs/feature-prompts.md).
 *
 * Covers:
 *  - Single invoice PDF generation: writes to disk, valid PDF, contains
 *    invoice number / customer / line items / totals / due date.
 *  - Batch PDF export: replicates the `invoice:save-pdf-batch` handler loop
 *    against a temp directory and verifies all selected invoices land as
 *    files with non-empty buffers (>1 KB).
 *  - Credit-note cross-reference (M139): generated PDF includes
 *    "Avser faktura" + the original invoice number.
 *
 * Limitation: the IPC handler `invoice:save-pdf-batch` cannot be invoked
 * directly here because it is registered against Electron's `ipcMain` and
 * uses Electron's `dialog`. The handler body is a thin loop over
 * `generateInvoicePdf` + `fs.writeFileSync`, so we replicate that loop
 * verbatim — covering the same business logic without the Electron shell.
 * End-to-end of the IPC + dialog wiring is tested in tests/e2e.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { inflateSync } from 'zlib'
import type Database from 'better-sqlite3'
import { generateInvoicePdf } from '../src/main/services/pdf/invoice-pdf-service'
import {
  saveDraft,
  finalizeDraft,
  createCreditNoteDraft,
} from '../src/main/services/invoice-service'
import { createTestDbWithFinalizedInvoice } from './helpers/pdf-test-setup'

let db: Database.Database
let invoiceId: number
let secondInvoiceId: number
let creditNoteId: number
let tmpDir: string

/**
 * Decompress FlateDecode streams from a PDFKit-generated PDF and concatenate
 * all rendered text. Same approach as tests/invoice-pdf-content.test.ts.
 */
function extractPdfText(buffer: Buffer): string {
  const texts: string[] = []
  let pos = 0
  while (pos < buffer.length) {
    const marker = buffer.indexOf('\nstream\n', pos)
    if (marker === -1) break
    const dataStart = marker + 8
    let endMarker = buffer.indexOf('\nendstream', dataStart)
    if (endMarker === -1) {
      endMarker = buffer.indexOf('endstream', dataStart)
      if (endMarker === -1) break
    }
    try {
      const compressed = buffer.subarray(dataStart, endMarker)
      const decompressed = inflateSync(compressed).toString('latin1')
      const tjRegex = /\[((?:<[0-9a-fA-F]+>|[\s\-\d.]+)+)\]\s*TJ/g
      let tjm
      while ((tjm = tjRegex.exec(decompressed)) !== null) {
        const hexParts = tjm[1].match(/<([0-9a-fA-F]+)>/g) ?? []
        let word = ''
        for (const hp of hexParts) {
          const hex = hp.slice(1, -1)
          for (let j = 0; j < hex.length; j += 2) {
            word += String.fromCharCode(parseInt(hex.substring(j, j + 2), 16))
          }
        }
        if (word.length > 0) texts.push(word)
      }
      const textRegex = /\(([^)]+)\)\s*Tj/g
      let tm
      while ((tm = textRegex.exec(decompressed)) !== null) {
        texts.push(tm[1])
      }
    } catch {
      /* skip non-zlib streams */
    }
    pos = endMarker + 10
  }
  return texts.join(' ')
}

beforeAll(() => {
  const setup = createTestDbWithFinalizedInvoice()
  db = setup.db
  invoiceId = setup.invoiceId

  // Skapa en andra finaliserad faktura så vi kan testa batch med >1 rad.
  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  const customer = db
    .prepare("SELECT id FROM counterparties WHERE type = 'customer' LIMIT 1")
    .get() as { id: number }
  const vatCode = db
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
    .get() as { id: number }
  const product = db.prepare('SELECT id FROM products LIMIT 1').get() as {
    id: number
  }

  const draft2 = saveDraft(db, {
    counterparty_id: customer.id,
    fiscal_year_id: fy.id,
    invoice_date: '2025-04-01',
    due_date: '2025-05-01',
    payment_terms: 30,
    lines: [
      {
        product_id: product.id,
        description: 'Andra fakturan',
        quantity: 2,
        unit_price_ore: 7500,
        vat_code_id: vatCode.id,
        sort_order: 0,
      },
    ],
  })
  if (!draft2.success) throw new Error('draft2 failed: ' + draft2.error)
  const fin2 = finalizeDraft(db, draft2.data.id)
  if (!fin2.success) throw new Error('fin2 failed: ' + fin2.error)
  secondInvoiceId = draft2.data.id

  // Kreditfaktura mot första fakturan (för M139 cross-reference-test).
  // createCreditNoteDraft sätter datum via todayLocalFromNow vilket inte
  // ligger i seedens FY 2025 — vi sätter FRITT_NOW deterministiskt.
  const prevNow = process.env.FRITT_NOW
  const prevTest = process.env.FRITT_TEST
  process.env.FRITT_TEST = '1'
  process.env.FRITT_NOW = '2025-04-15T10:00:00.000Z'
  try {
    const cn = createCreditNoteDraft(db, {
      original_invoice_id: invoiceId,
      fiscal_year_id: fy.id,
    })
    if (!cn.success) throw new Error('credit note draft failed: ' + cn.error)
    const cnFinal = finalizeDraft(db, cn.data.id)
    if (!cnFinal.success)
      throw new Error('credit note finalize failed: ' + cnFinal.error)
    creditNoteId = cn.data.id
  } finally {
    if (prevNow === undefined) delete process.env.FRITT_NOW
    else process.env.FRITT_NOW = prevNow
    if (prevTest === undefined) delete process.env.FRITT_TEST
    else process.env.FRITT_TEST = prevTest
  }

  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-feature-'))
})

afterAll(() => {
  if (db) db.close()
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('PDF feature — single invoice', () => {
  it('F1: generates PDF buffer that starts with %PDF- and ends with %%EOF', async () => {
    const buf = await generateInvoicePdf(db, invoiceId)
    expect(buf.toString('ascii', 0, 5)).toBe('%PDF-')
    expect(buf.toString('ascii', buf.length - 10)).toContain('%%EOF')
  })

  it('F2: PDF buffer is non-trivial (>1 KB)', async () => {
    const buf = await generateInvoicePdf(db, invoiceId)
    expect(buf.length).toBeGreaterThan(1024)
  })

  it('F3: PDF written to disk and file size matches buffer', async () => {
    const buf = await generateInvoicePdf(db, invoiceId)
    const file = path.join(tmpDir, 'F3.pdf')
    fs.writeFileSync(file, buf)
    const stat = fs.statSync(file)
    expect(stat.size).toBe(buf.length)
    expect(stat.size).toBeGreaterThan(1024)
  })

  it('F4: PDF text contains customer name', async () => {
    const buf = await generateInvoicePdf(db, invoiceId)
    const text = extractPdfText(buf)
    expect(text).toContain('Testkund AB')
  })

  it('F5: PDF text contains both line item descriptions', async () => {
    const buf = await generateInvoicePdf(db, invoiceId)
    const text = extractPdfText(buf)
    expect(text).toContain('Konsult') // "Konsulttjänst" — å is encoded
    expect(text).toContain('Livsmedel')
  })

  it('F6: PDF text contains due date', async () => {
    const buf = await generateInvoicePdf(db, invoiceId)
    const text = extractPdfText(buf)
    // Seed: due_date '2025-04-14'
    expect(text).toContain('2025-04-14')
  })

  it('F7: PDF text contains invoice total (net + VAT formatted)', async () => {
    const buf = await generateInvoicePdf(db, invoiceId)
    const text = extractPdfText(buf)
    // Seed: 10000 öre @ 25% + 5000 öre @ 12% = 100,00 + 25,00 + 50,00 + 6,00 = 181,00 kr
    // Belopp formateras som "181,00" med svensk locale.
    expect(text.replace(/\u00A0/g, ' ')).toMatch(/181,00/)
  })

  it('F8: PDF text contains invoice number under "Fakturanummer" label', async () => {
    const buf = await generateInvoicePdf(db, invoiceId)
    const text = extractPdfText(buf)
    const stripped = text.replace(/\s/g, '')
    // First finalized invoice in seed → invoice_number = "1"
    expect(stripped).toMatch(/Fakturanummer1/)
  })
})

describe('PDF feature — batch export', () => {
  /**
   * Replicates the `invoice:save-pdf-batch` handler loop verbatim.
   * The handler itself depends on Electron `ipcMain` + `dialog` and is
   * exercised in E2E (M147 dialog bypass via E2E_DOWNLOAD_DIR).
   */
  async function runBatch(
    directory: string,
    items: Array<{ invoiceId: number; fileName: string }>,
  ): Promise<{
    succeeded: number
    failed: Array<{ invoiceId: number; error: string }>
  }> {
    const succeeded: number[] = []
    const failed: Array<{ invoiceId: number; error: string }> = []
    for (const inv of items) {
      try {
        const buffer = await generateInvoicePdf(db, inv.invoiceId)
        fs.writeFileSync(path.join(directory, inv.fileName), buffer)
        succeeded.push(inv.invoiceId)
      } catch (err) {
        failed.push({
          invoiceId: inv.invoiceId,
          error: err instanceof Error ? err.message : 'Okänt fel',
        })
      }
    }
    return { succeeded: succeeded.length, failed }
  }

  it('F9: batch writes one file per invoice with size >1 KB each', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-batch-'))
    try {
      const items = [
        { invoiceId, fileName: 'Faktura_A0001_Testkund.pdf' },
        { invoiceId: secondInvoiceId, fileName: 'Faktura_A0002_Testkund.pdf' },
      ]
      const result = await runBatch(dir, items)
      expect(result.succeeded).toBe(2)
      expect(result.failed).toHaveLength(0)
      for (const item of items) {
        const file = path.join(dir, item.fileName)
        expect(fs.existsSync(file)).toBe(true)
        expect(fs.statSync(file).size).toBeGreaterThan(1024)
        // Each file is a valid PDF
        const head = fs.readFileSync(file).toString('ascii', 0, 5)
        expect(head).toBe('%PDF-')
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('F10: batch reports per-row failure but completes other rows (best-effort)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-batch-'))
    try {
      const items = [
        { invoiceId, fileName: 'ok.pdf' },
        { invoiceId: 999_999, fileName: 'missing.pdf' },
        { invoiceId: secondInvoiceId, fileName: 'ok2.pdf' },
      ]
      const result = await runBatch(dir, items)
      expect(result.succeeded).toBe(2)
      expect(result.failed).toHaveLength(1)
      expect(result.failed[0].invoiceId).toBe(999_999)
      expect(fs.existsSync(path.join(dir, 'ok.pdf'))).toBe(true)
      expect(fs.existsSync(path.join(dir, 'ok2.pdf'))).toBe(true)
      expect(fs.existsSync(path.join(dir, 'missing.pdf'))).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('F11: each invoice in batch contains its own customer name', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-batch-'))
    try {
      await runBatch(dir, [
        { invoiceId, fileName: 'a.pdf' },
        { invoiceId: secondInvoiceId, fileName: 'b.pdf' },
      ])
      const a = fs.readFileSync(path.join(dir, 'a.pdf'))
      const b = fs.readFileSync(path.join(dir, 'b.pdf'))
      expect(extractPdfText(a)).toContain('Testkund AB')
      expect(extractPdfText(b)).toContain('Testkund AB')
      // Andra fakturan har egen radbeskrivning
      expect(extractPdfText(b)).toContain('Andra fakturan')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('PDF feature — credit note (M139)', () => {
  it('F12: credit-note PDF has KREDITFAKTURA header', async () => {
    const buf = await generateInvoicePdf(db, creditNoteId)
    const text = extractPdfText(buf)
    expect(text).toContain('KREDITFAKTURA')
  })

  it('F13: credit-note PDF references the original invoice number (M139)', async () => {
    const buf = await generateInvoicePdf(db, creditNoteId)
    const text = extractPdfText(buf)
    // Original invoice number = A0001. PDF metadata renders
    // "Avser faktura" + "#A0001". Strip spaces for char-spaced rendering.
    const stripped = text.replace(/\s/g, '')
    expect(stripped).toMatch(/Avserfaktura/)
    // Original is the first seeded finalized invoice → invoice_number "1"
    expect(stripped).toContain('#1')
  })

  it('F14: credit-note PDF non-empty (>1 KB)', async () => {
    const buf = await generateInvoicePdf(db, creditNoteId)
    expect(buf.length).toBeGreaterThan(1024)
  })
})
