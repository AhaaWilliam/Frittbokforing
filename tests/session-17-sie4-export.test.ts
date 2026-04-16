import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as iconv from 'iconv-lite'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import { saveDraft, finalizeDraft } from '../src/main/services/invoice-service'
import {
  saveExpenseDraft,
  finalizeExpense,
} from '../src/main/services/expense-service'
import { exportSie4 } from '../src/main/services/sie4/sie4-export-service'
import { calculateKsumma } from '../src/main/services/sie4/sie4-checksum'

let db: Database.Database

const COMPANY = {
  name: 'Test AB',
  org_number: '556677-8899',
  fiscal_rule: 'K2' as const,
  share_capital: 5_000_000,
  registration_date: '2026-01-01',
  fiscal_year_start: '2026-01-01',
  fiscal_year_end: '2026-12-31',
}

interface Seed {
  companyId: number
  fyId: number
  customerId: number
  supplierId: number
  vatCode25Id: number
  vatCodeInId: number
  productId: number
}

let seed: Seed
let invoiceCounter = 0
let expenseCounter = 0

function setupSeed(testDb: Database.Database): Seed {
  createCompany(testDb, COMPANY)
  const company = testDb.prepare('SELECT id FROM companies LIMIT 1').get() as {
    id: number
  }
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  const customer = createCounterparty(testDb, {
    name: 'Kund AB',
    type: 'customer',
  })
  if (!customer.success) throw new Error('Customer failed')
  const supplier = createCounterparty(testDb, {
    name: 'Leverantör AB',
    type: 'supplier',
  })
  if (!supplier.success) throw new Error('Supplier failed')
  const vatCode25 = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
    .get() as { id: number }
  const vatCodeIn = testDb
    .prepare("SELECT id FROM vat_codes WHERE vat_type = 'incoming' LIMIT 1")
    .get() as { id: number }
  const account = testDb
    .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
    .get() as { id: number }
  const product = createProduct(testDb, {
    name: 'Konsult',
    default_price_ore: 100_000,
    vat_code_id: vatCode25.id,
    account_id: account.id,
  })
  if (!product.success) throw new Error('Product failed')
  return {
    companyId: company.id,
    fyId: fy.id,
    customerId: customer.data.id,
    supplierId: supplier.data.id,
    vatCode25Id: vatCode25.id,
    vatCodeInId: vatCodeIn.id,
    productId: product.data.id,
  }
}

function bookInvoice(testDb: Database.Database, date: string) {
  invoiceCounter++
  const r = saveDraft(testDb, {
    counterparty_id: seed.customerId,
    fiscal_year_id: seed.fyId,
    invoice_date: date,
    due_date: '2099-12-31',
    lines: [
      {
        product_id: seed.productId,
        description: `Konsult ${invoiceCounter}`,
        quantity: 10,
        unit_price_ore: 100_000,
        vat_code_id: seed.vatCode25Id,
        sort_order: 0,
      },
    ],
  })
  if (!r.success) throw new Error('Draft failed: ' + r.error)
  const f = finalizeDraft(testDb, r.data.id)
  if (!f.success) throw new Error('Finalize failed: ' + f.error)
  return f.data
}

function bookExpense(testDb: Database.Database, date: string) {
  expenseCounter++
  const r = saveExpenseDraft(testDb, {
    fiscal_year_id: seed.fyId,
    counterparty_id: seed.supplierId,
    expense_date: date,
    description: `Kostnad ${expenseCounter}`,
    payment_terms: 30,
    supplier_invoice_number: `F2026-${expenseCounter}`,
    notes: '',
    lines: [
      {
        description: 'Hyra',
        account_number: '5010',
        quantity: 1,
        unit_price_ore: 500_000,
        vat_code_id: seed.vatCodeInId,
      },
    ],
  })
  if (!r.success) throw new Error('Expense draft failed: ' + r.error)
  const f = finalizeExpense(testDb, r.data.id)
  if (!f.success) throw new Error('Expense finalize failed: ' + f.error)
}

function getDecodedContent(result: { content: Buffer }): string {
  return iconv.decode(result.content, 'cp437')
}

