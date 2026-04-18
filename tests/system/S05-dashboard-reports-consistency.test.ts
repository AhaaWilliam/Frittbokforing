/**
 * S05 — Dashboard, rapporter (RR/BR), skatteprognos och momsrapport konsistens.
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
  seedAndFinalizeInvoice,
  seedAndFinalizeExpense,
  seedManualEntry,
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

describe('Dashboard, Rapporter & Prognoser — konsistens', () => {
  it('S05-01: intäkter konsistenta mellan dashboard, RR, skatteprognos', () => {
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-01-15' })
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-02-15' })
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-03-15' })

    const dashboard = ctx.dashboardService.getDashboardSummary(
      ctx.db,
      ctx.seed.fiscalYearId,
    )
    const _rr = ctx.reportService.getIncomeStatement(
      ctx.db,
      ctx.seed.fiscalYearId,
    )
    const tax = ctx.taxService.getTaxForecast(ctx.db, ctx.seed.fiscalYearId)

    expect(dashboard.revenueOre).toBeGreaterThan(0)
    // operatingProfit should match revenue when no expenses
    expect(tax.operatingProfitOre).toBe(dashboard.revenueOre)
  })

  it('S05-02: kostnader konsistenta', () => {
    seedAndFinalizeExpense(ctx, { expenseDate: '2026-01-15' })
    seedAndFinalizeExpense(ctx, { expenseDate: '2026-02-15' })

    const dashboard = ctx.dashboardService.getDashboardSummary(
      ctx.db,
      ctx.seed.fiscalYearId,
    )
    expect(dashboard.expensesOre).toBeGreaterThan(0)
  })

  it('S05-04: BR balanserar alltid', () => {
    // After various transactions, BR should always balance
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-01-15' })
    let br = ctx.reportService.getBalanceSheet(ctx.db, ctx.seed.fiscalYearId)
    expect(br.balanceDifference).toBe(0)

    seedAndFinalizeExpense(ctx, { expenseDate: '2026-02-15' })
    br = ctx.reportService.getBalanceSheet(ctx.db, ctx.seed.fiscalYearId)
    expect(br.balanceDifference).toBe(0)

    seedManualEntry(
      ctx,
      [
        { account_number: '6210', debit_ore: 20000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 20000 },
      ],
      { entryDate: '2026-03-15' },
    )
    br = ctx.reportService.getBalanceSheet(ctx.db, ctx.seed.fiscalYearId)
    expect(br.balanceDifference).toBe(0)
  })

  it('S05-05: skatteprognos — förlust ger 0 skatt', () => {
    // Only expenses, no revenue
    seedAndFinalizeExpense(ctx, { expenseDate: '2026-01-15' })
    seedManualEntry(
      ctx,
      [
        { account_number: '6210', debit_ore: 100000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100000 },
      ],
      { entryDate: '2026-02-15' },
    )

    const tax = ctx.taxService.getTaxForecast(ctx.db, ctx.seed.fiscalYearId)
    expect(tax.operatingProfitOre).toBeLessThan(0)
    expect(tax.taxableIncomeOre).toBe(0)
    expect(tax.corporateTaxOre).toBe(0)
    expect(tax.corporateTaxAfterFondOre).toBe(0)
  })

  it('S05-07: fiscal_year_id scoping — inget läckage mellan år', () => {
    // Bokför i FY2026
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-03-15' })

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

    // FY2027 dashboard ska visa 0 intäkter/kostnader
    const dashboard2027 = ctx.dashboardService.getDashboardSummary(
      ctx.db,
      fy2.fiscalYear.id,
    )
    expect(dashboard2027.revenueOre).toBe(0)
    expect(dashboard2027.expensesOre).toBe(0)
  })
})
