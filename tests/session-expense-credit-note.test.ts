import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import {
  saveExpenseDraft,
  finalizeExpense,
  createExpenseCreditNoteDraft,
  listExpenses,
} from '../src/main/services/expense-service'

let db: Database.Database

const VALID_COMPANY = {
  name: 'Test AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2026-01-15',
  fiscal_year_start: '2026-01-01',
  fiscal_year_end: '2026-12-31',
}

function seedAll(testDb: Database.Database) {
  createCompany(testDb, VALID_COMPANY)
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  const cp = createCounterparty(testDb, { name: 'Leverantör AB', type: 'supplier' })
  if (!cp.success) throw new Error('CP failed')
  const vatCode = testDb.prepare("SELECT id FROM vat_codes WHERE code = 'IP1'").get() as { id: number }
  return {
    fiscalYearId: fy.id,
    cpId: cp.data.id,
    vatCodeId: vatCode.id,
  }
}

function createFinalizedExpense(testDb: Database.Database, seed: ReturnType<typeof seedAll>) {
  const result = saveExpenseDraft(testDb, {
    counterparty_id: seed.cpId,
    fiscal_year_id: seed.fiscalYearId,
    expense_date: '2026-03-15',
    description: 'Kontorsmaterial',
    lines: [{
      description: 'Pennor',
      account_number: '5410',
      quantity: 10,
      unit_price_ore: 5000,
      vat_code_id: seed.vatCodeId,
      sort_order: 0,
    }],
  })
  if (!result.success) throw new Error('Draft failed: ' + result.error)
  const fResult = finalizeExpense(testDb, result.data.id)
  if (!fResult.success) throw new Error('Finalize failed: ' + fResult.error)
  return { id: result.data.id, ...fResult.data }
}

beforeEach(() => { db = createTestDb() })
afterEach(() => { db.close() })

