/**
 * Sprint VS-119 — deleteExpenseDraft hookar _unlinkReceiptFromExpenseTx.
 *
 * Verifierar att radering av en draft-expense som råkar ha en kopplad
 * receipt (booked-status) återställer receipten till inbox FÖRST, så
 * CHECK-constrainten i migration 059 inte bryts av FK ON DELETE SET NULL.
 *
 * Scenariot kan inte uppstå via nuvarande Vardag-flöde (link sker bara
 * efter finalize) men kan uppstå i framtida flöden eller om en utvecklare
 * av misstag kör manuell SQL. Testet är defense-in-depth.
 */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDocs = fs.mkdtempSync(path.join(os.tmpdir(), 'fritt-vs119-'))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'documents') return tmpDocs
      throw new Error(`unexpected getPath: ${name}`)
    },
  },
}))

vi.mock('electron-log/main', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createReceipt } from '../src/main/services/receipt-service'
import { deleteExpenseDraft } from '../src/main/services/expense-service'

let db: Database.Database

function setupCompany(): { companyId: number; fiscalYearId: number } {
  const res = createCompany(db, {
    name: 'Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 2_500_000,
    registration_date: '2025-01-15',
    fiscal_year_start: '2025-01-01',
    fiscal_year_end: '2025-12-31',
  })
  if (!res.success) throw new Error(`createCompany failed: ${res.error}`)
  const fy = db
    .prepare('SELECT id FROM fiscal_years WHERE company_id = ?')
    .get(res.data.id) as { id: number }
  return { companyId: res.data.id, fiscalYearId: fy.id }
}

function createDraftExpense(companyId: number, fiscalYearId: number): number {
  const cp = db
    .prepare(
      `INSERT INTO counterparties (company_id, name, type)
       VALUES (?, 'Leverantör X', 'supplier')`,
    )
    .run(companyId)
  const result = db
    .prepare(
      `INSERT INTO expenses
        (fiscal_year_id, counterparty_id, expense_date, due_date,
         description, status, payment_terms, total_amount_ore, paid_amount_ore)
       VALUES (?, ?, '2025-03-15', '2025-04-15', 'Test', 'draft', 30, 0, 0)`,
    )
    .run(fiscalYearId, cp.lastInsertRowid)
  return Number(result.lastInsertRowid)
}

function writeTempFile(name: string, content: string): string {
  const filePath = path.join(tmpDocs, name)
  fs.writeFileSync(filePath, content)
  return filePath
}

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  if (db) db.close()
})

describe('VS-119 deleteExpenseDraft + receipt-unlink', () => {
  it('raderar draft utan receipt — ingen sidoeffekt', () => {
    const { companyId, fiscalYearId } = setupCompany()
    const expenseId = createDraftExpense(companyId, fiscalYearId)

    const res = deleteExpenseDraft(db, expenseId)
    expect(res.success).toBe(true)

    const exists = db
      .prepare('SELECT id FROM expenses WHERE id = ?')
      .get(expenseId)
    expect(exists).toBeUndefined()
  })

  it('raderar draft med kopplad booked-receipt och flyttar receipt till inbox', () => {
    const { companyId, fiscalYearId } = setupCompany()
    const expenseId = createDraftExpense(companyId, fiscalYearId)

    // Skapa receipt + tvinga in den i booked-tillstånd länkad till draften.
    // Bypassar normal link-validering (som kräver finalize).
    const src = writeTempFile('a.pdf', 'A')
    const r = createReceipt(db, {
      company_id: companyId,
      source_path: src,
      original_filename: 'a.pdf',
    })
    if (!r.success) throw new Error(r.error)
    db.prepare(
      `UPDATE receipts SET status='booked', expense_id=? WHERE id=?`,
    ).run(expenseId, r.data.id)

    // Sanity: CHECK-constrainten är uppfylld nu.
    const before = db
      .prepare('SELECT status, expense_id FROM receipts WHERE id = ?')
      .get(r.data.id) as { status: string; expense_id: number }
    expect(before.status).toBe('booked')
    expect(before.expense_id).toBe(expenseId)

    const res = deleteExpenseDraft(db, expenseId)
    expect(res.success).toBe(true)

    // Expense är borta
    const exists = db
      .prepare('SELECT id FROM expenses WHERE id = ?')
      .get(expenseId)
    expect(exists).toBeUndefined()

    // Receipt är tillbaka i inbox med expense_id=NULL — CHECK uppfylld.
    const after = db
      .prepare('SELECT status, expense_id FROM receipts WHERE id = ?')
      .get(r.data.id) as { status: string; expense_id: number | null }
    expect(after.status).toBe('inbox')
    expect(after.expense_id).toBeNull()
  })

  it('blockar radering av icke-draft (befintlig invariant)', () => {
    const { companyId, fiscalYearId } = setupCompany()
    const expenseId = createDraftExpense(companyId, fiscalYearId)
    db.prepare("UPDATE expenses SET status='unpaid' WHERE id = ?").run(
      expenseId,
    )

    const res = deleteExpenseDraft(db, expenseId)
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.code).toBe('VALIDATION_ERROR')
  })

  it('returnerar EXPENSE_NOT_FOUND för okänt id', () => {
    const res = deleteExpenseDraft(db, 99999)
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.code).toBe('EXPENSE_NOT_FOUND')
  })
})