describe('SIE4 Export', () => {
  beforeEach(() => {
    db = createTestDb()
    invoiceCounter = 0
    expenseCounter = 0
    seed = setupSeed(db)
  })

  afterEach(() => {
    db.close()
  })

  // 1. Generates valid text
  it('genererar giltig SIE4-text', () => {
    bookInvoice(db, '2026-01-15')
    const result = exportSie4(db, { fiscalYearId: seed.fyId })
    expect(result.content).toBeInstanceOf(Buffer)
    const text = getDecodedContent(result)
    expect(text).toContain('#FLAGGA')
    expect(text).toContain('#KSUMMA')
  })

  // 2. #FLAGGA 0 as line 1
  it('#FLAGGA 0 är rad 1', () => {
    const text = getDecodedContent(exportSie4(db, { fiscalYearId: seed.fyId }))
    const lines = text.split('\r\n')
    expect(lines[0]).toBe('#FLAGGA 0')
  })

  // 3. #FORMAT PC8
  it('#FORMAT PC8 finns', () => {
    const text = getDecodedContent(exportSie4(db, { fiscalYearId: seed.fyId }))
    expect(text).toContain('#FORMAT PC8')
  })

  // 4. #SIETYP 4
  it('#SIETYP 4 finns', () => {
    const text = getDecodedContent(exportSie4(db, { fiscalYearId: seed.fyId }))
    expect(text).toContain('#SIETYP 4')
  })

  // 5. #PROGRAM
  it('#PROGRAM innehåller "Fritt Bokföring"', () => {
    const text = getDecodedContent(exportSie4(db, { fiscalYearId: seed.fyId }))
    expect(text).toMatch(/#PROGRAM "Fritt Bokföring"/)
  })

  // 6. #ORGNR
  it('#ORGNR korrekt format', () => {
    const text = getDecodedContent(exportSie4(db, { fiscalYearId: seed.fyId }))
    expect(text).toContain('#ORGNR 556677-8899')
  })

  // 7. #FNAMN
  it('#FNAMN citerad', () => {
    const text = getDecodedContent(exportSie4(db, { fiscalYearId: seed.fyId }))
    expect(text).toContain('#FNAMN "Test AB"')
  })

  // 8. #RAR 0
  it('#RAR 0 med korrekta datum YYYYMMDD', () => {
    const text = getDecodedContent(exportSie4(db, { fiscalYearId: seed.fyId }))
    expect(text).toContain('#RAR 0 20260101 20261231')
  })

  // 9. #RAR -1 if previous FY
  it('#RAR -1 finns om föregående FY existerar', () => {
    const prevFyId = db
      .prepare(
        `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
       VALUES (?, '2025', '2025-01-01', '2025-12-31')`,
      )
      .run(seed.companyId).lastInsertRowid
    for (let m = 1; m <= 12; m++) {
      const s = `2025-${String(m).padStart(2, '0')}-01`
      const d = new Date(2025, m, 0).getDate()
      const e = `2025-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      db.prepare(
        'INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
      ).run(seed.companyId, prevFyId, m, s, e)
    }
    const text = getDecodedContent(exportSie4(db, { fiscalYearId: seed.fyId }))
    expect(text).toContain('#RAR -1 20250101 20251231')
  })

  // 10. #KONTO + #KTYP
  it('#KONTO + #KTYP för använda konton', () => {
    bookInvoice(db, '2026-01-15')
    const text = getDecodedContent(exportSie4(db, { fiscalYearId: seed.fyId }))
    expect(text).toMatch(/#KONTO 1510 "Kundfordringar"/)
    expect(text).toContain('#KTYP 1510 T')
    expect(text).toMatch(/#KTYP 2610 S/)
  })

  // 11. #IB 0 correct
  it('#IB 0 korrekt för balansräkningskonton', () => {
    // Create previous year with bank balance
    const prevFyId = db
      .prepare(
        `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
       VALUES (?, '2025', '2025-01-01', '2025-12-31')`,
      )
      .run(seed.companyId).lastInsertRowid as number
    for (let m = 1; m <= 12; m++) {
      const s = `2025-${String(m).padStart(2, '0')}-01`
      const d = new Date(2025, m, 0).getDate()
      const e = `2025-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      db.prepare(
        'INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
      ).run(seed.companyId, prevFyId, m, s, e)
    }
    // Book 50000 kr on 1930 in previous year
    const jeId = db
      .prepare(
        `INSERT INTO journal_entries (company_id, fiscal_year_id, journal_date, description, status, source_type)
       VALUES (?, ?, '2025-06-01', 'Kapital', 'draft', 'manual')`,
      )
      .run(seed.companyId, prevFyId).lastInsertRowid as number
    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
     VALUES (?, 1, '1930', 5000000, 0), (?, 2, '2081', 0, 5000000)`,
    ).run(jeId, jeId)
    db.prepare("UPDATE journal_entries SET status = 'booked' WHERE id = ?").run(
      jeId,
    )

    bookInvoice(db, '2026-01-15')
    const text = getDecodedContent(exportSie4(db, { fiscalYearId: seed.fyId }))
    expect(text).toContain('#IB 0 1930 50000')
  })

  // 12. #UB 0
  it('#UB 0 korrekt', () => {
    bookInvoice(db, '2026-01-15')
    const text = getDecodedContent(exportSie4(db, { fiscalYearId: seed.fyId }))
    // 1510 should have UB = invoice total
    expect(text).toMatch(/#UB 0 1510/)
  })

  // 13. #RES 0 — revenue negative, cost positive
  it('#RES 0 korrekt — intäkter negativa, kostnader positiva', () => {
    bookInvoice(db, '2026-01-15')
    bookExpense(db, '2026-01-20')
    const text = getDecodedContent(exportSie4(db, { fiscalYearId: seed.fyId }))
    // 3002 (revenue) should be negative
    const res3002 = text.match(/#RES 0 3002 (-\d[\d.]*)/)
    expect(res3002).not.toBeNull()
    expect(parseFloat(res3002![1])).toBeLessThan(0)
    // 5010 (cost) should be positive
    const res5010 = text.match(/#RES 0 5010 (\d[\d.]*)/)
    expect(res5010).not.toBeNull()
    expect(parseFloat(res5010![1])).toBeGreaterThan(0)
  })

  // 14. #PSALDO YYYYMM format, net per period
  it('#PSALDO korrekt format och nettosaldo', () => {
    bookInvoice(db, '2026-01-15')
    const text = getDecodedContent(exportSie4(db, { fiscalYearId: seed.fyId }))
    // Should have PSALDO for January
    expect(text).toMatch(/#PSALDO 0 202601 \d{4} \{\}/)
  })

  // 15. #VER "A" with quoted series
  it('#VER "A" med citerad serie', () => {
    bookInvoice(db, '2026-01-15')
    const text = getDecodedContent(exportSie4(db, { fiscalYearId: seed.fyId }))
    expect(text).toMatch(/#VER "A" 1 20260115/)
  })

  // 16. #VER "B" with expense
  it('#VER "B" med leverantörsverifikation', () => {
    bookExpense(db, '2026-01-20')
    const text = getDecodedContent(exportSie4(db, { fiscalYearId: seed.fyId }))
    expect(text).toMatch(/#VER "B" 1 20260120/)
  })

  // 17. #TRANS amounts correct
  it('#TRANS belopp korrekt konverterade', () => {
    bookInvoice(db, '2026-01-15')
    const text = getDecodedContent(exportSie4(db, { fiscalYearId: seed.fyId }))
    // Should contain #TRANS for 1510 with positive amount (debit)
    expect(text).toMatch(/#TRANS 1510 \{\} \d/)
    // Should contain #TRANS for 3002 with negative amount (credit)
    expect(text).toMatch(/#TRANS 3002 \{\} -\d/)
  })

  // 18. #KSUMMA last line, non-zero
  it('#KSUMMA sista raden, icke-noll', () => {
    bookInvoice(db, '2026-01-15')
    const text = getDecodedContent(exportSie4(db, { fiscalYearId: seed.fyId }))
    const lines = text.trimEnd().split('\r\n')
    const lastLine = lines[lines.length - 1]
    expect(lastLine).toMatch(/^#KSUMMA -?\d+$/)
    const ksummaValue = parseInt(lastLine.split(' ')[1], 10)
    expect(ksummaValue).not.toBe(0)
  })

  // 19. KSUMMA roundtrip verification
  it('KSUMMA roundtrip — verifierad checksumma', () => {
    bookInvoice(db, '2026-01-15')
    const text = getDecodedContent(exportSie4(db, { fiscalYearId: seed.fyId }))
    const lines = text.trimEnd().split('\r\n')
    const ksummaLine = lines[lines.length - 1]
    const reportedKsumma = parseInt(ksummaLine.split(' ')[1], 10)

    // Reconstruct content without KSUMMA line
    const contentWithoutKsumma = lines.slice(0, -1).join('\r\n') + '\r\n'
    const calculatedKsumma = calculateKsumma(contentWithoutKsumma)
    expect(calculatedKsumma).toBe(reportedKsumma)
  })

  // 20. CP437 encoding — Swedish characters
  it('CP437-kodning: svenska tecken korrekt', () => {
    const result = exportSie4(db, { fiscalYearId: seed.fyId })
    // The buffer should contain CP437 byte for 'ö' in "Bokföring" = 0x94
    const text = getDecodedContent(result)
    expect(text).toContain('Bokföring')
  })

  // 21. CRLF line endings
  it('CRLF radslut', () => {
    const result = exportSie4(db, { fiscalYearId: seed.fyId })
    const text = getDecodedContent(result)
    // Should have \r\n everywhere, not just \n
    const crlfCount = (text.match(/\r\n/g) || []).length
    const lfCount = (text.match(/\n/g) || []).length
    expect(crlfCount).toBe(lfCount) // Every \n should be preceded by \r
  })

  // 22. Empty database — minimal valid SIE4
  it('tom databas → minimal giltig SIE4', () => {
    const text = getDecodedContent(exportSie4(db, { fiscalYearId: seed.fyId }))
    expect(text).toContain('#FLAGGA 0')
    expect(text).toContain('#FORMAT PC8')
    expect(text).toContain('#SIETYP 4')
    expect(text).toContain('#KSUMMA')
  })

  // 23. Filename format
  it('filnamn format: CompanyName_YYYYMMDD.se', () => {
    const result = exportSie4(db, { fiscalYearId: seed.fyId })
    expect(result.filename).toMatch(/Test_AB_\d{8}\.se/)
  })

  // 24. Regression
  it('regression: user_version=10, 20 tabeller', () => {
    const version = db.pragma('user_version', { simple: true }) as number
    expect(version).toBe(34) // S48: Uppdatera vid nya migrationer
    const tables = db
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .get() as { count: number }
    expect(tables.count).toBe(29)
  })
})