describe('Leverantörskreditnotor', () => {
  describe('createExpenseCreditNoteDraft', () => {
    it('skapar kreditnota-utkast med kopierade rader', () => {
      const seed = seedAll(db)
      const expense = createFinalizedExpense(db, seed)

      const result = createExpenseCreditNoteDraft(db, {
        original_expense_id: expense.id,
        fiscal_year_id: seed.fiscalYearId,
      })

      expect(result.success).toBe(true)
      if (!result.success) return

      // Verifiera att utkastet skapats
      const draft = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.data.id) as {
        expense_type: string; credits_expense_id: number; status: string
      }
      expect(draft.expense_type).toBe('credit_note')
      expect(draft.credits_expense_id).toBe(expense.id)
      expect(draft.status).toBe('draft')

      // Verifiera kopierade rader
      const lines = db.prepare('SELECT * FROM expense_lines WHERE expense_id = ?').all(result.data.id) as {
        description: string; quantity: number; unit_price_ore: number
      }[]
      expect(lines.length).toBe(1)
      expect(lines[0].description).toBe('Pennor')
      expect(lines[0].quantity).toBe(10)
      expect(lines[0].unit_price_ore).toBe(5000)
    })

    it('nekar kreditering av utkast', () => {
      const seed = seedAll(db)
      const draft = saveExpenseDraft(db, {
        counterparty_id: seed.cpId,
        fiscal_year_id: seed.fiscalYearId,
        expense_date: '2026-03-15',
        description: 'Test',
        lines: [{
          description: 'Rad',
          account_number: '5410',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: seed.vatCodeId,
          sort_order: 0,
        }],
      })
      if (!draft.success) throw new Error('Draft failed')

      const result = createExpenseCreditNoteDraft(db, {
        original_expense_id: draft.data.id,
        fiscal_year_id: seed.fiscalYearId,
      })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('CREDIT_NOTE_ORIGINAL_NOT_FOUND')
    })

    it('nekar kreditering av kreditnota', () => {
      const seed = seedAll(db)
      const expense = createFinalizedExpense(db, seed)

      const cn = createExpenseCreditNoteDraft(db, {
        original_expense_id: expense.id,
        fiscal_year_id: seed.fiscalYearId,
      })
      if (!cn.success) throw new Error('CN draft failed')
      const fnResult = finalizeExpense(db, cn.data.id)
      if (!fnResult.success) throw new Error('CN finalize failed: ' + fnResult.error)

      // Försök kreditera kreditnotan
      const result = createExpenseCreditNoteDraft(db, {
        original_expense_id: cn.data.id,
        fiscal_year_id: seed.fiscalYearId,
      })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.error).toContain('kreditnota')
    })

    it('nekar dubbelkreditering', () => {
      const seed = seedAll(db)
      const expense = createFinalizedExpense(db, seed)

      const cn1 = createExpenseCreditNoteDraft(db, {
        original_expense_id: expense.id,
        fiscal_year_id: seed.fiscalYearId,
      })
      expect(cn1.success).toBe(true)

      const cn2 = createExpenseCreditNoteDraft(db, {
        original_expense_id: expense.id,
        fiscal_year_id: seed.fiscalYearId,
      })
      expect(cn2.success).toBe(false)
      if (cn2.success) return
      expect(cn2.error).toContain('redan')
    })

    it('returnerar NOT_FOUND för obefintlig kostnad', () => {
      const seed = seedAll(db)

      const result = createExpenseCreditNoteDraft(db, {
        original_expense_id: 99999,
        fiscal_year_id: seed.fiscalYearId,
      })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('CREDIT_NOTE_ORIGINAL_NOT_FOUND')
    })
  })

  describe('Omvänd bokföring', () => {
    it('kreditnota bokförs med omvända journal lines (K kostnadskonto, K 2640, D 2440)', () => {
      const seed = seedAll(db)
      const expense = createFinalizedExpense(db, seed)

      const cn = createExpenseCreditNoteDraft(db, {
        original_expense_id: expense.id,
        fiscal_year_id: seed.fiscalYearId,
      })
      if (!cn.success) throw new Error('CN draft failed')

      const fnResult = finalizeExpense(db, cn.data.id)
      if (!fnResult.success) throw new Error('CN finalize failed: ' + fnResult.error)

      const journalEntryId = fnResult.data.id
      const je = db.prepare('SELECT journal_entry_id FROM expenses WHERE id = ?').get(journalEntryId) as { journal_entry_id: number }

      const lines = db.prepare(`
        SELECT jel.account_number, jel.debit_ore, jel.credit_ore
        FROM journal_entry_lines jel
        WHERE jel.journal_entry_id = ?
        ORDER BY jel.line_number
      `).all(je.journal_entry_id) as { account_number: string; debit_ore: number; credit_ore: number }[]

      // Kostnadskonto ska vara KREDIT (inte DEBET)
      const cost = lines.find(l => l.account_number === '5410')!
      expect(cost.debit_ore).toBe(0)
      expect(cost.credit_ore).toBeGreaterThan(0)

      // 2640 (ingående moms) ska vara KREDIT (inte DEBET)
      const vat = lines.find(l => l.account_number === '2640')!
      expect(vat.debit_ore).toBe(0)
      expect(vat.credit_ore).toBeGreaterThan(0)

      // 2440 (leverantörsskulder) ska vara DEBET (inte KREDIT)
      const ap = lines.find(l => l.account_number === '2440')!
      expect(ap.debit_ore).toBeGreaterThan(0)
      expect(ap.credit_ore).toBe(0)

      // Verifikat ska balansera
      const totalDebit = lines.reduce((sum, l) => sum + l.debit_ore, 0)
      const totalCredit = lines.reduce((sum, l) => sum + l.credit_ore, 0)
      expect(totalDebit).toBe(totalCredit)
    })

    it('verifikationstext innehåller referens till originalkostnad', () => {
      const seed = seedAll(db)
      const expense = createFinalizedExpense(db, seed)

      const cn = createExpenseCreditNoteDraft(db, {
        original_expense_id: expense.id,
        fiscal_year_id: seed.fiscalYearId,
      })
      if (!cn.success) throw new Error('CN draft failed')

      const fnResult = finalizeExpense(db, cn.data.id)
      if (!fnResult.success) throw new Error('CN finalize failed: ' + fnResult.error)

      const je = db.prepare('SELECT journal_entry_id FROM expenses WHERE id = ?').get(cn.data.id) as { journal_entry_id: number }
      const entry = db.prepare('SELECT description FROM journal_entries WHERE id = ?')
        .get(je.journal_entry_id) as { description: string }

      expect(entry.description).toContain('Leverantörskredit')
      expect(entry.description).toContain('avser kostnad')
    })
  })

  describe('listExpenses', () => {
    it('visar has_credit_note för krediterad kostnad', () => {
      const seed = seedAll(db)
      const expense = createFinalizedExpense(db, seed)

      const cn = createExpenseCreditNoteDraft(db, {
        original_expense_id: expense.id,
        fiscal_year_id: seed.fiscalYearId,
      })
      if (!cn.success) throw new Error('CN draft failed')

      const list = listExpenses(db, { fiscal_year_id: seed.fiscalYearId })
      const original = list.expenses.find(i => i.id === expense.id)!
      expect(original.has_credit_note).toBeTruthy()

      const creditNote = list.expenses.find(i => i.id === cn.data.id)!
      expect(creditNote.expense_type).toBe('credit_note')
      expect(creditNote.credits_expense_id).toBe(expense.id)
    })
  })
})
