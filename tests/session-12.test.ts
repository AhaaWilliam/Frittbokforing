import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import {
  saveExpenseDraft,
  finalizeExpense,
  payExpense,
  refreshExpenseStatuses,
  listExpenses,
} from '../src/main/services/expense-service'

let db: Database.Database

function createTestDb(): Database.Database {
  const testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.pragma('foreign_keys = ON')
  for (let i = 0; i < migrations.length; i++) {
    const m = migrations[i]
    testDb.exec('BEGIN EXCLUSIVE')
    testDb.exec(m.sql)
    if (m.programmatic) m.programmatic(testDb)
    testDb.pragma(`user_version = ${i + 1}`)
    testDb.exec('COMMIT')
  }
  return testDb
}

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
  const supplier2 = createCounterparty(testDb, {
    name: 'Staples AB',
    type: 'supplier',
  })
  if (!supplier2.success) throw new Error('Supplier2 creation failed')
  const vatCode = testDb
    .prepare("SELECT id FROM vat_codes WHERE vat_type = 'incoming' LIMIT 1")
    .get() as { id: number }
  return {
    fiscalYearId: fy.id,
    supplierId: supplier.data.id,
    supplier2Id: supplier2.data.id,
    vatCodeId: vatCode.id,
  }
}

let draftCounter = 0

function makeDraft(
  testDb: Database.Database,
  seed: ReturnType<typeof seedAll>,
  opts?: {
    date?: string
    description?: string
    supplierId?: number
    supplierInvoiceNumber?: string
    paymentTerms?: number
  },
) {
  draftCounter++
  const result = saveExpenseDraft(testDb, {
    fiscal_year_id: seed.fiscalYearId,
    counterparty_id: opts?.supplierId ?? seed.supplierId,
    expense_date: opts?.date ?? '2025-03-15',
    description: opts?.description ?? 'Test expense',
    payment_terms: opts?.paymentTerms ?? 30,
    supplier_invoice_number:
      opts?.supplierInvoiceNumber ?? `TEST-${draftCounter}`,
    notes: '',
    lines: [
      {
        description: 'Test line',
        account_number: '5010',
        quantity: 1,
        unit_price_ore: 100000,
        vat_code_id: seed.vatCodeId,
      },
    ],
  })
  if (!result.success) throw new Error('Draft failed: ' + result.error)
  return result.data.id
}

function makeFinalized(
  testDb: Database.Database,
  seed: ReturnType<typeof seedAll>,
  opts?: Parameters<typeof makeDraft>[2],
) {
  const id = makeDraft(testDb, seed, opts)
  const fin = finalizeExpense(testDb, id)
  if (!fin.success) throw new Error('Finalize failed: ' + fin.error)
  return id
}

beforeEach(() => {
  db = createTestDb()
  draftCounter = 0
})

afterEach(() => {
  db.close()
})

