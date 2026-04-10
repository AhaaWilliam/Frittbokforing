/**
 * S03 — Manuella verifikationer (C-serie).
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
  seedManualEntry,
  seedAndFinalizeInvoice,
  seedAndFinalizeExpense,
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

describe('Manuella verifikationer — C-serie', () => {
  it('S03-01: skapa draft → finalisera → syns i rapporter', () => {
    const { journalEntryId, verificationNumber } = seedManualEntry(ctx, [
      {
        account_number: '6210',
        debit_amount: 50000,
        credit_amount: 0,
        description: 'Tele',
      },
      {
        account_number: '1930',
        debit_amount: 0,
        credit_amount: 50000,
        description: 'Bank',
      },
    ])

    expect(verificationNumber).toBe(1)

    // C-serie
    const je = ctx.db
      .prepare('SELECT * FROM journal_entries WHERE id = ?')
      .get(journalEntryId) as any
    expect(je.verification_series).toBe('C')

    // Dashboard: costs inkluderar 500 kr
    const dashboard = ctx.dashboardService.getDashboardSummary(
      ctx.db,
      ctx.seed.fiscalYearId,
    )
    expect(dashboard.expensesOre).toBe(50000)

    // RR
    const rr = ctx.reportService.getIncomeStatement(
      ctx.db,
      ctx.seed.fiscalYearId,
    )
    expect(rr.netResult).toBeLessThan(0) // Expense means negative result

    // BR
    const br = ctx.reportService.getBalanceSheet(ctx.db, ctx.seed.fiscalYearId)
    expect(br.balanceDifference).toBe(0) // Alltid balanserad
  })

  it('S03-02: balansvalidering — obalanserad verifikation avvisas', () => {
    const result = ctx.manualEntryService.saveManualEntryDraft(ctx.db, {
      fiscal_year_id: ctx.seed.fiscalYearId,
      entry_date: '2026-03-15',
      description: 'Obalanserad',
      lines: [
        {
          line_number: 1,
          account_number: '6210',
          debit_amount: 50000,
          credit_amount: 0,
          description: '',
        },
        {
          line_number: 2,
          account_number: '1930',
          debit_amount: 0,
          credit_amount: 49900,
          description: '',
        },
      ],
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    // Finalisera → ska kasta error (debit ≠ credit)
    const finalizeResult = ctx.manualEntryService.finalizeManualEntry(
      ctx.db,
      result.data.id,
      ctx.seed.fiscalYearId,
    )
    expect(finalizeResult.success).toBe(false)
  })

  it('S03-03: C-serie oberoende av A och B', () => {
    // A1 - kundfaktura
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-03-15' })

    // B1 - leverantörsfaktura
    seedAndFinalizeExpense(ctx, { expenseDate: '2026-03-15' })

    // C1 - manuell
    const { verificationNumber } = seedManualEntry(
      ctx,
      [
        { account_number: '6210', debit_amount: 10000, credit_amount: 0 },
        { account_number: '1930', debit_amount: 0, credit_amount: 10000 },
      ],
      { entryDate: '2026-03-15' },
    )
    expect(verificationNumber).toBe(1) // C1, inte A3 eller B2

    // A2 - ännu en kundfaktura
    seedAndFinalizeInvoice(ctx, {
      invoiceDate: '2026-03-16',
    })

    // Verify series independence via DB query
    const series = ctx.db
      .prepare(
        `
      SELECT verification_series, verification_number
      FROM journal_entries
      WHERE fiscal_year_id = ? AND status = 'booked' AND verification_number IS NOT NULL
      ORDER BY verification_series, verification_number
    `,
      )
      .all(ctx.seed.fiscalYearId) as any[]

    const aSeries = series.filter((s: any) => s.verification_series === 'A')
    const bSeries = series.filter((s: any) => s.verification_series === 'B')
    const cSeries = series.filter((s: any) => s.verification_series === 'C')

    expect(aSeries.length).toBe(2)
    expect(bSeries.length).toBe(1)
    expect(cSeries.length).toBe(1)
    expect(aSeries[0].verification_number).toBe(1)
    expect(aSeries[1].verification_number).toBe(2)
    expect(bSeries[0].verification_number).toBe(1)
    expect(cSeries[0].verification_number).toBe(1)
  })

  it('S03-04: tomma rader filtreras bort', () => {
    const result = ctx.manualEntryService.saveManualEntryDraft(ctx.db, {
      fiscal_year_id: ctx.seed.fiscalYearId,
      entry_date: '2026-03-15',
      description: 'Med tomma rader',
      lines: [
        {
          line_number: 1,
          account_number: '6210',
          debit_amount: 50000,
          credit_amount: 0,
          description: '',
        },
        {
          line_number: 2,
          account_number: '',
          debit_amount: 0,
          credit_amount: 0,
          description: '',
        },
        {
          line_number: 3,
          account_number: '1930',
          debit_amount: 0,
          credit_amount: 50000,
          description: '',
        },
        {
          line_number: 4,
          account_number: '',
          debit_amount: 0,
          credit_amount: 0,
          description: '',
        },
        {
          line_number: 5,
          account_number: '',
          debit_amount: 0,
          credit_amount: 0,
          description: '',
        },
      ],
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const finalizeResult = ctx.manualEntryService.finalizeManualEntry(
      ctx.db,
      result.data.id,
      ctx.seed.fiscalYearId,
    )
    expect(finalizeResult.success).toBe(true)
    if (!finalizeResult.success) return

    // Journal entry lines should only have 2 (not 5)
    const jels = ctx.db
      .prepare('SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?')
      .all(finalizeResult.data.journalEntryId) as any[]
    expect(jels.length).toBe(2)
  })
})
