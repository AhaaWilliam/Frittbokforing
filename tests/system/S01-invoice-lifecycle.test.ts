/**
 * S01 — Komplett fakturaflöde: kundfaktura från draft till betald.
 * Verifierar genomslag i alla subsystem (dashboard, moms, skatt, RR, BR, export).
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
  seedAndFinalizeInvoice,
  getVatCode25Out,
  getVatCode12Out,
  getVatCodeExempt,
  type SystemTestContext,
} from './helpers/system-test-context'

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

describe('Komplett fakturaflöde — kundfaktura', () => {
  it('S01-01: draft → finaliserad → betald → alla subsystem uppdaterade', () => {
    // 1. Skapa kund
    const customer = seedCustomer(ctx, { name: 'Kund S01-01' })
    expect(customer.id).toBeGreaterThan(0)

    // 2. Skapa produkt
    const product = seedProduct(ctx, {
      name: 'Tjänst S01',
      default_price: 100000,
    }) // 1000 kr

    // 3. Spara invoice draft med 2 rader
    const vatCode = getVatCode25Out(ctx)
    const draftResult = ctx.invoiceService.saveDraft(ctx.db, {
      counterparty_id: customer.id,
      fiscal_year_id: ctx.seed.fiscalYearId,
      invoice_date: '2026-03-15',
      due_date: '2026-04-14',
      lines: [
        {
          product_id: product.id,
          description: 'Konsulttjänst ×2',
          quantity: 2,
          unit_price_ore: 100000,
          vat_code_id: vatCode.id,
          sort_order: 0,
          account_number: '3002',
        },
        {
          product_id: product.id,
          description: 'Konsulttjänst ×1',
          quantity: 1,
          unit_price_ore: 100000,
          vat_code_id: vatCode.id,
          sort_order: 1,
          account_number: '3002',
        },
      ],
    })
    expect(draftResult.success).toBe(true)
    if (!draftResult.success) throw new Error(draftResult.error)
    const invoiceId = draftResult.data.id

    // 4. Verifiera draft-tillstånd
    const draft = ctx.db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(invoiceId) as any
    expect(draft.status).toBe('draft')
    expect(draft.journal_entry_id).toBeNull()

    // 5. Finalisera
    const finalizeResult = ctx.invoiceService.finalizeDraft(ctx.db, invoiceId)
    expect(finalizeResult.success).toBe(true)
    if (!finalizeResult.success) throw new Error(finalizeResult.error)

    const finalized = ctx.db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(invoiceId) as any
    expect(finalized.status).toBe('unpaid')
    expect(finalized.invoice_number).toBe('1')
    expect(finalized.journal_entry_id).not.toBeNull()

    // Verify journal entry
    const je = ctx.db
      .prepare('SELECT * FROM journal_entries WHERE id = ?')
      .get(finalized.journal_entry_id) as any
    expect(je.verification_series).toBe('A')
    expect(je.verification_number).toBe(1)
    expect(je.source_type).toBe('auto_invoice')
    expect(je.status).toBe('booked')

    // Verify journal entry lines (debit 1510, credit 3002, credit 2610)
    const jels = ctx.db
      .prepare(
        'SELECT * FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
      )
      .all(finalized.journal_entry_id) as any[]
    expect(jels.length).toBeGreaterThanOrEqual(3)

    const totalDebit = jels.reduce(
      (sum: number, l: any) => sum + l.debit_ore,
      0,
    )
    const totalCredit = jels.reduce(
      (sum: number, l: any) => sum + l.credit_ore,
      0,
    )
    expect(totalDebit).toBe(totalCredit) // balans!

    // Check specific accounts
    const debit1510 = jels.find(
      (l: any) => l.account_number === '1510' && l.debit_ore > 0,
    )
    expect(debit1510).toBeDefined()
    const credit3002 = jels.find(
      (l: any) => l.account_number === '3002' && l.credit_ore > 0,
    )
    expect(credit3002).toBeDefined()
    const credit2610 = jels.find(
      (l: any) => l.account_number === '2610' && l.credit_ore > 0,
    )
    expect(credit2610).toBeDefined()

    // 6. Betala fullt
    const payResult = ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: invoiceId,
      amount: finalized.total_amount_ore,
      payment_date: '2026-03-20',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(payResult.success).toBe(true)
    if (!payResult.success) throw new Error(payResult.error)

    const paid = ctx.db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(invoiceId) as any
    expect(paid.status).toBe('paid')

    // Payment journal entry
    const payJe = ctx.db
      .prepare('SELECT * FROM journal_entries WHERE id = ?')
      .get(payResult.data.payment.journal_entry_id) as any
    expect(payJe.verification_series).toBe('A')
    expect(payJe.verification_number).toBe(2)

    const payJels = ctx.db
      .prepare('SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?')
      .all(payJe.id) as any[]
    const payDebit = payJels.reduce(
      (sum: number, l: any) => sum + l.debit_ore,
      0,
    )
    const payCredit = payJels.reduce(
      (sum: number, l: any) => sum + l.credit_ore,
      0,
    )
    expect(payDebit).toBe(payCredit)

    // Debit 1930 (bank), Credit 1510 (kundfordran)
    expect(
      payJels.some(
        (l: any) => l.account_number === '1930' && l.debit_ore > 0,
      ),
    ).toBe(true)
    expect(
      payJels.some(
        (l: any) => l.account_number === '1510' && l.credit_ore > 0,
      ),
    ).toBe(true)

    // 7. Dashboard
    const dashboard = ctx.dashboardService.getDashboardSummary(
      ctx.db,
      ctx.seed.fiscalYearId,
    )
    expect(dashboard.revenueOre).toBeGreaterThan(0)
    // Revenue = net amount (ex moms) = 3 * 100000 = 300000 öre = 3000 kr
    expect(dashboard.revenueOre).toBe(300000)

    // 8. Momsrapport
    const vatReport = ctx.vatReportService.getVatReport(
      ctx.db,
      ctx.seed.fiscalYearId,
    )
    expect(vatReport.yearTotal.vatOutTotalOre).toBeGreaterThan(0)

    // 9. Skatteprognos
    const tax = ctx.taxService.getTaxForecast(ctx.db, ctx.seed.fiscalYearId)
    expect(tax.operatingProfitOre).toBeGreaterThan(0)
    expect(tax.corporateTaxOre).toBeGreaterThan(0)

    // 10. RR
    const rr = ctx.reportService.getIncomeStatement(
      ctx.db,
      ctx.seed.fiscalYearId,
    )
    expect(rr.netResult).toBeGreaterThan(0)

    // 11. BR
    const br = ctx.reportService.getBalanceSheet(ctx.db, ctx.seed.fiscalYearId)
    // Bank should have the payment amount
    expect(br.balanceDifference).toBe(0) // BR balanserar

    // 12. SIE4
    const sie4 = ctx.sie4ExportService.exportSie4(ctx.db, {
      fiscalYearId: ctx.seed.fiscalYearId,
    })
    const sie4Text = Buffer.from(sie4.content).toString('latin1')
    expect(sie4Text).toContain('#VER')

    // 13. SIE5
    const sie5 = ctx.sie5ExportService.exportSie5(ctx.db, {
      fiscalYearId: ctx.seed.fiscalYearId,
    })
    expect(sie5).toContain('LedgerEntry')
  })

  it('S01-02: faktura med mixad moms (25% + 12%) — korrekt kontering', () => {
    const customer = seedCustomer(ctx, { name: 'Mixmoms-kund' })
    const vat25 = getVatCode25Out(ctx)
    const vat12 = getVatCode12Out(ctx)

    const draftResult = ctx.invoiceService.saveDraft(ctx.db, {
      counterparty_id: customer.id,
      fiscal_year_id: ctx.seed.fiscalYearId,
      invoice_date: '2026-03-15',
      due_date: '2026-04-14',
      lines: [
        {
          product_id: null,
          description: 'Tjänst 25%',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: vat25.id,
          sort_order: 0,
          account_number: '3002',
        },
        {
          product_id: null,
          description: 'Livsmedel 12%',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: vat12.id,
          sort_order: 1,
          account_number: '3003',
        },
      ],
    })
    expect(draftResult.success).toBe(true)
    if (!draftResult.success) return

    const finalizeResult = ctx.invoiceService.finalizeDraft(
      ctx.db,
      draftResult.data.id,
    )
    expect(finalizeResult.success).toBe(true)
    if (!finalizeResult.success) return

    const inv = ctx.db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(draftResult.data.id) as any
    const jels = ctx.db
      .prepare('SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?')
      .all(inv.journal_entry_id) as any[]

    // Should have separate credit entries for 2610 (25%) and 2620 (12%)
    const credit2610 = jels.find(
      (l: any) => l.account_number === '2610' && l.credit_ore > 0,
    )
    const credit2620 = jels.find(
      (l: any) => l.account_number === '2620' && l.credit_ore > 0,
    )
    expect(credit2610).toBeDefined()
    expect(credit2620).toBeDefined()

    // Balance check
    const totalDebit = jels.reduce(
      (sum: number, l: any) => sum + l.debit_ore,
      0,
    )
    const totalCredit = jels.reduce(
      (sum: number, l: any) => sum + l.credit_ore,
      0,
    )
    expect(totalDebit).toBe(totalCredit)
  })

  it('S01-03: delbetalning → partial → slutbetalning → paid', () => {
    const customer = seedCustomer(ctx, { name: 'Delbetalning-kund' })
    const vatCode = getVatCode25Out(ctx)

    // Faktura 10 000 kr netto = 1 000 000 öre, + 25% moms = 1 250 000 öre total
    const draftResult = ctx.invoiceService.saveDraft(ctx.db, {
      counterparty_id: customer.id,
      fiscal_year_id: ctx.seed.fiscalYearId,
      invoice_date: '2026-03-15',
      due_date: '2026-04-14',
      lines: [
        {
          product_id: null,
          description: 'Stororder',
          quantity: 1,
          unit_price_ore: 1000000,
          vat_code_id: vatCode.id,
          sort_order: 0,
          account_number: '3002',
        },
      ],
    })
    expect(draftResult.success).toBe(true)
    if (!draftResult.success) return

    ctx.invoiceService.finalizeDraft(ctx.db, draftResult.data.id)
    const inv = ctx.db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(draftResult.data.id) as any
    const totalAmount = inv.total_amount_ore

    // Delbetala 60%
    const partAmount = Math.round(totalAmount * 0.6)
    const pay1 = ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: draftResult.data.id,
      amount: partAmount,
      payment_date: '2026-03-20',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(pay1.success).toBe(true)

    const afterPart = ctx.db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(draftResult.data.id) as any
    expect(afterPart.status).toBe('partial')

    // Slutbetala resterande
    const remaining = totalAmount - partAmount
    const pay2 = ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: draftResult.data.id,
      amount: remaining,
      payment_date: '2026-03-25',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(pay2.success).toBe(true)

    const afterFull = ctx.db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(draftResult.data.id) as any
    expect(afterFull.status).toBe('paid')

    // 3 verifikationer total: A1 (bokföring), A2 (delbetala), A3 (slutbetala)
    const jes = ctx.db
      .prepare(
        `
      SELECT * FROM journal_entries
      WHERE fiscal_year_id = ? AND verification_series = 'A'
      ORDER BY verification_number
    `,
      )
      .all(ctx.seed.fiscalYearId) as any[]
    expect(jes.length).toBe(3)
    expect(jes.map((j: any) => j.verification_number)).toEqual([1, 2, 3])

    // Dashboard revenue should not be duplicated
    const dashboard = ctx.dashboardService.getDashboardSummary(
      ctx.db,
      ctx.seed.fiscalYearId,
    )
    expect(dashboard.revenueOre).toBe(1000000) // 10 000 kr netto
  })

  it.skip('S01-05: betalning i annat räkenskapsår (requires cross-FY payment support)', () => {
    const customer = seedCustomer(ctx, { name: 'Tvåårs-kund' })
    const vatCode = getVatCode25Out(ctx)

    // Faktura i FY2026
    const draftResult = ctx.invoiceService.saveDraft(ctx.db, {
      counterparty_id: customer.id,
      fiscal_year_id: ctx.seed.fiscalYearId,
      invoice_date: '2026-12-15',
      due_date: '2027-01-14',
      lines: [
        {
          product_id: null,
          description: 'December-faktura',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: vatCode.id,
          sort_order: 0,
          account_number: '3002',
        },
      ],
    })
    expect(draftResult.success).toBe(true)
    if (!draftResult.success) return

    ctx.invoiceService.finalizeDraft(ctx.db, draftResult.data.id)

    // Skapa FY2027
    const fy2 = ctx.fiscalService.createNewFiscalYear(
      ctx.db,
      ctx.seed.companyId,
      ctx.seed.fiscalYearId,
      {
        confirmBookResult: true,
        netResultOre: ctx.openingBalanceService.calculateNetResult(
          ctx.db,
          ctx.seed.fiscalYearId,
        ),
      },
    )
    expect(fy2.fiscalYear.id).toBeGreaterThan(ctx.seed.fiscalYearId)

    // Betala i FY2027
    const inv = ctx.db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(draftResult.data.id) as any
    const payResult = ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: draftResult.data.id,
      amount: inv.total_amount_ore,
      payment_date: '2027-01-10',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(payResult.success).toBe(true)
    if (!payResult.success) return

    // Betalningsverifikation tillhör FY2027
    const payJe = ctx.db
      .prepare('SELECT * FROM journal_entries WHERE id = ?')
      .get(payResult.data.payment.journal_entry_id) as any
    expect(payJe.fiscal_year_id).toBe(fy2.fiscalYear.id)
  })

  it.skip('S01-06: kronologisk datumordning inom serie (not yet enforced in service layer)', () => {
    const customer = seedCustomer(ctx, { name: 'Kronologi-kund' })
    const vatCode = getVatCode25Out(ctx)

    const makeDraft = (date: string) => {
      const result = ctx.invoiceService.saveDraft(ctx.db, {
        counterparty_id: customer.id,
        fiscal_year_id: ctx.seed.fiscalYearId,
        invoice_date: date,
        due_date: '2026-04-30',
        lines: [
          {
            product_id: null,
            description: 'Test',
            quantity: 1,
            unit_price_ore: 10000,
            vat_code_id: vatCode.id,
            sort_order: 0,
            account_number: '3002',
          },
        ],
      })
      expect(result.success).toBe(true)
      if (!result.success) throw new Error(result.error)
      return result.data.id
    }

    // Finalisera 2026-03-15 → A1
    const id1 = makeDraft('2026-03-15')
    const r1 = ctx.invoiceService.finalizeDraft(ctx.db, id1)
    expect(r1.success).toBe(true)

    // Försök finalisera 2026-03-10 → SKA MISSLYCKAS (före senaste bokförda datum)
    const id2 = makeDraft('2026-03-10')
    const r2 = ctx.invoiceService.finalizeDraft(ctx.db, id2)
    expect(r2.success).toBe(false)

    // Finalisera 2026-03-15 (samma dag) → A2 OK
    const id3 = makeDraft('2026-03-15')
    const r3 = ctx.invoiceService.finalizeDraft(ctx.db, id3)
    expect(r3.success).toBe(true)

    // Finalisera 2026-03-20 → A3 OK
    const id4 = makeDraft('2026-03-20')
    const r4 = ctx.invoiceService.finalizeDraft(ctx.db, id4)
    expect(r4.success).toBe(true)
  })

  it('S01-07: gaplös fakturanumrering efter deletion av draft', () => {
    const customer = seedCustomer(ctx, { name: 'Gaplös-kund' })
    const vatCode = getVatCode25Out(ctx)

    const makeDraft = () => {
      const result = ctx.invoiceService.saveDraft(ctx.db, {
        counterparty_id: customer.id,
        fiscal_year_id: ctx.seed.fiscalYearId,
        invoice_date: '2026-03-15',
        due_date: '2026-04-14',
        lines: [
          {
            product_id: null,
            description: 'Test',
            quantity: 1,
            unit_price_ore: 10000,
            vat_code_id: vatCode.id,
            sort_order: 0,
            account_number: '3002',
          },
        ],
      })
      if (!result.success) throw new Error(result.error)
      return result.data.id
    }

    const draft1 = makeDraft()
    const draft2 = makeDraft()
    const draft3 = makeDraft()

    // Ta bort draft #2
    ctx.invoiceService.deleteDraft(ctx.db, draft2)

    // Finalisera #1 → fakturanr 1
    const r1 = ctx.invoiceService.finalizeDraft(ctx.db, draft1)
    expect(r1.success).toBe(true)
    if (!r1.success) return
    const inv1 = ctx.db
      .prepare('SELECT invoice_number FROM invoices WHERE id = ?')
      .get(draft1) as any
    expect(inv1.invoice_number).toBe('1')

    // Finalisera #3 → fakturanr 2 (inte 3)
    const r3 = ctx.invoiceService.finalizeDraft(ctx.db, draft3)
    expect(r3.success).toBe(true)
    if (!r3.success) return
    const inv3 = ctx.db
      .prepare('SELECT invoice_number FROM invoices WHERE id = ?')
      .get(draft3) as any
    expect(inv3.invoice_number).toBe('2')
  })

  it('S01-08: friform account_number i invoice_lines', () => {
    const customer = seedCustomer(ctx, { name: 'Friform-kund' })
    const vatCode = getVatCode25Out(ctx)

    const draftResult = ctx.invoiceService.saveDraft(ctx.db, {
      counterparty_id: customer.id,
      fiscal_year_id: ctx.seed.fiscalYearId,
      invoice_date: '2026-03-15',
      due_date: '2026-04-14',
      lines: [
        {
          product_id: null,
          description: 'Custom account',
          quantity: 1,
          unit_price_ore: 50000,
          vat_code_id: vatCode.id,
          sort_order: 0,
          account_number: '3001',
        },
      ],
    })
    expect(draftResult.success).toBe(true)
    if (!draftResult.success) return

    const r = ctx.invoiceService.finalizeDraft(ctx.db, draftResult.data.id)
    expect(r.success).toBe(true)
    if (!r.success) return

    const inv = ctx.db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(draftResult.data.id) as any
    const jels = ctx.db
      .prepare('SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?')
      .all(inv.journal_entry_id) as any[]

    // Should use 3001 (custom) instead of default 3002
    const credit3001 = jels.find(
      (l: any) => l.account_number === '3001' && l.credit_ore > 0,
    )
    expect(credit3001).toBeDefined()
  })

  it('S01-09: 0% moms (momsfri) — inga momskontorader', () => {
    const customer = seedCustomer(ctx, { name: 'Momsfri-kund' })
    const vatExempt = getVatCodeExempt(ctx)

    const draftResult = ctx.invoiceService.saveDraft(ctx.db, {
      counterparty_id: customer.id,
      fiscal_year_id: ctx.seed.fiscalYearId,
      invoice_date: '2026-03-15',
      due_date: '2026-04-14',
      lines: [
        {
          product_id: null,
          description: 'Momsfri tjänst',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: vatExempt.id,
          sort_order: 0,
          account_number: '3002',
        },
      ],
    })
    expect(draftResult.success).toBe(true)
    if (!draftResult.success) return

    const r = ctx.invoiceService.finalizeDraft(ctx.db, draftResult.data.id)
    expect(r.success).toBe(true)
    if (!r.success) return

    const inv = ctx.db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(draftResult.data.id) as any
    expect(inv.vat_amount_ore).toBe(0)

    const jels = ctx.db
      .prepare('SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?')
      .all(inv.journal_entry_id) as any[]

    // No VAT account lines (2610/2620/2630)
    const vatLines = jels.filter((l: any) =>
      ['2610', '2620', '2630'].includes(l.account_number),
    )
    expect(vatLines.length).toBe(0)

    // Should have only 1510 (debit) + 3002 (credit) = 2 lines
    expect(jels.length).toBe(2)

    // Balance
    const totalDebit = jels.reduce(
      (sum: number, l: any) => sum + l.debit_ore,
      0,
    )
    const totalCredit = jels.reduce(
      (sum: number, l: any) => sum + l.credit_ore,
      0,
    )
    expect(totalDebit).toBe(totalCredit)
  })
})
