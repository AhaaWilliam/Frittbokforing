import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import {
  saveExpenseDraft,
  finalizeExpense,
  payExpense,
  getExpensePayments,
  getExpense,
} from '../src/main/services/expense-service'

let db: Database.Database

const VALID_COMPANY = {
  name: 'Test AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2025-01-15',
  fiscal_year_start: '2025-01-01',
  fiscal_year_end: '2025-12-31',
}

function seedAll(testDb: Database.Database) {
  createCompany(testDb, VALID_COMPANY)
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  const supplier = createCounterparty(testDb, {
    name: 'Leverantör AB',
    type: 'supplier',
  })
  if (!supplier.success) throw new Error('Supplier creation failed')
  const vatCode = testDb
    .prepare("SELECT id FROM vat_codes WHERE vat_type = 'incoming' LIMIT 1")
    .get() as { id: number }
  return {
    fiscalYearId: fy.id,
    supplierId: supplier.data.id,
    vatCodeId: vatCode.id,
  }
}

function createUnpaidExpense(
  testDb: Database.Database,
  seed: ReturnType<typeof seedAll>,
  opts?: { totalOre?: number; date?: string },
) {
  const unitPrice = opts?.totalOre ?? 125000 // 1250 kr default
  const date = opts?.date ?? '2025-03-15'
  const draftResult = saveExpenseDraft(testDb, {
    fiscal_year_id: seed.fiscalYearId,
    counterparty_id: seed.supplierId,
    expense_date: date,
    description: 'Test expense',
    payment_terms: 30,
    notes: '',
    lines: [
      {
        description: 'Test line',
        account_number: '5010',
        quantity: 1,
        unit_price_ore: unitPrice,
        vat_code_id: seed.vatCodeId,
      },
    ],
  })
  if (!draftResult.success)
    throw new Error('Draft failed: ' + draftResult.error)
  const expenseId = draftResult.data.id

  const finalizeResult = finalizeExpense(testDb, expenseId)
  if (!finalizeResult.success)
    throw new Error('Finalize failed: ' + finalizeResult.error)

  // Get actual total (may differ from input due to VAT processing)
  const expense = testDb
    .prepare('SELECT * FROM expenses WHERE id = ?')
    .get(expenseId) as { id: number; total_amount_ore: number; status: string }
  return { expenseId, expense }
}

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  db.close()
})

