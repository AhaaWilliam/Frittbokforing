import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import { saveDraft, finalizeDraft } from '../src/main/services/invoice-service'
import {
  saveExpenseDraft,
  getExpenseDraft,
  updateExpenseDraft,
  deleteExpenseDraft,
  listExpenseDrafts,
  finalizeExpense,
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
  if (!supplier.success) throw new Error('Supplier failed')
  const customer = createCounterparty(testDb, {
    name: 'Kund AB',
    type: 'customer',
  })
  if (!customer.success) throw new Error('Customer failed')
  const vatCode25 = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'IP1'")
    .get() as { id: number }
  const vatCode12 = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'IP2'")
    .get() as { id: number }
  const vatCodeOut = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
    .get() as { id: number }
  const account = testDb
    .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
    .get() as { id: number }
  const product = createProduct(testDb, {
    name: 'Konsult',
    default_price_ore: 100000,
    vat_code_id: vatCodeOut.id,
    account_id: account.id,
  })
  if (!product.success) throw new Error('Product failed')
  return {
    fiscalYearId: fy.id,
    supplierId: supplier.data.id,
    customerId: customer.data.id,
    vatCode25Id: vatCode25.id,
    vatCode12Id: vatCode12.id,
    vatCodeOutId: vatCodeOut.id,
    productId: product.data.id,
  }
}

function createExpenseDraft(
  testDb: Database.Database,
  seed: ReturnType<typeof seedAll>,
  opts?: {
    account?: string
    quantity?: number
    unitPrice?: number
    vatCodeId?: number
    date?: string
    supplierInvNr?: string | null
  },
) {
  return saveExpenseDraft(testDb, {
    fiscal_year_id: seed.fiscalYearId,
    counterparty_id: seed.supplierId,
    supplier_invoice_number: opts?.supplierInvNr ?? null,
    expense_date: opts?.date ?? '2025-03-15',
    description: 'Kontorsmaterial',
    lines: [
      {
        description: 'Material',
        account_number: opts?.account ?? '6110',
        quantity: opts?.quantity ?? 1,
        unit_price_ore: opts?.unitPrice ?? 100000,
        vat_code_id: opts?.vatCodeId ?? seed.vatCode25Id,
      },
    ],
  })
}

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  if (db) db.close()
})

// ═══════════════════════════════════════════════════════════
// Migration (2 tester)
// ═══════════════════════════════════════════════════════════
describe('Migration 009', () => {
  it('1. expenses + expense_lines tables exist', () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('expenses','expense_lines')",
      )
      .all() as { name: string }[]
    expect(tables.map((t) => t.name).sort()).toEqual([
      'expense_lines',
      'expenses',
    ])
  })

  it('2. verification_series + updated UNIQUE index', () => {
    const cols = (
      db.pragma('table_info(journal_entries)') as { name: string }[]
    ).map((c) => c.name)
    expect(cols).toContain('verification_series')

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%verify%series%'",
      )
      .all() as { name: string }[]
    expect(indexes.length).toBeGreaterThan(0)
  })
})

// ═══════════════════════════════════════════════════════════
// Draft CRUD (5 tester)
// ═══════════════════════════════════════════════════════════
describe('Expense draft CRUD', () => {
  it('3. saveExpenseDraft creates draft with calculated totals', () => {
    const seed = seedAll(db)
    // 1 rad: quantity=1, unit_price=100000 (1000 kr), 25% moms
    // line_total = 1*100000 = 100000
    // vat = 100000*25/100 = 25000
    // total = 125000
    const result = createExpenseDraft(db, seed)
    expect(result.success).toBe(true)
    if (!result.success) return

    const draft = getExpenseDraft(db, result.data.id)
    expect(draft.success).toBe(true)
    if (!draft.success || !draft.data) return
    expect(draft.data.status).toBe('draft')
    expect(draft.data.lines.length).toBe(1)
    expect(draft.data.lines[0].line_total_ore).toBe(100000)
    expect(draft.data.lines[0].vat_amount_ore).toBe(25000)
    expect(draft.data.total_amount_ore).toBe(125000)
  })

  it('4. getExpenseDraft returns expense with lines and counterparty_name', () => {
    const seed = seedAll(db)
    const saved = createExpenseDraft(db, seed)
    if (!saved.success) return

    const result = getExpenseDraft(db, saved.data.id)
    expect(result.success).toBe(true)
    if (!result.success || !result.data) return
    expect(result.data.counterparty_name).toBe('Leverantör AB')
    expect(result.data.lines.length).toBe(1)
  })

  it('5. updateExpenseDraft replaces lines', () => {
    const seed = seedAll(db)
    const saved = createExpenseDraft(db, seed)
    if (!saved.success) return

    const updated = updateExpenseDraft(db, {
      id: saved.data.id,
      counterparty_id: seed.supplierId,
      expense_date: '2025-03-15',
      description: 'Uppdaterad',
      lines: [
        {
          description: 'Ny rad',
          account_number: '5010',
          quantity: 1,
          unit_price_ore: 50000,
          vat_code_id: seed.vatCode25Id,
        },
      ],
    })
    expect(updated.success).toBe(true)

    const draft = getExpenseDraft(db, saved.data.id)
    if (!draft.success || !draft.data) return
    expect(draft.data.lines.length).toBe(1)
    expect(draft.data.lines[0].account_number).toBe('5010')
  })

  it('6. deleteExpenseDraft removes expense and lines', () => {
    const seed = seedAll(db)
    const saved = createExpenseDraft(db, seed)
    if (!saved.success) return

    const result = deleteExpenseDraft(db, saved.data.id)
    expect(result.success).toBe(true)

    const draft = getExpenseDraft(db, saved.data.id)
    expect(draft.success).toBe(true)
    if (!draft.success) return
    expect(draft.data).toBeNull()
  })

  it('7. listExpenseDrafts returns drafts without lines', () => {
    const seed = seedAll(db)
    createExpenseDraft(db, seed, { date: '2025-03-15' })
    createExpenseDraft(db, seed, { date: '2025-03-16' })

    const result = listExpenseDrafts(db, seed.fiscalYearId)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.length).toBe(2)
  })
})

