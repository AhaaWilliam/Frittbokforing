/**
 * Session 34 — Cross-FY betalning (B7)
 *
 * Verifierar att fakturor och kostnader i FY2026 kan betalas i FY2027.
 * Betalningens journal_entry hamnar i FY2027 (payment_date-baserat).
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
  seedSupplier,
  seedAndFinalizeInvoice,
  seedAndFinalizeExpense,
  createSecondFiscalYear,
  type SystemTestContext,
} from './system/helpers/system-test-context'

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

describe('Cross-FY betalning (B7)', () => {
  function setupCrossFyInvoice() {
    vi.setSystemTime(new Date('2026-12-20T10:00:00'))
    const customer = seedCustomer(ctx, { name: 'Cross-FY-kund' })
    const { invoiceId } = seedAndFinalizeInvoice(ctx, {
      counterpartyId: customer.id,
      invoiceDate: '2026-12-15',
      dueDate: '2027-01-14',
    })
    return { customer, invoiceId }
  }

  function setupCrossFyExpense() {
    vi.setSystemTime(new Date('2026-12-20T10:00:00'))
    const supplier = seedSupplier(ctx, { name: 'Cross-FY-leverantör' })
    const { expenseId } = seedAndFinalizeExpense(ctx, {
      counterpartyId: supplier.id,
      expenseDate: '2026-12-15',
      dueDate: '2027-01-14',
    })
    return { supplier, expenseId }
  }

  function createFy2027() {
    return createSecondFiscalYear(ctx)
  }

  it('S01-05b: expense-betalning i annat räkenskapsår', () => {
    const { expenseId } = setupCrossFyExpense()

    const fy2 = createFy2027()
    expect(fy2.fiscalYear.id).toBeGreaterThan(ctx.seed.fiscalYearId)

    // Verify FY2027 has 12 periods
    const periodCount = ctx.db
      .prepare(
        'SELECT COUNT(*) as c FROM accounting_periods WHERE fiscal_year_id = ?',
      )
      .get(fy2.fiscalYear.id) as { c: number }
    expect(periodCount.c).toBe(12)

    // Verify O-serie i FY2027 inkluderar 2440-saldo (leverantörsskuld)
    const obLines = ctx.db
      .prepare(
        `
        SELECT jel.account_number, jel.debit_ore, jel.credit_ore
        FROM journal_entry_lines jel
        JOIN journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.fiscal_year_id = ? AND je.source_type = 'opening_balance'
        ORDER BY jel.account_number
      `,
      )
      .all(fy2.fiscalYear.id) as Array<{
      account_number: string
      debit_ore: number
      credit_ore: number
    }>
    const line2440 = obLines.find((l) => l.account_number === '2440')
    expect(line2440).toBeDefined()
    expect(line2440!.credit_ore).toBeGreaterThan(0)

    // Betala i FY2027
    vi.setSystemTime(new Date('2027-02-01T10:00:00'))

    const exp = ctx.db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(expenseId) as { total_amount_ore: number }

    const payResult = ctx.expenseService.payExpense(ctx.db, {
      expense_id: expenseId,
      amount_ore: exp.total_amount_ore,
      payment_date: '2027-01-15',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(payResult.success).toBe(true)
    if (!payResult.success) return

    // Payment JE tillhör FY2027
    const payJe = ctx.db
      .prepare('SELECT * FROM journal_entries WHERE id = ?')
      .get(payResult.data.payment.journal_entry_id) as any
    expect(payJe.fiscal_year_id).toBe(fy2.fiscalYear.id)

    // B-serie verifikationsnummer startar om i FY2027
    expect(payJe.verification_series).toBe('B')
    expect(payJe.verification_number).toBe(1)
  })

  it('Cross-FY: betalnings-JE hamnar i rätt FY (payment_date-baserat)', () => {
    const { invoiceId } = setupCrossFyInvoice()
    const fy2 = createFy2027()

    vi.setSystemTime(new Date('2027-02-01T10:00:00'))

    const inv = ctx.db
      .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
      .get(invoiceId) as { total_amount_ore: number }

    const payResult = ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: invoiceId,
      amount_ore: inv.total_amount_ore,
      payment_date: '2027-01-10',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(payResult.success).toBe(true)
    if (!payResult.success) return

    const payJe = ctx.db
      .prepare(
        'SELECT fiscal_year_id, verification_series, verification_number FROM journal_entries WHERE id = ?',
      )
      .get(payResult.data.payment.journal_entry_id) as any

    // JE tillhör FY2027, inte FY2026
    expect(payJe.fiscal_year_id).toBe(fy2.fiscalYear.id)
    expect(payJe.verification_series).toBe('A')
    expect(payJe.verification_number).toBe(1) // Första i FY2027 A-serie
  })

  it('Cross-FY: FY2026 stängd → betalning i FY2026 avvisas', () => {
    const { invoiceId } = setupCrossFyInvoice()
    const _fy2 = createFy2027() // FY2026 stängs automatiskt

    vi.setSystemTime(new Date('2027-02-01T10:00:00'))

    const inv = ctx.db
      .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
      .get(invoiceId) as { total_amount_ore: number }

    // Försök betala med datum i FY2026 (stängt)
    const payResult = ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: invoiceId,
      amount_ore: inv.total_amount_ore,
      payment_date: '2026-12-30',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(payResult.success).toBe(false)
  })

  it('Cross-FY: FY2027 öppen → betalning i FY2027 accepteras', () => {
    const { expenseId } = setupCrossFyExpense()
    createFy2027()

    vi.setSystemTime(new Date('2027-02-01T10:00:00'))

    const exp = ctx.db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(expenseId) as { total_amount_ore: number }

    const payResult = ctx.expenseService.payExpense(ctx.db, {
      expense_id: expenseId,
      amount_ore: exp.total_amount_ore,
      payment_date: '2027-01-15',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(payResult.success).toBe(true)
  })

  it('Cross-FY: O-serie i FY2027 inkluderar korrekt 1510/2440-saldo', () => {
    // Skapa och finalisera en faktura (ger 1510-fordran) och en kostnad (ger 2440-skuld)
    setupCrossFyInvoice()
    setupCrossFyExpense()

    const fy2 = createFy2027()

    const obLines = ctx.db
      .prepare(
        `
        SELECT jel.account_number, jel.debit_ore, jel.credit_ore
        FROM journal_entry_lines jel
        JOIN journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.fiscal_year_id = ? AND je.source_type = 'opening_balance'
        ORDER BY jel.account_number
      `,
      )
      .all(fy2.fiscalYear.id) as Array<{
      account_number: string
      debit_ore: number
      credit_ore: number
    }>

    // 1510 (kundfordran) bör ha debet-saldo
    const line1510 = obLines.find((l) => l.account_number === '1510')
    expect(line1510).toBeDefined()
    expect(line1510!.debit_ore).toBeGreaterThan(0)

    // 2440 (leverantörsskuld) bör ha kredit-saldo
    const line2440 = obLines.find((l) => l.account_number === '2440')
    expect(line2440).toBeDefined()
    expect(line2440!.credit_ore).toBeGreaterThan(0)
  })
})
