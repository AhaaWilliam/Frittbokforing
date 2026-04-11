/**
 * S09 — Edge cases och gränsfall.
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
  seedAndFinalizeInvoice,
  seedAndFinalizeExpense,
  seedManualEntry,
  getVatCode25Out,
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

describe('Edge cases och gränsfall', () => {
  it('S09-01: unicode i alla textfält', () => {
    // Kundnamn med specialtecken
    const customer = seedCustomer(ctx, { name: "Företag 'Special' & <Test>" })
    expect(customer.name).toBe("Företag 'Special' & <Test>")

    const fetched = ctx.counterpartyService.getCounterparty(ctx.db, customer.id)
    expect(fetched?.name).toBe("Företag 'Special' & <Test>")
  })

  it('S09-03: tom databas — alla endpoints returnerar tomma resultat', () => {
    // listInvoices — check via DB directly
    const invoiceCount = ctx.db
      .prepare(
        "SELECT COUNT(*) as cnt FROM invoices WHERE fiscal_year_id = ? AND status != 'draft'",
      )
      .get(ctx.seed.fiscalYearId) as any
    expect(invoiceCount.cnt).toBe(0)

    // getDashboardSummary
    const dashboard = ctx.dashboardService.getDashboardSummary(
      ctx.db,
      ctx.seed.fiscalYearId,
    )
    expect(dashboard.revenueOre).toBe(0)
    expect(dashboard.expensesOre).toBe(0)
    expect(dashboard.operatingResultOre).toBe(0)

    // getVatReport
    const vatReport = ctx.vatReportService.getVatReport(
      ctx.db,
      ctx.seed.fiscalYearId,
    )
    expect(vatReport.quarters.length).toBe(4)
    for (const q of vatReport.quarters) {
      expect(q.vatOutTotalOre).toBe(0)
      expect(q.vatInOre).toBe(0)
    }

    // getIncomeStatement
    const rr = ctx.reportService.getIncomeStatement(
      ctx.db,
      ctx.seed.fiscalYearId,
    )
    expect(rr.netResult).toBe(0)

    // SIE4/SIE5 — no crash
    const sie4 = ctx.sie4ExportService.exportSie4(ctx.db, {
      fiscalYearId: ctx.seed.fiscalYearId,
    })
    expect(sie4.content.length).toBeGreaterThan(0)

    const sie5 = ctx.sie5ExportService.exportSie5(ctx.db, {
      fiscalYearId: ctx.seed.fiscalYearId,
    })
    expect(sie5.length).toBeGreaterThan(0)
  })

  it('S09-04: SQLite WAL mode aktiv', () => {
    const mode = ctx.db.pragma('journal_mode', { simple: true })
    expect(mode).toBe('wal')
  })

  it('S09-08: åter-finalisering av samma draft blockeras', () => {
    const { invoiceId } = seedAndFinalizeInvoice(ctx, {
      invoiceDate: '2026-03-15',
    })

    // Försök finalisera igen — ska misslyckas (already unpaid, not draft)
    const result = ctx.invoiceService.finalizeDraft(ctx.db, invoiceId)
    expect(result.success).toBe(false)
  })

  it('S09-09: payment_date === invoice_date OK', () => {
    const customer = seedCustomer(ctx, { name: 'Samdagskund' })
    const vatCode = getVatCode25Out(ctx)

    const draftResult = ctx.invoiceService.saveDraft(ctx.db, {
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
    expect(draftResult.success).toBe(true)
    if (!draftResult.success) return

    ctx.invoiceService.finalizeDraft(ctx.db, draftResult.data.id)
    const inv = ctx.db
      .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
      .get(draftResult.data.id) as any

    // Betala samma dag som fakturadatum
    const payResult = ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: draftResult.data.id,
      amount: inv.total_amount_ore,
      payment_date: '2026-03-15', // Samma dag!
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(payResult.success).toBe(true)
  })

  it('S09-10: stäng period → öppna → bokför → stäng igen', () => {
    const periods = ctx.seed.periods

    // Stäng januari
    ctx.fiscalService.closePeriod(ctx.db, periods[0].id)

    // Öppna januari
    ctx.fiscalService.reopenPeriod(ctx.db, periods[0].id)

    // Bokför i januari
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-01-15' })

    // Stäng januari igen
    const closeResult = ctx.fiscalService.closePeriod(ctx.db, periods[0].id)
    expect(closeResult.success).toBe(true)
  })

  it('S09-05: todayLocal med mockad tid', async () => {
    // Med vi.setSystemTime('2026-06-15T10:00:00') i beforeEach
    const { todayLocal } = await import('../../src/shared/date-utils')
    expect(todayLocal()).toBe('2026-06-15')
  })
})