// ═══════════════════════════════════════════════════════════
// expense:list IPC
// ═══════════════════════════════════════════════════════════
describe('Session 12: listExpenses', () => {
  it('returns all expenses for fiscal year', () => {
    const seed = seedAll(db)
    const draftId = makeDraft(db, seed, { description: 'Draft one' })
    const unpaidId = makeFinalized(db, seed, { description: 'Unpaid one' })
    const paidId = makeFinalized(db, seed, { description: 'Paid one' })

    // Pay one fully
    const exp = db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(paidId) as { total_amount_ore: number }
    payExpense(db, {
      expense_id: paidId,
      amount: exp.total_amount_ore,
      payment_date: '2025-04-01',
      payment_method: 'bankgiro',
      account_number: '1930',
    })

    const result = listExpenses(db, { fiscal_year_id: seed.fiscalYearId })
    expect(result.expenses).toHaveLength(3)

    // Check counterparty_name is present
    expect(result.expenses[0].counterparty_name).toBeTruthy()

    // Check paid expense has total_paid
    const paid = result.expenses.find((e) => e.id === paidId)!
    expect(paid.total_paid).toBe(paid.total_amount_ore)
    expect(paid.remaining).toBe(0)

    // Check draft has no verification
    const draft = result.expenses.find((e) => e.id === draftId)!
    expect(draft.verification_number).toBeNull()

    // Check unpaid has verification
    const unpaid = result.expenses.find((e) => e.id === unpaidId)!
    expect(unpaid.verification_number).not.toBeNull()
  })

  it('filters by status', () => {
    const seed = seedAll(db)
    makeDraft(db, seed)
    const fin1 = makeFinalized(db, seed)
    const fin2 = makeFinalized(db, seed)

    // Set future due dates so they stay 'unpaid'
    for (const id of [fin1, fin2]) {
      db.prepare(
        "UPDATE expenses SET due_date = date('now', '+30 days') WHERE id = ?",
      ).run(id)
    }

    const drafts = listExpenses(db, {
      fiscal_year_id: seed.fiscalYearId,
      status: 'draft',
    })
    expect(drafts.expenses).toHaveLength(1)

    const unpaid = listExpenses(db, {
      fiscal_year_id: seed.fiscalYearId,
      status: 'unpaid',
    })
    expect(unpaid.expenses).toHaveLength(2)

    // Counts should still reflect totals
    expect(drafts.counts.draft).toBe(1)
    expect(drafts.counts.unpaid).toBe(2)
    expect(drafts.counts.total).toBe(3)
  })

  it('search matches counterparty name and description', () => {
    const seed = seedAll(db)
    makeFinalized(db, seed, {
      supplierId: seed.supplierId,
      description: 'Kontorsmaterial',
    })
    makeFinalized(db, seed, {
      supplierId: seed.supplier2Id,
      description: 'Serverkostnad',
    })

    // Search by supplier name
    const staplesResult = listExpenses(db, {
      fiscal_year_id: seed.fiscalYearId,
      search: 'Staples',
    })
    expect(staplesResult.expenses).toHaveLength(1)
    expect(staplesResult.expenses[0].counterparty_name).toBe('Staples AB')

    // Search by description
    const kontorResult = listExpenses(db, {
      fiscal_year_id: seed.fiscalYearId,
      search: 'kontorsmaterial',
    })
    expect(kontorResult.expenses).toHaveLength(1)
  })

  it('search matches supplier_invoice_number', () => {
    const seed = seedAll(db)
    makeFinalized(db, seed, { supplierInvoiceNumber: 'F-2025-0042' })
    makeFinalized(db, seed, { supplierInvoiceNumber: 'G-2025-0001' })

    const result1 = listExpenses(db, {
      fiscal_year_id: seed.fiscalYearId,
      search: 'F-2025',
    })
    expect(result1.expenses).toHaveLength(1)

    const result2 = listExpenses(db, {
      fiscal_year_id: seed.fiscalYearId,
      search: '0042',
    })
    expect(result2.expenses).toHaveLength(1)
  })

  it('sorts by expense_date desc by default', () => {
    const seed = seedAll(db)
    makeFinalized(db, seed, { date: '2025-01-15' })
    makeFinalized(db, seed, { date: '2025-03-01' })
    makeFinalized(db, seed, { date: '2025-02-10' })

    const result = listExpenses(db, { fiscal_year_id: seed.fiscalYearId })
    expect(result.expenses[0].expense_date).toBe('2025-03-01')
    expect(result.expenses[1].expense_date).toBe('2025-02-10')
    expect(result.expenses[2].expense_date).toBe('2025-01-15')
  })
})