// ═══════════════════════════════════════════════════════════
// MIGRATION 010
// ═══════════════════════════════════════════════════════════
describe('Session 11: Migration 010', () => {
  it('expense_payments table exists with correct columns', () => {
    const columns = db.pragma('table_info(expense_payments)') as {
      name: string
      type: string
    }[]
    const colNames = columns.map((c) => c.name)
    expect(colNames).toContain('id')
    expect(colNames).toContain('expense_id')
    expect(colNames).toContain('journal_entry_id')
    expect(colNames).toContain('payment_date')
    expect(colNames).toContain('amount_ore')
    expect(colNames).toContain('payment_method')
    expect(colNames).toContain('account_number')
    expect(colNames).toContain('created_at')
  })

  it('PRAGMA user_version = 10', () => {
    const version = db.pragma('user_version', { simple: true }) as number
    expect(version).toBe(23) // S42: Uppdatera vid nya migrationer
  })

  it('expense payments use auto_payment source_type in B-series', () => {
    const seed = seedAll(db)
    // auto_payment is already allowed by CHECK constraint
    const result = db
      .prepare(
        `INSERT INTO journal_entries (company_id, fiscal_year_id, verification_number, verification_series,
        journal_date, description, status, source_type)
       VALUES ((SELECT id FROM companies LIMIT 1), ?, 999, 'B', '2025-06-01', 'test', 'draft', 'auto_payment')`,
      )
      .run(seed.fiscalYearId)
    expect(result.changes).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════
// KONTERING (5 tester)
// ═══════════════════════════════════════════════════════════
describe('Session 11: payExpense — kontering', () => {
  it('full payment creates correct journal entry in B-series', () => {
    const seed = seedAll(db)
    const { expenseId, expense } = createUnpaidExpense(db, seed)

    const result = payExpense(db, {
      expense_id: expenseId,
      amount_ore: expense.total_amount_ore,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    // Verify B-series
    const je = db
      .prepare('SELECT * FROM journal_entries WHERE id = ?')
      .get(result.data.payment.journal_entry_id) as {
      verification_series: string
      status: string
      source_type: string
    }
    expect(je.verification_series).toBe('B')
    expect(je.status).toBe('booked')
    expect(je.source_type).toBe('auto_payment')

    // Verify lines
    const lines = db
      .prepare(
        'SELECT * FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
      )
      .all(result.data.payment.journal_entry_id) as {
      account_number: string
      debit_ore: number
      credit_ore: number
    }[]

    // DEBET 2440
    const debit2440 = lines.find(
      (l) => l.account_number === '2440' && l.debit_ore > 0,
    )
    expect(debit2440).toBeDefined()
    expect(debit2440!.debit_ore).toBe(expense.total_amount_ore)

    // KREDIT 1930
    const credit1930 = lines.find(
      (l) => l.account_number === '1930' && l.credit_ore > 0,
    )
    expect(credit1930).toBeDefined()
    expect(credit1930!.credit_ore).toBe(expense.total_amount_ore)

    // Balance
    const totalDebit = lines.reduce((s, l) => s + l.debit_ore, 0)
    const totalCredit = lines.reduce((s, l) => s + l.credit_ore, 0)
    expect(totalDebit).toBe(totalCredit)

    // Expense status
    expect(result.data.expense.status).toBe('paid')
  })

  it('partial payment sets status to partial', () => {
    const seed = seedAll(db)
    const { expenseId, expense } = createUnpaidExpense(db, seed)
    const partialAmount = Math.floor(expense.total_amount_ore / 2)

    const result = payExpense(db, {
      expense_id: expenseId,
      amount_ore: partialAmount,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.expense.status).toBe('partial')
  })

  it('final payment on partial expense sets status to paid', () => {
    const seed = seedAll(db)
    const { expenseId, expense } = createUnpaidExpense(db, seed)
    const half = Math.floor(expense.total_amount_ore / 2)
    const rest = expense.total_amount_ore - half

    // First partial
    payExpense(db, {
      expense_id: expenseId,
      amount_ore: half,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })

    // Final payment
    const result = payExpense(db, {
      expense_id: expenseId,
      amount_ore: rest,
      payment_date: '2025-03-21',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.expense.status).toBe('paid')
  })

  it('overpayment is blocked', () => {
    const seed = seedAll(db)
    const { expenseId, expense } = createUnpaidExpense(db, seed)

    const result = payExpense(db, {
      expense_id: expenseId,
      amount_ore: expense.total_amount_ore + 10000,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('OVERPAYMENT')
  })

  it('verification number in B-series, sequential', () => {
    const seed = seedAll(db)
    // Finalize creates B1
    const { expenseId: e1, expense: exp1 } = createUnpaidExpense(db, seed)
    // Pay creates B2
    payExpense(db, {
      expense_id: e1,
      amount_ore: exp1.total_amount_ore,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })

    // Second finalize = B3
    const { expenseId: e2, expense: exp2 } = createUnpaidExpense(db, seed, {
      date: '2025-03-21',
    })
    // Pay creates B4
    const result = payExpense(db, {
      expense_id: e2,
      amount_ore: exp2.total_amount_ore,
      payment_date: '2025-03-22',
      payment_method: 'swish',
      account_number: '1930',
    })
    expect(result.success).toBe(true)

    const entries = db
      .prepare(
        "SELECT verification_number FROM journal_entries WHERE verification_series = 'B' ORDER BY verification_number",
      )
      .all() as { verification_number: number }[]

    // B1=finalize1, B2=pay1, B3=finalize2, B4=pay2
    expect(entries.map((e) => e.verification_number)).toEqual([1, 2, 3, 4])
  })
})

// ═══════════════════════════════════════════════════════════
// ÖRESUTJÄMNING (2 tester)
// ═══════════════════════════════════════════════════════════
describe('Session 11: payExpense — öresutjämning', () => {
  it('rounding adjustment when remaining <= 50 öre (underpayment)', () => {
    const seed = seedAll(db)
    // Create expense and manually set a total that creates a rounding scenario
    const { expenseId } = createUnpaidExpense(db, seed)

    // Set total to 100050 öre (1000,50 kr) manually
    db.prepare(
      'UPDATE expenses SET total_amount_ore = 100050 WHERE id = ?',
    ).run(expenseId)

    const result = payExpense(db, {
      expense_id: expenseId,
      amount_ore: 100000, // 1000 kr — remaining 50 öre
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    // Should auto-round and set paid
    expect(result.data.expense.status).toBe('paid')

    // Verify journal lines
    const lines = db
      .prepare(
        'SELECT * FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
      )
      .all(result.data.payment.journal_entry_id) as {
      account_number: string
      debit_ore: number
      credit_ore: number
    }[]

    // DEBET 2440: 100050 (entire debt)
    const debit2440 = lines.find(
      (l) => l.account_number === '2440' && l.debit_ore > 0,
    )
    expect(debit2440!.debit_ore).toBe(100050)

    // KREDIT 1930: 100000 (actual payment)
    const credit1930 = lines.find(
      (l) => l.account_number === '1930' && l.credit_ore > 0,
    )
    expect(credit1930!.credit_ore).toBe(100000)

    // KREDIT 3740: 50 (rounding)
    const credit3740 = lines.find(
      (l) => l.account_number === '3740' && l.credit_ore > 0,
    )
    expect(credit3740!.credit_ore).toBe(50)

    // Balance
    const totalDebit = lines.reduce((s, l) => s + l.debit_ore, 0)
    const totalCredit = lines.reduce((s, l) => s + l.credit_ore, 0)
    expect(totalDebit).toBe(totalCredit)
  })

  it('no rounding when remaining > 50 öre', () => {
    const seed = seedAll(db)
    const { expenseId, expense } = createUnpaidExpense(db, seed)
    const partialAmount = expense.total_amount_ore - 1000 // leave 1000 öre

    const result = payExpense(db, {
      expense_id: expenseId,
      amount_ore: partialAmount,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.expense.status).toBe('partial')

    // No 3740 line
    const lines = db
      .prepare(
        "SELECT account_number FROM journal_entry_lines WHERE journal_entry_id = ? AND account_number = '3740'",
      )
      .all(result.data.payment.journal_entry_id)
    expect(lines.length).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════
// VALIDERING (5 tester)
// ═══════════════════════════════════════════════════════════
describe('Session 11: payExpense — validering', () => {
  it('rejects draft expense', () => {
    const seed = seedAll(db)
    // Create draft but don't finalize
    const draftResult = saveExpenseDraft(db, {
      fiscal_year_id: seed.fiscalYearId,
      counterparty_id: seed.supplierId,
      expense_date: '2025-03-15',
      description: 'Draft expense',
      payment_terms: 30,
      notes: '',
      lines: [
        {
          description: 'Line',
          account_number: '5010',
          quantity: 1,
          unit_price_ore: 100000,
          vat_code_id: seed.vatCodeId,
        },
      ],
    })
    if (!draftResult.success) throw new Error('Draft failed')

    const result = payExpense(db, {
      expense_id: draftResult.data.id,
      amount_ore: 100000,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('EXPENSE_NOT_PAYABLE')
  })

  it('rejects already paid expense', () => {
    const seed = seedAll(db)
    const { expenseId, expense } = createUnpaidExpense(db, seed)

    // Pay fully first
    payExpense(db, {
      expense_id: expenseId,
      amount_ore: expense.total_amount_ore,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })

    // Try again
    const result = payExpense(db, {
      expense_id: expenseId,
      amount_ore: 1000,
      payment_date: '2025-03-21',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('EXPENSE_NOT_PAYABLE')
  })

  it('rejects closed period', () => {
    const seed = seedAll(db)
    const { expenseId, expense } = createUnpaidExpense(db, seed)

    // Close the period
    db.prepare(
      "UPDATE accounting_periods SET is_closed = 1 WHERE fiscal_year_id = ? AND '2025-03-20' BETWEEN start_date AND end_date",
    ).run(seed.fiscalYearId)

    const result = payExpense(db, {
      expense_id: expenseId,
      amount_ore: expense.total_amount_ore,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('YEAR_IS_CLOSED')
  })

  it('rejects future payment date', () => {
    const seed = seedAll(db)
    const { expenseId, expense } = createUnpaidExpense(db, seed)

    const result = payExpense(db, {
      expense_id: expenseId,
      amount_ore: expense.total_amount_ore,
      payment_date: '2099-01-01',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('rejects payment date before expense date', () => {
    const seed = seedAll(db)
    const { expenseId, expense } = createUnpaidExpense(db, seed, {
      date: '2025-03-15',
    })

    const result = payExpense(db, {
      expense_id: expenseId,
      amount_ore: expense.total_amount_ore,
      payment_date: '2025-03-10',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('PAYMENT_BEFORE_EXPENSE')
  })
})

// ═══════════════════════════════════════════════════════════
// INTEGRATION (5 tester)
// ═══════════════════════════════════════════════════════════
describe('Session 11: Integration', () => {
  it('getExpensePayments returns payment history', () => {
    const seed = seedAll(db)
    const { expenseId, expense } = createUnpaidExpense(db, seed)
    const half = Math.floor(expense.total_amount_ore / 2)

    payExpense(db, {
      expense_id: expenseId,
      amount_ore: half,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })

    const payments = getExpensePayments(db, expenseId)
    expect(payments).toHaveLength(1)
    expect(payments[0].amount_ore).toBe(half)
    expect(payments[0].payment_date).toBe('2025-03-20')
    expect(payments[0].payment_method).toBe('bankgiro')
  })

  it('multiple partial payments tracked correctly', () => {
    const seed = seedAll(db)
    const { expenseId, expense } = createUnpaidExpense(db, seed)
    const third = Math.floor(expense.total_amount_ore / 3)

    payExpense(db, {
      expense_id: expenseId,
      amount_ore: third,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    payExpense(db, {
      expense_id: expenseId,
      amount_ore: third,
      payment_date: '2025-03-21',
      payment_method: 'swish',
      account_number: '1930',
    })

    const payments = getExpensePayments(db, expenseId)
    expect(payments).toHaveLength(2)

    const totalPaid = payments.reduce(
      (s: number, p: { amount_ore: number }) => s + p.amount_ore,
      0,
    )
    expect(totalPaid).toBe(third * 2)
  })

  it('getExpense returns total_paid and remaining', () => {
    const seed = seedAll(db)
    const { expenseId, expense } = createUnpaidExpense(db, seed)
    const half = Math.floor(expense.total_amount_ore / 2)

    payExpense(db, {
      expense_id: expenseId,
      amount_ore: half,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })

    const result = getExpense(db, expenseId)
    expect(result.success).toBe(true)
    if (!result.success || !result.data) return
    expect(result.data.total_paid).toBe(half)
    expect(result.data.remaining).toBe(expense.total_amount_ore - half)
  })

  it('payment scoped to payment date fiscal year (M8)', () => {
    const seed = seedAll(db)
    // Create fiscal year 2026
    db.prepare(
      "INSERT INTO fiscal_years (company_id, year_label, start_date, end_date, is_closed, annual_report_status) VALUES ((SELECT id FROM companies LIMIT 1), '2026', '2026-01-01', '2026-12-31', 0, 'not_started')",
    ).run()
    const fy2026 = db
      .prepare("SELECT id FROM fiscal_years WHERE year_label = '2026'")
      .get() as { id: number }
    // Create periods for 2026
    const companyId = (
      db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: number }
    ).id
    for (let m = 1; m <= 12; m++) {
      const start = `2026-${String(m).padStart(2, '0')}-01`
      const endDay = new Date(2026, m, 0).getDate()
      const end = `2026-${String(m).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
      db.prepare(
        'INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date, is_closed) VALUES (?, ?, ?, ?, ?, 0)',
      ).run(companyId, fy2026.id, m, start, end)
    }

    // Create expense in 2025
    const { expenseId, expense } = createUnpaidExpense(db, seed, {
      date: '2025-12-15',
    })

    // Pay in 2026
    const result = payExpense(db, {
      expense_id: expenseId,
      amount_ore: expense.total_amount_ore,
      payment_date: '2026-01-10',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    // Verify: journal entry is in FY 2026
    const je = db
      .prepare(
        'SELECT fiscal_year_id, verification_series, verification_number FROM journal_entries WHERE id = ?',
      )
      .get(result.data.payment.journal_entry_id) as {
      fiscal_year_id: number
      verification_series: string
      verification_number: number
    }
    expect(je.fiscal_year_id).toBe(fy2026.id)
    expect(je.verification_series).toBe('B')
    expect(je.verification_number).toBe(1) // First B-entry in 2026
  })

  it('downward rounding adjustment (payment exceeds remaining by ≤50 öre)', () => {
    const seed = seedAll(db)
    const { expenseId } = createUnpaidExpense(db, seed)

    // Set total to 99950 öre (999,50 kr)
    db.prepare('UPDATE expenses SET total_amount_ore = 99950 WHERE id = ?').run(
      expenseId,
    )

    // Pay 100000 (1000 kr) — 50 öre too much
    const result = payExpense(db, {
      expense_id: expenseId,
      amount_ore: 100000,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.expense.status).toBe('paid')

    // Verify lines
    const lines = db
      .prepare(
        'SELECT * FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
      )
      .all(result.data.payment.journal_entry_id) as {
      account_number: string
      debit_ore: number
      credit_ore: number
    }[]

    // DEBET 2440: 99950 (entire debt, not more)
    const debit2440 = lines.find(
      (l) => l.account_number === '2440' && l.debit_ore > 0,
    )
    expect(debit2440!.debit_ore).toBe(99950)

    // KREDIT 1930: 100000 (actual cash out)
    const credit1930 = lines.find(
      (l) => l.account_number === '1930' && l.credit_ore > 0,
    )
    expect(credit1930!.credit_ore).toBe(100000)

    // DEBET 3740: 50 (we paid more than debt)
    const debit3740 = lines.find(
      (l) => l.account_number === '3740' && l.debit_ore > 0,
    )
    expect(debit3740!.debit_ore).toBe(50)

    // Balance: 99950 + 50 = 100000
    const totalDebit = lines.reduce((s, l) => s + l.debit_ore, 0)
    const totalCredit = lines.reduce((s, l) => s + l.credit_ore, 0)
    expect(totalDebit).toBe(100000)
    expect(totalCredit).toBe(100000)
  })
})
