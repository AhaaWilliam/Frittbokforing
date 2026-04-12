/**
 * SEC04 — Finansiella invarianter som ALDRIG får brytas.
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
  type SystemTestContext,
} from './helpers/security-test-context'
import {
  seedAndFinalizeInvoice,
  seedAndPayInvoice,
  seedAndFinalizeExpense,
  seedAndPayExpense,
  seedManualEntry,
} from '../system/helpers/system-test-context'

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

describe('Finansiella invarianter', () => {
  it('SEC04-01: INVARIANT — varje booked journal_entry har balanserade lines', () => {
    // Bokför 10+ varierande transaktioner
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-01-15' })
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-02-15' })
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-03-15' })
    seedAndPayInvoice(ctx, {
      invoiceDate: '2026-04-15',
      paymentDate: '2026-04-20',
    })
    seedAndFinalizeExpense(ctx, { expenseDate: '2026-01-20' })
    seedAndFinalizeExpense(ctx, { expenseDate: '2026-02-20' })
    seedAndPayExpense(ctx, {
      expenseDate: '2026-03-20',
      paymentDate: '2026-03-25',
    })
    seedManualEntry(
      ctx,
      [
        { account_number: '6210', debit_ore: 50000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 50000 },
      ],
      { entryDate: '2026-04-01' },
    )
    seedManualEntry(
      ctx,
      [
        { account_number: '5010', debit_ore: 100000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100000 },
      ],
      { entryDate: '2026-05-01' },
    )

    // Check ALL booked entries
    const balances = ctx.db
      .prepare(
        `
      SELECT
        je.id,
        je.verification_series,
        je.verification_number,
        COALESCE(SUM(jel.debit_ore), 0) as total_debit,
        COALESCE(SUM(jel.credit_ore), 0) as total_credit
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      WHERE je.status = 'booked'
      GROUP BY je.id
    `,
      )
      .all() as any[]

    expect(balances.length).toBeGreaterThan(5) // At least 5 entries

    for (const row of balances) {
      expect(row.total_debit).toBe(row.total_credit)
    }
  })

  it('SEC04-02: INVARIANT — gaplös verifikationsnumrering per serie per FY', () => {
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-01-15' })
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-02-15' })
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-03-15' })
    seedAndFinalizeExpense(ctx, { expenseDate: '2026-01-20' })
    seedAndFinalizeExpense(ctx, { expenseDate: '2026-02-20' })
    seedManualEntry(
      ctx,
      [
        { account_number: '6210', debit_ore: 10000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 10000 },
      ],
      { entryDate: '2026-03-20' },
    )

    const entries = ctx.db
      .prepare(
        `
      SELECT verification_series, verification_number
      FROM journal_entries
      WHERE fiscal_year_id = ? AND status = 'booked' AND verification_number IS NOT NULL
      ORDER BY verification_series, verification_number
    `,
      )
      .all(ctx.seed.fiscalYearId) as any[]

    // Group by series
    const bySeriesMap = new Map<string, number[]>()
    for (const e of entries) {
      const arr = bySeriesMap.get(e.verification_series) ?? []
      arr.push(e.verification_number)
      bySeriesMap.set(e.verification_series, arr)
    }

    // Each series: numbers should be 1, 2, 3... without gaps
    for (const [series, numbers] of bySeriesMap) {
      for (let i = 0; i < numbers.length; i++) {
        expect(numbers[i]).toBe(i + 1)
      }
    }
  })

  it('SEC04-03: INVARIANT — fakturanumrering gaplös per FY', () => {
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-01-15' })
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-02-15' })
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-03-15' })

    const numbers = ctx.db
      .prepare(
        `
      SELECT CAST(invoice_number AS INTEGER) as num
      FROM invoices
      WHERE status != 'draft' AND fiscal_year_id = ?
      ORDER BY num
    `,
      )
      .all(ctx.seed.fiscalYearId) as any[]

    for (let i = 0; i < numbers.length; i++) {
      expect(numbers[i].num).toBe(i + 1)
    }
  })

  it('SEC04-04: INVARIANT — belopp alltid i öre (heltal)', () => {
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-03-15' })
    seedAndFinalizeExpense(ctx, { expenseDate: '2026-03-20' })

    // Check journal_entry_lines
    const lines = ctx.db
      .prepare('SELECT debit_ore, credit_ore FROM journal_entry_lines')
      .all() as any[]
    for (const line of lines) {
      expect(Number.isInteger(line.debit_ore)).toBe(true)
      expect(Number.isInteger(line.credit_ore)).toBe(true)
    }

    // Check invoices
    const invoices = ctx.db
      .prepare(
        'SELECT net_amount_ore, vat_amount_ore, total_amount_ore, paid_amount FROM invoices',
      )
      .all() as any[]
    for (const inv of invoices) {
      expect(Number.isInteger(inv.net_amount_ore)).toBe(true)
      expect(Number.isInteger(inv.vat_amount_ore)).toBe(true)
      expect(Number.isInteger(inv.total_amount_ore)).toBe(true)
      expect(Number.isInteger(inv.paid_amount)).toBe(true)
    }
  })

  it('SEC04-06: INVARIANT — BR balanserar efter varje transaktion', () => {
    // After each transaction, balance sheet should balance
    const checkBalance = () => {
      const br = ctx.reportService.getBalanceSheet(
        ctx.db,
        ctx.seed.fiscalYearId,
      )
      expect(br.balanceDifference).toBe(0)
    }

    // Empty state
    checkBalance()

    // After invoice
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-01-15' })
    checkBalance()

    // After expense
    seedAndFinalizeExpense(ctx, { expenseDate: '2026-02-15' })
    checkBalance()

    // After manual entry
    seedManualEntry(
      ctx,
      [
        { account_number: '6210', debit_ore: 30000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 30000 },
      ],
      { entryDate: '2026-03-15' },
    )
    checkBalance()

    // After payment
    const inv = ctx.db
      .prepare(
        "SELECT id, total_amount_ore FROM invoices WHERE status = 'unpaid' LIMIT 1",
      )
      .get() as any
    if (inv) {
      ctx.invoiceService.payInvoice(ctx.db, {
        invoice_id: inv.id,
        amount: inv.total_amount_ore,
        payment_date: '2026-04-15',
        payment_method: 'bank',
        account_number: '1930',
      })
      checkBalance()
    }
  })

  it('SEC04-08: belopp = 0 — betalning med 0 kr ska avvisas', () => {
    const { invoiceId } = seedAndFinalizeInvoice(ctx, {
      invoiceDate: '2026-03-15',
    })

    const result = ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: invoiceId,
      amount: 0,
      payment_date: '2026-03-20',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(result.success).toBe(false)
  })
})
