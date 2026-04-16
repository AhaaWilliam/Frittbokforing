import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import {
  saveDraft,
  finalizeDraft,
  payInvoice,
  listInvoices,
} from '../src/main/services/invoice-service'
import {
  saveExpenseDraft,
  finalizeExpense,
  payExpense,
  listExpenses,
  getExpense,
} from '../src/main/services/expense-service'
import { getDashboardSummary } from '../src/main/services/dashboard-service'
import { getAllJournalEntryLines } from '../src/main/services/export/export-data-queries'
import type { Expense } from '../src/shared/types'

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

function seedInvoice(testDb: Database.Database) {
  createCompany(testDb, VALID_COMPANY)
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  const cp = createCounterparty(testDb, { name: 'Kund AB', type: 'customer' })
  if (!cp.success) throw new Error('CP failed')
  const vatCode = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
    .get() as { id: number }
  const account = testDb
    .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
    .get() as { id: number }
  const product = createProduct(testDb, {
    name: 'Konsult',
    default_price_ore: 100000,
    vat_code_id: vatCode.id,
    account_id: account.id,
  })
  if (!product.success) throw new Error('Product failed')
  return {
    fiscalYearId: fy.id,
    cpId: cp.data.id,
    vatCodeId: vatCode.id,
    productId: product.data.id,
  }
}

function seedExpense(testDb: Database.Database) {
  createCompany(testDb, VALID_COMPANY)
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  const supplier = createCounterparty(testDb, {
    name: 'Leverantör AB',
    type: 'supplier',
  })
  if (!supplier.success) throw new Error('Supplier failed')
  const vatCode = testDb
    .prepare("SELECT id FROM vat_codes WHERE vat_type = 'incoming' LIMIT 1")
    .get() as { id: number }
  return {
    fiscalYearId: fy.id,
    supplierId: supplier.data.id,
    vatCodeId: vatCode.id,
  }
}

function createUnpaidInvoice(
  testDb: Database.Database,
  seed: ReturnType<typeof seedInvoice>,
  totalOverride?: number,
) {
  const result = saveDraft(testDb, {
    counterparty_id: seed.cpId,
    fiscal_year_id: seed.fiscalYearId,
    invoice_date: '2025-03-15',
    due_date: '2099-12-31',
    lines: [
      {
        product_id: seed.productId,
        description: 'Konsult',
        quantity: 10,
        unit_price_ore: 100000,
        vat_code_id: seed.vatCodeId,
        sort_order: 0,
      },
    ],
  })
  if (!result.success) throw new Error('Draft failed: ' + result.error)
  const fResult = finalizeDraft(testDb, result.data.id)
  if (!fResult.success) throw new Error('Finalize failed: ' + fResult.error)
  if (totalOverride !== undefined) {
    testDb
      .prepare('UPDATE invoices SET total_amount_ore = ? WHERE id = ?')
      .run(totalOverride, fResult.data.id)
  }
  return fResult.data
}

