import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import {
  saveExpenseDraft,
  getExpenseDraft,
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

function seed() {
  createCompany(db, VALID_COMPANY)
  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  const supplier = createCounterparty(db, { name: 'Lev AB', type: 'supplier' })
  if (!supplier.success) throw new Error('seed failed')
  const vatCode25 = db.prepare("SELECT id FROM vat_codes WHERE code = 'IP1'").get() as { id: number }
  return { fiscalYearId: fy.id, supplierId: supplier.data.id, vatCode25Id: vatCode25.id }
}

function makeExpense(s: ReturnType<typeof seed>, quantity: number, unitPriceOre: number) {
  return saveExpenseDraft(db, {
    fiscal_year_id: s.fiscalYearId,
    counterparty_id: s.supplierId,
    expense_date: '2025-03-15',
    description: 'Test',
    payment_terms: 30,
    notes: '',
    lines: [{
      description: 'Rad',
      account_number: '6110',
      quantity,
      unit_price_ore: unitPriceOre,
      vat_code_id: s.vatCode25Id,
    }],
  })
}

beforeEach(() => { db = createTestDb() })
afterEach(() => { if (db) db.close() })

describe('F27 regression: expense quantity * unit_price computation', () => {
  it('1 styck × 1000 kr (100000 öre) → line_total = 100000 öre, total = 125000 öre', () => {
    const s = seed()
    const result = makeExpense(s, 1, 100000)
    expect(result.success).toBe(true)
    if (!result.success) return

    const draft = getExpenseDraft(db, result.data.id)
    if (!draft.success || !draft.data) throw new Error('draft missing')

    expect(draft.data.lines[0].line_total_ore).toBe(100000)
    expect(draft.data.lines[0].vat_amount_ore).toBe(25000)
    expect(draft.data.total_amount_ore).toBe(125000)
  })

  it('2 styck × 500 kr (50000 öre) → line_total = 100000 öre, total = 125000 öre', () => {
    const s = seed()
    const result = makeExpense(s, 2, 50000)
    if (!result.success) throw new Error('save failed')
    const draft = getExpenseDraft(db, result.data.id)
    if (!draft.success || !draft.data) throw new Error('draft missing')

    expect(draft.data.lines[0].line_total_ore).toBe(100000)
    expect(draft.data.lines[0].vat_amount_ore).toBe(25000)
    expect(draft.data.total_amount_ore).toBe(125000)
  })

  it('10 styck × 150 kr (15000 öre) → line_total = 150000 öre, total = 187500 öre', () => {
    const s = seed()
    const result = makeExpense(s, 10, 15000)
    if (!result.success) throw new Error('save failed')
    const draft = getExpenseDraft(db, result.data.id)
    if (!draft.success || !draft.data) throw new Error('draft missing')

    expect(draft.data.lines[0].line_total_ore).toBe(150000)
    expect(draft.data.lines[0].vat_amount_ore).toBe(37500)
    expect(draft.data.total_amount_ore).toBe(187500)
  })

  it('finalize: bokförd journal_entry har korrekt belopp på 2440 (lev.skuld)', () => {
    const s = seed()
    const result = makeExpense(s, 1, 100000)
    if (!result.success) throw new Error('save failed')

    const finalized = finalizeExpense(db, result.data.id)
    expect(finalized.success).toBe(true)

    const expense = db.prepare('SELECT journal_entry_id FROM expenses WHERE id = ?').get(result.data.id) as { journal_entry_id: number }
    const lines = db.prepare(
      'SELECT account_number, debit_amount, credit_amount FROM journal_entry_lines WHERE journal_entry_id = ?'
    ).all(expense.journal_entry_id) as { account_number: string; debit_amount: number; credit_amount: number }[]

    const d6110 = lines.find(l => l.account_number === '6110')
    expect(d6110?.debit_amount).toBe(100000)

    const d2640 = lines.find(l => l.account_number === '2640')
    expect(d2640?.debit_amount).toBe(25000)

    const c2440 = lines.find(l => l.account_number === '2440')
    expect(c2440?.credit_amount).toBe(125000)

    const totalD = lines.reduce((s, l) => s + l.debit_amount, 0)
    const totalC = lines.reduce((s, l) => s + l.credit_amount, 0)
    expect(totalD).toBe(totalC)
    expect(totalD).toBe(125000)
  })
})