// ═══════════════════════════════════════════════════════════
// Kontering — finalizeExpense (5 tester)
// ═══════════════════════════════════════════════════════════
describe('finalizeExpense', () => {
  it('8. Books correct journal entries in B-series', () => {
    const seed = seedAll(db)
    const saved = createExpenseDraft(db, seed, { date: '2025-03-15' })
    if (!saved.success) return

    const result = finalizeExpense(db, saved.data.id)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.verification_number).toBe(1)

    // Verify B-series
    const entry = db
      .prepare(
        'SELECT * FROM journal_entries WHERE id = (SELECT journal_entry_id FROM expenses WHERE id = ?)',
      )
      .get(saved.data.id) as {
      verification_series: string
      verification_number: number
      status: string
    }
    expect(entry.verification_series).toBe('B')
    expect(entry.status).toBe('booked')

    // Verify balance
    const expense = db
      .prepare('SELECT journal_entry_id FROM expenses WHERE id = ?')
      .get(saved.data.id) as { journal_entry_id: number }
    const balance = db
      .prepare(
        'SELECT SUM(debit_ore) as d, SUM(credit_ore) as c FROM journal_entry_lines WHERE journal_entry_id = ?',
      )
      .get(expense.journal_entry_id) as { d: number; c: number }
    expect(balance.d).toBe(balance.c)

    // Verify expense status
    const exp = db
      .prepare('SELECT status FROM expenses WHERE id = ?')
      .get(saved.data.id) as { status: string }
    expect(exp.status).toBe('unpaid')
  })

  it('9. Mixed VAT rates with aggregation', () => {
    const seed = seedAll(db)
    const result = saveExpenseDraft(db, {
      fiscal_year_id: seed.fiscalYearId,
      counterparty_id: seed.supplierId,
      expense_date: '2025-03-15',
      description: 'Mixed',
      lines: [
        {
          description: 'Material 25%',
          account_number: '6110',
          quantity: 1,
          unit_price_ore: 100000, // 1000 kr
          vat_code_id: seed.vatCode25Id,
        },
        {
          description: 'Representation 12%',
          account_number: '6071',
          quantity: 1,
          unit_price_ore: 50000, // 500 kr
          vat_code_id: seed.vatCode12Id,
        },
      ],
    })
    if (!result.success) return

    const fin = finalizeExpense(db, result.data.id)
    expect(fin.success).toBe(true)

    const exp = db
      .prepare('SELECT journal_entry_id FROM expenses WHERE id = ?')
      .get(result.data.id) as { journal_entry_id: number }
    const lines = db
      .prepare(
        'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ?',
      )
      .all(exp.journal_entry_id) as {
      account_number: string
      debit_ore: number
      credit_ore: number
    }[]

    // DEBET 6110: 100000, DEBET 6071: 50000, DEBET 2640: 25000+6000=31000
    const d6110 = lines.find((l) => l.account_number === '6110')
    expect(d6110?.debit_ore).toBe(100000)
    const d6071 = lines.find((l) => l.account_number === '6071')
    expect(d6071?.debit_ore).toBe(50000)
    const d2640 = lines.find((l) => l.account_number === '2640')
    expect(d2640?.debit_ore).toBe(31000)
    // KREDIT 2440: total
    const c2440 = lines.find((l) => l.account_number === '2440')
    expect(c2440?.credit_ore).toBe(181000)

    const totalD = lines.reduce((s, l) => s + l.debit_ore, 0)
    const totalC = lines.reduce((s, l) => s + l.credit_ore, 0)
    expect(totalD).toBe(totalC)
  })

  it('10. B-series independent from A-series', () => {
    const seed = seedAll(db)

    // Finalize a customer invoice (A-series)
    const inv = saveDraft(db, {
      counterparty_id: seed.customerId,
      fiscal_year_id: seed.fiscalYearId,
      invoice_date: '2025-03-15',
      due_date: '2099-12-31',
      lines: [
        {
          product_id: seed.productId,
          description: 'Test',
          quantity: 1,
          unit_price_ore: 100000,
          vat_code_id: seed.vatCodeOutId,
          sort_order: 0,
        },
      ],
    })
    if (!inv.success) return
    finalizeDraft(db, inv.data.id)

    // Finalize an expense (B-series)
    const exp = createExpenseDraft(db, seed, { date: '2025-03-15' })
    if (!exp.success) return
    const result = finalizeExpense(db, exp.data.id)
    expect(result.success).toBe(true)
    if (!result.success) return

    // Both should have verification_number = 1 in their respective series
    const aEntries = db
      .prepare(
        "SELECT verification_number FROM journal_entries WHERE verification_series = 'A'",
      )
      .all() as { verification_number: number }[]
    const bEntries = db
      .prepare(
        "SELECT verification_number FROM journal_entries WHERE verification_series = 'B'",
      )
      .all() as { verification_number: number }[]

    expect(aEntries.length).toBeGreaterThan(0)
    expect(bEntries.length).toBe(1)
    expect(bEntries[0].verification_number).toBe(1)
  })

  it('11. Rejects non-draft expense', () => {
    const seed = seedAll(db)
    const saved = createExpenseDraft(db, seed, { date: '2025-03-15' })
    if (!saved.success) return
    finalizeExpense(db, saved.data.id)

    const result = finalizeExpense(db, saved.data.id)
    expect(result.success).toBe(false)
  })

  it('12. Rejects closed period', () => {
    const seed = seedAll(db)
    const saved = createExpenseDraft(db, seed, { date: '2025-03-15' })
    if (!saved.success) return

    db.prepare(
      'UPDATE accounting_periods SET is_closed = 1 WHERE fiscal_year_id = ? AND period_number = 3',
    ).run(seed.fiscalYearId)

    const result = finalizeExpense(db, saved.data.id)
    expect(result.success).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════
// Validering (3 tester)
// ═══════════════════════════════════════════════════════════
describe('Validering', () => {
  it('13. Duplicate supplier invoice number rejected', () => {
    const seed = seedAll(db)
    const first = createExpenseDraft(db, seed, { supplierInvNr: 'F-2025-001' })
    expect(first.success).toBe(true)

    const second = createExpenseDraft(db, seed, { supplierInvNr: 'F-2025-001' })
    expect(second.success).toBe(false)
    if (!second.success) {
      expect(second.code).toBe('DUPLICATE_SUPPLIER_INVOICE')
    }

    // Same number different supplier = OK
    const otherSupplier = createCounterparty(db, {
      name: 'Annan Lev',
      type: 'supplier',
    })
    if (!otherSupplier.success) return
    const third = saveExpenseDraft(db, {
      fiscal_year_id: seed.fiscalYearId,
      counterparty_id: otherSupplier.data.id,
      supplier_invoice_number: 'F-2025-001',
      expense_date: '2025-03-15',
      description: 'Test',
      lines: [
        {
          description: 'X',
          account_number: '6110',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: seed.vatCode25Id,
        },
      ],
    })
    expect(third.success).toBe(true)
  })

  it('14. Rejects non-supplier counterparty', () => {
    const seed = seedAll(db)
    const result = saveExpenseDraft(db, {
      fiscal_year_id: seed.fiscalYearId,
      counterparty_id: seed.customerId, // customer, not supplier
      expense_date: '2025-03-15',
      description: 'Test',
      lines: [
        {
          description: 'X',
          account_number: '6110',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: seed.vatCode25Id,
        },
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('INVALID_COUNTERPARTY_TYPE')
  })
})

// ═══════════════════════════════════════════════════════════
// Regression (1 test)
// ═══════════════════════════════════════════════════════════
describe('Regression', () => {
  it('15. Existing invoice finalization still works with verification_series', () => {
    const seed = seedAll(db)
    const inv = saveDraft(db, {
      counterparty_id: seed.customerId,
      fiscal_year_id: seed.fiscalYearId,
      invoice_date: '2025-03-15',
      due_date: '2099-12-31',
      lines: [
        {
          product_id: seed.productId,
          description: 'Test',
          quantity: 1,
          unit_price_ore: 100000,
          vat_code_id: seed.vatCodeOutId,
          sort_order: 0,
        },
      ],
    })
    if (!inv.success) return

    const result = finalizeDraft(db, inv.data.id)
    expect(result.success).toBe(true)

    // Verify A-series
    const entry = db
      .prepare(
        "SELECT verification_series, verification_number FROM journal_entries WHERE verification_series = 'A' LIMIT 1",
      )
      .get() as { verification_series: string; verification_number: number }
    expect(entry.verification_series).toBe('A')
    expect(entry.verification_number).toBe(1)
  })
})