function createUnpaidExpense(
  testDb: Database.Database,
  seed: ReturnType<typeof seedExpense>,
  opts?: { unitPriceOre?: number; quantity?: number },
) {
  const draftResult = saveExpenseDraft(testDb, {
    fiscal_year_id: seed.fiscalYearId,
    counterparty_id: seed.supplierId,
    expense_date: '2025-03-01',
    description: 'Test expense',
    payment_terms: 30,
    notes: '',
    lines: [
      {
        description: 'Test line',
        account_number: '5010',
        quantity: opts?.quantity ?? 1,
        unit_price_ore: opts?.unitPriceOre ?? 125000,
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
  return expenseId
}

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  db.close()
})

// ═══════════════════════════════════════════════════════════
// F11: expenses.paid_amount_ore + consistency
// ═══════════════════════════════════════════════════════════

describe('F11: expenses.paid_amount_ore column and simplified queries', () => {
  it('1. Migration 015 adds paid_amount_ore column to expenses', () => {
    const cols = db.pragma('table_info(expenses)') as {
      name: string
      type: string
      notnull: number
      dflt_value: string | null
    }[]
    const paidCol = cols.find((c) => c.name === 'paid_amount_ore')
    expect(paidCol).toBeDefined()
    expect(paidCol!.type).toBe('INTEGER')
    expect(paidCol!.notnull).toBe(1)
    expect(paidCol!.dflt_value).toBe('0')
  })

  it('2. Backfill: expenses with payments get correct paid_amount_ore', () => {
    // Seed company + FY + counterparty before migration
    const freshDb = new Database(':memory:')
    freshDb.pragma('journal_mode = WAL')
    freshDb.pragma('foreign_keys = ON')

    // Run migrations 1-14 (without 015)
    for (let i = 0; i < 14; i++) {
      const m = migrations[i]
      freshDb.exec('BEGIN EXCLUSIVE')
      freshDb.exec(m.sql)
      if (m.programmatic) m.programmatic(freshDb)
      freshDb.pragma(`user_version = ${i + 1}`)
      freshDb.exec('COMMIT')
    }

    // Create test data via direct INSERT
    createCompany(freshDb, VALID_COMPANY)
    const fy = freshDb
      .prepare('SELECT id FROM fiscal_years LIMIT 1')
      .get() as { id: number }
    // Direct SQL — DB is at migration 014, column is still payment_terms_days
    freshDb.prepare(
      "INSERT INTO counterparties (name, type, payment_terms_days) VALUES (?, ?, 30)",
    ).run('Leverantör AB', 'supplier')
    const cpId = (freshDb.prepare("SELECT id FROM counterparties WHERE name = 'Leverantör AB'").get() as { id: number }).id

    // Insert expense directly (status = 'unpaid' to mimic finalized)
    freshDb
      .prepare(
        `INSERT INTO expenses (fiscal_year_id, counterparty_id, expense_date, description, status, total_amount_ore, payment_terms, notes)
         VALUES (?, ?, '2025-03-01', 'Test', 'unpaid', 100000, 30, '')`,
      )
      .run(fy.id, cpId)
    const expenseId = Number(
      (freshDb.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id,
    )

    // Create a dummy journal entry for FK reference
    const companyId = (
      freshDb.prepare('SELECT id FROM companies LIMIT 1').get() as {
        id: number
      }
    ).id
    freshDb
      .prepare(
        `INSERT INTO journal_entries (company_id, fiscal_year_id, journal_date, description, status, source_type)
         VALUES (?, ?, '2025-03-01', 'Dummy', 'draft', 'manual')`,
      )
      .run(companyId, fy.id)
    const jeId = Number(
      (freshDb.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id,
    )

    // Insert payments directly
    freshDb
      .prepare(
        `INSERT INTO expense_payments (expense_id, journal_entry_id, payment_date, amount, account_number)
         VALUES (?, ?, '2025-03-15', 30000, '1930')`,
      )
      .run(expenseId, jeId)
    freshDb
      .prepare(
        `INSERT INTO expense_payments (expense_id, journal_entry_id, payment_date, amount, account_number)
         VALUES (?, ?, '2025-03-20', 20000, '1930')`,
      )
      .run(expenseId, jeId)

    // Now run remaining migrations (015 onwards)
    // Disable FK temporarily — table-recreate in later migrations
    // would fail FK checks against test data inserted above.
    freshDb.pragma('foreign_keys = OFF')
    for (let i = 14; i < migrations.length; i++) {
      const m = migrations[i]
      freshDb.exec('BEGIN EXCLUSIVE')
      freshDb.exec(m.sql)
      if (m.programmatic) m.programmatic(freshDb)
      freshDb.pragma(`user_version = ${i + 1}`)
      freshDb.exec('COMMIT')
    }
    freshDb.pragma('foreign_keys = ON')

    // Verify backfill
    const expense = freshDb
      .prepare('SELECT paid_amount_ore FROM expenses WHERE id = ?')
      .get(expenseId) as { paid_amount_ore: number }
    expect(expense.paid_amount_ore).toBe(50000)

    freshDb.close()
  })

  it('3. Backfill: expenses without payments get paid_amount_ore = 0', () => {
    const freshDb = new Database(':memory:')
    freshDb.pragma('journal_mode = WAL')
    freshDb.pragma('foreign_keys = ON')

    for (let i = 0; i < 14; i++) {
      const m = migrations[i]
      freshDb.exec('BEGIN EXCLUSIVE')
      freshDb.exec(m.sql)
      if (m.programmatic) m.programmatic(freshDb)
      freshDb.pragma(`user_version = ${i + 1}`)
      freshDb.exec('COMMIT')
    }

    createCompany(freshDb, VALID_COMPANY)
    const fy = freshDb
      .prepare('SELECT id FROM fiscal_years LIMIT 1')
      .get() as { id: number }
    // Direct SQL — DB is at migration 014, column is still payment_terms_days
    freshDb.prepare(
      "INSERT INTO counterparties (name, type, payment_terms_days) VALUES (?, ?, 30)",
    ).run('Leverantör AB', 'supplier')
    const cpId = (freshDb.prepare("SELECT id FROM counterparties WHERE name = 'Leverantör AB'").get() as { id: number }).id

    freshDb
      .prepare(
        `INSERT INTO expenses (fiscal_year_id, counterparty_id, expense_date, description, status, total_amount_ore, payment_terms, notes)
         VALUES (?, ?, '2025-03-01', 'Unpaid', 'unpaid', 50000, 30, '')`,
      )
      .run(fy.id, cpId)

    // Run remaining migrations (015 onwards)
    freshDb.pragma('foreign_keys = OFF')
    for (let i = 14; i < migrations.length; i++) {
      const m = migrations[i]
      freshDb.exec('BEGIN EXCLUSIVE')
      freshDb.exec(m.sql)
      if (m.programmatic) m.programmatic(freshDb)
      freshDb.pragma(`user_version = ${i + 1}`)
      freshDb.exec('COMMIT')
    }
    freshDb.pragma('foreign_keys = ON')

    const expense = freshDb
      .prepare('SELECT paid_amount_ore FROM expenses WHERE id = 1')
      .get() as { paid_amount_ore: number }
    expect(expense.paid_amount_ore).toBe(0)

    freshDb.close()
  })

  it('4. payExpense updates paid_amount_ore on full payment', () => {
    const seed = seedExpense(db)
    const expenseId = createUnpaidExpense(db, seed)
    const expense = db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(expenseId) as { total_amount_ore: number }

    const result = payExpense(db, {
      expense_id: expenseId,
      amount_ore: expense.total_amount_ore,
      payment_date: '2025-03-15',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(result.success).toBe(true)

    const updated = db
      .prepare('SELECT paid_amount_ore, status FROM expenses WHERE id = ?')
      .get(expenseId) as Expense
    expect(updated.paid_amount_ore).toBe(expense.total_amount_ore)
    expect(updated.status).toBe('paid')
  })

  it('5. payExpense updates paid_amount_ore on partial payment', () => {
    const seed = seedExpense(db)
    const expenseId = createUnpaidExpense(db, seed)
    const expense = db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(expenseId) as { total_amount_ore: number }
    const halfAmount = Math.floor(expense.total_amount_ore / 2)

    const result = payExpense(db, {
      expense_id: expenseId,
      amount_ore: halfAmount,
      payment_date: '2025-03-15',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(result.success).toBe(true)

    const updated = db
      .prepare('SELECT paid_amount_ore, status FROM expenses WHERE id = ?')
      .get(expenseId) as Expense
    expect(updated.paid_amount_ore).toBe(halfAmount)
    expect(updated.status).toBe('partial')
  })

  it('6. payExpense updates paid_amount_ore on final payment after partial', () => {
    const seed = seedExpense(db)
    const expenseId = createUnpaidExpense(db, seed)
    const expense = db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(expenseId) as { total_amount_ore: number }
    const halfAmount = Math.floor(expense.total_amount_ore / 2)
    const remainder = expense.total_amount_ore - halfAmount

    payExpense(db, {
      expense_id: expenseId,
      amount_ore: halfAmount,
      payment_date: '2025-03-15',
      payment_method: 'bank',
      account_number: '1930',
    })

    const result = payExpense(db, {
      expense_id: expenseId,
      amount_ore: remainder,
      payment_date: '2025-03-16',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(result.success).toBe(true)

    const updated = db
      .prepare('SELECT paid_amount_ore, status FROM expenses WHERE id = ?')
      .get(expenseId) as Expense
    expect(updated.paid_amount_ore).toBe(expense.total_amount_ore)
    expect(updated.status).toBe('paid')
  })

  it('7. paid_amount_ore correct with öresutjämning (rounding via 3740)', () => {
    const seed = seedExpense(db)
    const expenseId = createUnpaidExpense(db, seed)
    const expense = db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(expenseId) as { total_amount_ore: number }

    // Pay 3 öre less than total — within ROUNDING_THRESHOLD (50 öre)
    const result = payExpense(db, {
      expense_id: expenseId,
      amount_ore: expense.total_amount_ore - 3,
      payment_date: '2025-03-15',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(result.success).toBe(true)

    const updated = db
      .prepare('SELECT paid_amount_ore, status FROM expenses WHERE id = ?')
      .get(expenseId) as Expense
    // Rounding adjustment makes it full payment
    expect(updated.paid_amount_ore).toBe(expense.total_amount_ore)
    expect(updated.status).toBe('paid')

    // Verify 3740 journal line exists with credit 3 öre
    const roundingLine = db
      .prepare(
        `SELECT jel.credit_ore FROM journal_entry_lines jel
         JOIN journal_entries je ON jel.journal_entry_id = je.id
         WHERE je.source_type = 'auto_payment' AND jel.account_number = '3740'
         ORDER BY je.id DESC LIMIT 1`,
      )
      .get() as { credit_ore: number } | undefined
    expect(roundingLine).toBeDefined()
    expect(roundingLine!.credit_ore).toBe(3)
  })

  it('8. listExpenses returns correct total_paid without subquery', () => {
    const seed = seedExpense(db)
    const expenseId = createUnpaidExpense(db, seed)
    const expense = db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(expenseId) as { total_amount_ore: number }

    // Two partial payments
    payExpense(db, {
      expense_id: expenseId,
      amount_ore: 30000,
      payment_date: '2025-03-15',
      payment_method: 'bank',
      account_number: '1930',
    })
    payExpense(db, {
      expense_id: expenseId,
      amount_ore: 20000,
      payment_date: '2025-03-16',
      payment_method: 'bank',
      account_number: '1930',
    })

    const result = listExpenses(db, { fiscal_year_id: seed.fiscalYearId })
    const found = result.expenses.find((e) => e.id === expenseId)
    expect(found).toBeDefined()
    expect(found!.total_paid).toBe(50000)
    expect(found!.remaining).toBe(expense.total_amount_ore - 50000)
  })

  it('9. Dashboard unpaidReceivablesOre correct after simplification', () => {
    const seed = seedInvoice(db)

    // Create 3 invoices: one paid, one partial, one unpaid
    const inv1 = createUnpaidInvoice(db, seed)
    const inv2 = createUnpaidInvoice(db, seed)
    const inv3 = createUnpaidInvoice(db, seed)

    const total = (
      db
        .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
        .get(inv1.id) as { total_amount_ore: number }
    ).total_amount_ore

    // Pay inv1 fully
    payInvoice(db, {
      invoice_id: inv1.id,
      amount_ore: total,
      payment_date: '2025-03-20',
      payment_method: 'bank',
      account_number: '1930',
    })

    // Pay inv2 partially (half)
    const halfAmount = Math.floor(total / 2)
    payInvoice(db, {
      invoice_id: inv2.id,
      amount_ore: halfAmount,
      payment_date: '2025-03-21',
      payment_method: 'bank',
      account_number: '1930',
    })

    // inv3 remains unpaid
    const summary = getDashboardSummary(db, seed.fiscalYearId)

    // Unpaid receivables = (inv2 remaining) + (inv3 total)
    const expectedReceivables = (total - halfAmount) + total
    expect(summary.unpaidReceivablesOre).toBe(expectedReceivables)
  })

  it('10. Dashboard unpaidPayablesOre correct after simplification', () => {
    const seed = seedExpense(db)

    // Create expenses in different states
    const exp1Id = createUnpaidExpense(db, seed)
    const exp2Id = createUnpaidExpense(db, seed, {
      unitPriceOre: 80000,
      quantity: 1,
    })

    const exp1Total = (
      db
        .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
        .get(exp1Id) as { total_amount_ore: number }
    ).total_amount_ore

    const exp2Total = (
      db
        .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
        .get(exp2Id) as { total_amount_ore: number }
    ).total_amount_ore

    // Pay exp1 fully
    payExpense(db, {
      expense_id: exp1Id,
      amount_ore: exp1Total,
      payment_date: '2025-03-15',
      payment_method: 'bank',
      account_number: '1930',
    })

    // exp2 remains unpaid
    const summary = getDashboardSummary(db, seed.fiscalYearId)

    // Only exp2 should count (exp1 is paid, so not in unpaid/overdue/partial)
    expect(summary.unpaidPayablesOre).toBe(exp2Total)
  })
})

// ═══════════════════════════════════════════════════════════
// F17: getAllJournalEntryLines batched query
// ═══════════════════════════════════════════════════════════

describe('F17: getAllJournalEntryLines batched query', () => {
  it('11. Returns empty Map for FY without bookings', () => {
    const seed = seedExpense(db)
    const map = getAllJournalEntryLines(db, seed.fiscalYearId)
    expect(map.size).toBe(0)
  })

  it('12. Groups correctly per journal_entry_id', () => {
    const seed = seedExpense(db)
    // Create 3 expenses (each generates 1 journal entry with varying line counts)
    createUnpaidExpense(db, seed)
    createUnpaidExpense(db, seed, { unitPriceOre: 80000 })
    createUnpaidExpense(db, seed, { unitPriceOre: 50000 })

    const map = getAllJournalEntryLines(db, seed.fiscalYearId)
    expect(map.size).toBe(3)

    // Each expense entry has at least 2 lines (debit cost + credit 2440)
    for (const [, lines] of map) {
      expect(lines.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('13. Respects fiscal_year_id filter', () => {
    // Create company with FY 2025
    createCompany(db, VALID_COMPANY)
    const fy1 = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
      id: number
    }
    const supplier = createCounterparty(db, {
      name: 'Leverantör AB',
      type: 'supplier',
    })
    if (!supplier.success) throw new Error('Supplier failed')
    const vatCode = db
      .prepare("SELECT id FROM vat_codes WHERE vat_type = 'incoming' LIMIT 1")
      .get() as { id: number }

    // Create expense in FY1
    createUnpaidExpense(db, {
      fiscalYearId: fy1.id,
      supplierId: supplier.data.id,
      vatCodeId: vatCode.id,
    })

    // Create second FY
    const companyId = (
      db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: number }
    ).id
    db.prepare(
      `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date, is_closed, annual_report_status)
       VALUES (?, '2026', '2026-01-01', '2026-12-31', 0, 'not_started')`,
    ).run(companyId)
    const fy2 = db
      .prepare('SELECT id FROM fiscal_years WHERE year_label = ?')
      .get('2026') as { id: number }

    // Generate accounting periods for FY2
    for (let month = 1; month <= 12; month++) {
      const startDate = `2026-${String(month).padStart(2, '0')}-01`
      const lastDay = new Date(2026, month, 0).getDate()
      const endDate = `2026-${String(month).padStart(2, '0')}-${lastDay}`
      db.prepare(
        `INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date, is_closed)
         VALUES (?, ?, ?, ?, ?, 0)`,
      ).run(companyId, fy2.id, month, startDate, endDate)
    }

    // Create expense in FY2
    const draftResult2 = saveExpenseDraft(db, {
      fiscal_year_id: fy2.id,
      counterparty_id: supplier.data.id,
      expense_date: '2026-03-01',
      description: 'FY2 expense',
      payment_terms: 30,
      notes: '',
      lines: [
        {
          description: 'Test',
          account_number: '5010',
          quantity: 1,
          unit_price_ore: 60000,
          vat_code_id: vatCode.id,
        },
      ],
    })
    if (!draftResult2.success)
      throw new Error('FY2 draft: ' + draftResult2.error)
    finalizeExpense(db, draftResult2.data.id)

    // Query FY1 only
    const mapFy1 = getAllJournalEntryLines(db, fy1.id)
    expect(mapFy1.size).toBe(1)

    // Query FY2 only
    const mapFy2 = getAllJournalEntryLines(db, fy2.id)
    expect(mapFy2.size).toBe(1)
  })

  it('14. Respects dateRange filter', () => {
    const seed = seedExpense(db)

    // January expense
    const jan = saveExpenseDraft(db, {
      fiscal_year_id: seed.fiscalYearId,
      counterparty_id: seed.supplierId,
      expense_date: '2025-01-15',
      description: 'Jan expense',
      payment_terms: 30,
      notes: '',
      lines: [
        {
          description: 'Jan',
          account_number: '5010',
          quantity: 1,
          unit_price_ore: 50000,
          vat_code_id: seed.vatCodeId,
        },
      ],
    })
    if (!jan.success) throw new Error('Jan draft failed')
    finalizeExpense(db, jan.data.id)

    // February expense
    const feb = saveExpenseDraft(db, {
      fiscal_year_id: seed.fiscalYearId,
      counterparty_id: seed.supplierId,
      expense_date: '2025-02-15',
      description: 'Feb expense',
      payment_terms: 30,
      notes: '',
      lines: [
        {
          description: 'Feb',
          account_number: '5010',
          quantity: 1,
          unit_price_ore: 60000,
          vat_code_id: seed.vatCodeId,
        },
      ],
    })
    if (!feb.success) throw new Error('Feb draft failed')
    finalizeExpense(db, feb.data.id)

    // March expense
    const mar = saveExpenseDraft(db, {
      fiscal_year_id: seed.fiscalYearId,
      counterparty_id: seed.supplierId,
      expense_date: '2025-03-15',
      description: 'Mar expense',
      payment_terms: 30,
      notes: '',
      lines: [
        {
          description: 'Mar',
          account_number: '5010',
          quantity: 1,
          unit_price_ore: 70000,
          vat_code_id: seed.vatCodeId,
        },
      ],
    })
    if (!mar.success) throw new Error('Mar draft failed')
    finalizeExpense(db, mar.data.id)

    // Filter February only
    const mapFeb = getAllJournalEntryLines(db, seed.fiscalYearId, {
      startDate: '2025-02-01',
      endDate: '2025-02-28',
    })
    expect(mapFeb.size).toBe(1)
  })

  it('15. Excludes draft entries', () => {
    const seed = seedExpense(db)

    // Create a draft expense (NOT finalized)
    saveExpenseDraft(db, {
      fiscal_year_id: seed.fiscalYearId,
      counterparty_id: seed.supplierId,
      expense_date: '2025-03-01',
      description: 'Draft expense',
      payment_terms: 30,
      notes: '',
      lines: [
        {
          description: 'Draft',
          account_number: '5010',
          quantity: 1,
          unit_price_ore: 50000,
          vat_code_id: seed.vatCodeId,
        },
      ],
    })

    const map = getAllJournalEntryLines(db, seed.fiscalYearId)
    expect(map.size).toBe(0)
  })

  it('16. Preserves line_number ordering', () => {
    const seed = seedExpense(db)

    // Create expense with multiple lines (generates entry with 4+ journal lines)
    const draftResult = saveExpenseDraft(db, {
      fiscal_year_id: seed.fiscalYearId,
      counterparty_id: seed.supplierId,
      expense_date: '2025-03-01',
      description: 'Multi-line expense',
      payment_terms: 30,
      notes: '',
      lines: [
        {
          description: 'Line A',
          account_number: '5010',
          quantity: 1,
          unit_price_ore: 50000,
          vat_code_id: seed.vatCodeId,
        },
        {
          description: 'Line B',
          account_number: '5020',
          quantity: 2,
          unit_price_ore: 30000,
          vat_code_id: seed.vatCodeId,
        },
      ],
    })
    if (!draftResult.success) throw new Error('Draft failed')
    finalizeExpense(db, draftResult.data.id)

    const map = getAllJournalEntryLines(db, seed.fiscalYearId)
    expect(map.size).toBe(1)

    const [, lines] = [...map.entries()][0]
    // Verify lines are in line_number order — cost accounts first, then VAT, then payables
    expect(lines.length).toBeGreaterThanOrEqual(3)

    // All debit lines should come before the credit line (2440)
    const creditIdx = lines.findIndex(
      (l) => l.account_number === '2440' && l.credit_ore > 0,
    )
    expect(creditIdx).toBe(lines.length - 1) // 2440 is always last
  })

  it('17. dateRange with endDate filters correctly', () => {
    const seed = seedExpense(db)

    // March expense
    const mar = saveExpenseDraft(db, {
      fiscal_year_id: seed.fiscalYearId,
      counterparty_id: seed.supplierId,
      expense_date: '2025-03-15',
      description: 'Mar expense',
      payment_terms: 30,
      notes: '',
      lines: [
        {
          description: 'Mar',
          account_number: '5010',
          quantity: 1,
          unit_price_ore: 70000,
          vat_code_id: seed.vatCodeId,
        },
      ],
    })
    if (!mar.success) throw new Error('Mar draft failed')
    finalizeExpense(db, mar.data.id)

    // Filter with endDate before march
    const map = getAllJournalEntryLines(db, seed.fiscalYearId, {
      endDate: '2025-02-28',
    })
    expect(map.size).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════
// Regression
// ═══════════════════════════════════════════════════════════

describe('Regression: PRAGMA user_version', () => {
  it('18. user_version === 15', () => {
    const row = db.pragma('user_version') as { user_version: number }[]
    expect(row[0].user_version).toBe(35)
  })
})