// ═══════════════════════════════════════════════════════════
// Overdue logic
// ═══════════════════════════════════════════════════════════
describe('Session 12: refreshExpenseStatuses', () => {
  it('marks unpaid as overdue when past due', () => {
    const seed = seedAll(db)
    const id = makeFinalized(db, seed)
    // Force due_date to yesterday
    db.prepare(
      "UPDATE expenses SET due_date = date('now', '-1 day') WHERE id = ?",
    ).run(id)

    const changed = refreshExpenseStatuses(db)
    expect(changed).toBe(1)

    const exp = db
      .prepare('SELECT status FROM expenses WHERE id = ?')
      .get(id) as { status: string }
    expect(exp.status).toBe('overdue')
  })

  it('does not change unpaid with future due date', () => {
    const seed = seedAll(db)
    const id = makeFinalized(db, seed)
    // Force due_date to tomorrow
    db.prepare(
      "UPDATE expenses SET due_date = date('now', '+1 day') WHERE id = ?",
    ).run(id)

    refreshExpenseStatuses(db)

    const exp = db
      .prepare('SELECT status FROM expenses WHERE id = ?')
      .get(id) as { status: string }
    expect(exp.status).toBe('unpaid')
  })

  it('does not change draft even if past due', () => {
    const seed = seedAll(db)
    const id = makeDraft(db, seed)
    // Force due_date to yesterday on the draft
    db.prepare(
      "UPDATE expenses SET due_date = date('now', '-1 day') WHERE id = ?",
    ).run(id)

    refreshExpenseStatuses(db)

    const exp = db
      .prepare('SELECT status FROM expenses WHERE id = ?')
      .get(id) as { status: string }
    expect(exp.status).toBe('draft')
  })

  it('does not change expense with NULL due_date', () => {
    const seed = seedAll(db)
    const id = makeFinalized(db, seed)
    // Set due_date to NULL
    db.prepare('UPDATE expenses SET due_date = NULL WHERE id = ?').run(id)

    refreshExpenseStatuses(db)

    const exp = db
      .prepare('SELECT status FROM expenses WHERE id = ?')
      .get(id) as { status: string }
    expect(exp.status).toBe('unpaid')
  })
})

// ═══════════════════════════════════════════════════════════
// Status counts + integration
// ═══════════════════════════════════════════════════════════
describe('Session 12: Status counts', () => {
  it('returns correct status counts', () => {
    const seed = seedAll(db)
    makeDraft(db, seed)
    makeDraft(db, seed)
    // Create finalized with future due dates so they stay 'unpaid'
    const unpaid1 = makeFinalized(db, seed)
    const unpaid2 = makeFinalized(db, seed)
    const unpaid3 = makeFinalized(db, seed)
    const paidId = makeFinalized(db, seed)

    // Set future due_dates so refreshExpenseStatuses won't mark them overdue
    for (const id of [unpaid1, unpaid2, unpaid3, paidId]) {
      db.prepare(
        "UPDATE expenses SET due_date = date('now', '+30 days') WHERE id = ?",
      ).run(id)
    }

    // Pay one fully
    const exp = db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(paidId) as { total_amount_ore: number }
    payExpense(db, {
      expense_id: paidId,
      amount: exp.total_amount_ore,
      payment_date: '2025-04-01',
      payment_method: 'bankgiro',
      account_number: '1930',
    })

    // Make one overdue
    const overdueId = makeFinalized(db, seed)
    db.prepare(
      "UPDATE expenses SET due_date = date('now', '-1 day') WHERE id = ?",
    ).run(overdueId)

    const result = listExpenses(db, { fiscal_year_id: seed.fiscalYearId })
    expect(result.counts.draft).toBe(2)
    expect(result.counts.unpaid).toBe(3)
    expect(result.counts.paid).toBe(1)
    expect(result.counts.overdue).toBe(1)
    expect(result.counts.total).toBe(7)
  })

  it('includes partial in counts after partial payment', () => {
    const seed = seedAll(db)
    const id = makeFinalized(db, seed)

    const exp = db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(id) as { total_amount_ore: number }

    // Pay half
    payExpense(db, {
      expense_id: id,
      amount: Math.floor(exp.total_amount_ore / 2),
      payment_date: '2025-04-01',
      payment_method: 'bankgiro',
      account_number: '1930',
    })

    const result = listExpenses(db, { fiscal_year_id: seed.fiscalYearId })
    expect(result.counts.partial).toBe(1)

    const item = result.expenses.find((e) => e.id === id)!
    expect(item.total_paid).toBeGreaterThan(0)
    expect(item.remaining).toBeGreaterThan(0)
    expect(item.total_paid + item.remaining).toBe(item.total_amount_ore)
  })

  it('includes verification info via JOIN', () => {
    const seed = seedAll(db)
    const draftId = makeDraft(db, seed)
    const finalizedId = makeFinalized(db, seed)

    const result = listExpenses(db, { fiscal_year_id: seed.fiscalYearId })

    const draft = result.expenses.find((e) => e.id === draftId)!
    expect(draft.verification_number).toBeNull()
    expect(draft.verification_series).toBeNull()

    const finalized = result.expenses.find((e) => e.id === finalizedId)!
    expect(finalized.verification_number).not.toBeNull()
    expect(finalized.verification_series).toBe('B')
  })
})
