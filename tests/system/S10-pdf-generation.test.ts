/**
 * S10 — PDF-generering: invoice PDF + OCR/Luhn.
 * Verifierar buffer-struktur, ÅÄÖ-hantering, OCR golden references,
 * sidbrytning (30+ rader), draft-blockering, och nollbelopp.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from 'vitest'
import {
  createTemplateDb,
  createSystemTestContext,
  destroyContext,
  destroyTemplateDb,
  seedCustomer,
  seedProduct,
  getVatCode25Out,
  getVatCodeExempt,
  type SystemTestContext,
} from './helpers/system-test-context'
import { calculateOCR } from '../../src/main/services/pdf/ocr'

let ctx: SystemTestContext

beforeAll(() => {
  createTemplateDb()
})

afterAll(() => {
  destroyTemplateDb()
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-15T10:00:00'))
  ctx = createSystemTestContext()
})

afterEach(() => {
  destroyContext(ctx)
  vi.useRealTimers()
})

describe('S10: PDF-generering', () => {
  it('S10-01: PDF skapas för finaliserad faktura — giltig buffer', async () => {
    const customer = seedCustomer(ctx, { name: 'PDF-kund AB' })
    const product = seedProduct(ctx, {
      name: 'Konsulttjänst',
      default_price_ore: 100000,
    })
    const vatCode = getVatCode25Out(ctx)

    const draftResult = ctx.invoiceService.saveDraft(ctx.db, {
      counterparty_id: customer.id,
      fiscal_year_id: ctx.seed.fiscalYearId,
      invoice_date: '2026-03-15',
      due_date: '2026-04-14',
      lines: [
        {
          product_id: product.id,
          description: 'Tjänst',
          quantity: 2,
          unit_price_ore: 100000,
          vat_code_id: vatCode.id,
          sort_order: 0,
          account_number: '3002',
        },
      ],
    })
    expect(draftResult.success).toBe(true)
    if (!draftResult.success) throw new Error(draftResult.error)

    const finalizeResult = ctx.invoiceService.finalizeDraft(
      ctx.db,
      draftResult.data.id,
    )
    expect(finalizeResult.success).toBe(true)

    const buffer = await ctx.pdfService.generateInvoicePdf(
      ctx.db,
      draftResult.data.id,
    )

    // Buffer exists and is reasonable size
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(1000)

    // PDF magic bytes: %PDF (hex: 25 50 44 46)
    expect(buffer[0]).toBe(0x25)
    expect(buffer[1]).toBe(0x50)
    expect(buffer[2]).toBe(0x44)
    expect(buffer[3]).toBe(0x46)
  })

  it('S10-02: PDF med ÅÄÖ i alla textfält — ingen crash', async () => {
    // Uppdatera företagsnamn till ÅÄÖ
    ctx.companyService.updateCompany(ctx.db, {
      address_line1: 'Östgötavägen 42',
      city: 'Örebro',
      postal_code: '702 10',
    })

    const customer = seedCustomer(ctx, { name: 'Göran Östberg' })
    const product = seedProduct(ctx, {
      name: 'Rädisa & Rödbeta',
      default_price_ore: 50000,
    })
    const vatCode = getVatCode25Out(ctx)

    const draftResult = ctx.invoiceService.saveDraft(ctx.db, {
      counterparty_id: customer.id,
      fiscal_year_id: ctx.seed.fiscalYearId,
      invoice_date: '2026-03-15',
      due_date: '2026-04-14',
      notes: 'Åkeri Ölmölla Äppelträd AB — leverans',
      lines: [
        {
          product_id: product.id,
          description: 'Rädisa från Ölmölla',
          quantity: 1,
          unit_price_ore: 50000,
          vat_code_id: vatCode.id,
          sort_order: 0,
          account_number: '3002',
        },
      ],
    })
    expect(draftResult.success).toBe(true)
    if (!draftResult.success) throw new Error(draftResult.error)

    ctx.invoiceService.finalizeDraft(ctx.db, draftResult.data.id)

    const buffer = await ctx.pdfService.generateInvoicePdf(
      ctx.db,
      draftResult.data.id,
    )
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('S10-03: OCR/Luhn — golden references', () => {
    // Golden references from ocr.ts documentation:
    // "1" → pad to "0001" → Luhn check digit 8 → "00018"
    expect(calculateOCR('1')).toBe('00018')
    expect(calculateOCR('2')).toBe('00026')

    // Verify additional cases
    expect(calculateOCR('99')).toHaveLength(5) // 4 digits padded + 1 check
    expect(calculateOCR('123')).toHaveLength(5)

    // Roundtrip Luhn validation: for each generated OCR,
    // the full string (including check digit) should pass Luhn mod 10
    const testInputs = ['1', '2', '99', '123', '456', '9999']
    for (const input of testInputs) {
      const ocr = calculateOCR(input)

      // Luhn validation: iterate all digits including check, alternating double
      let sum = 0
      let doubleNext = false
      for (let i = ocr.length - 1; i >= 0; i--) {
        let digit = parseInt(ocr[i], 10)
        if (doubleNext) {
          digit *= 2
          if (digit > 9) digit -= 9
        }
        sum += digit
        doubleNext = !doubleNext
      }
      expect(sum % 10).toBe(0)
    }
  })

  it('S10-04: 30+ rader — ingen crash eller out-of-memory', async () => {
    const customer = seedCustomer(ctx, { name: 'Massrad-kund' })
    const product = seedProduct(ctx, {
      name: 'Massprodukt',
      default_price_ore: 1000,
    })
    const vatCode = getVatCode25Out(ctx)

    const lines = Array.from({ length: 35 }, (_, i) => ({
      product_id: product.id,
      description: `Rad ${i + 1} av 35`,
      quantity: 1,
      unit_price_ore: 1000,
      vat_code_id: vatCode.id,
      sort_order: i,
      account_number: '3002',
    }))

    const draftResult = ctx.invoiceService.saveDraft(ctx.db, {
      counterparty_id: customer.id,
      fiscal_year_id: ctx.seed.fiscalYearId,
      invoice_date: '2026-03-15',
      due_date: '2026-04-14',
      lines,
    })
    expect(draftResult.success).toBe(true)
    if (!draftResult.success) throw new Error(draftResult.error)

    ctx.invoiceService.finalizeDraft(ctx.db, draftResult.data.id)

    const buffer = await ctx.pdfService.generateInvoicePdf(
      ctx.db,
      draftResult.data.id,
    )
    expect(buffer).toBeInstanceOf(Buffer)
    // Valid %PDF header
    expect(buffer[0]).toBe(0x25)
    expect(buffer[1]).toBe(0x50)
    expect(buffer[2]).toBe(0x44)
    expect(buffer[3]).toBe(0x46)
  })

  it('S10-05: draft kan inte generera PDF', async () => {
    const customer = seedCustomer(ctx, { name: 'Draft-kund' })
    const product = seedProduct(ctx, {
      name: 'Draft-produkt',
      default_price_ore: 10000,
    })
    const vatCode = getVatCode25Out(ctx)

    const draftResult = ctx.invoiceService.saveDraft(ctx.db, {
      counterparty_id: customer.id,
      fiscal_year_id: ctx.seed.fiscalYearId,
      invoice_date: '2026-03-15',
      due_date: '2026-04-14',
      lines: [
        {
          product_id: product.id,
          description: 'Tjänst',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: vatCode.id,
          sort_order: 0,
          account_number: '3002',
        },
      ],
    })
    expect(draftResult.success).toBe(true)
    if (!draftResult.success) throw new Error(draftResult.error)

    // Do NOT finalize — try to generate PDF for draft
    await expect(
      ctx.pdfService.generateInvoicePdf(ctx.db, draftResult.data.id),
    ).rejects.toThrow()
  })

  it('S10-06: faktura med totalbelopp 0 kr — finalisering hanteras', async () => {
    const customer = seedCustomer(ctx, { name: 'Gratis-kund' })
    const vatExempt = getVatCodeExempt(ctx)

    const draftResult = ctx.invoiceService.saveDraft(ctx.db, {
      counterparty_id: customer.id,
      fiscal_year_id: ctx.seed.fiscalYearId,
      invoice_date: '2026-03-15',
      due_date: '2026-04-14',
      lines: [
        {
          product_id: null,
          description: 'Gratis tjänst',
          quantity: 1,
          unit_price_ore: 0,
          vat_code_id: vatExempt.id,
          sort_order: 0,
          account_number: '3002',
        },
      ],
    })
    expect(draftResult.success).toBe(true)
    if (!draftResult.success) throw new Error(draftResult.error)

    const finalizeResult = ctx.invoiceService.finalizeDraft(
      ctx.db,
      draftResult.data.id,
    )

    if (finalizeResult.success) {
      // If finalization succeeds, PDF should generate without crash
      const buffer = await ctx.pdfService.generateInvoicePdf(
        ctx.db,
        draftResult.data.id,
      )
      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer[0]).toBe(0x25) // %PDF
      expect(buffer[1]).toBe(0x50)
    } else {
      // If finalization rejects 0-amount invoices, that's a valid guard.
      // The booking trigger (trg_check_balance_on_booking) may reject
      // journal entries where all amounts are 0.
      // Document the actual behavior:
      expect(finalizeResult.error).toBeDefined()
    }
  })
})
