/**
 * Sprint VS-111 — linkReceiptToExpense (publik IPC).
 */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDocs = fs.mkdtempSync(path.join(os.tmpdir(), 'fritt-vs111-'))

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

import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import {
  createReceipt,
  linkReceiptToExpense,
} from '../src/main/services/receipt-service'

let db: Database.Database

function setupCompany(orgNumber = '556036-0793'): {
  companyId: number
  fiscalYearId: number
} {
  const res = createCompany(db, {
    name: `Test AB ${orgNumber}`,
    org_number: orgNumber,
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

function writeTempFile(name: string, content: string): string {
  const filePath = path.join(tmpDocs, name)
  fs.writeFileSync(filePath, content)
  return filePath
}

function createDraftExpense(companyId: number, fiscalYearId: number): number {
  const cp = db
    .prepare(
      `INSERT INTO counterparties (company_id, name, type)
       VALUES (?, 'X', 'supplier')`,
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

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  if (db) db.close()
})

describe('VS-111 linkReceiptToExpense (publik wrapper)', () => {
  it('kopplar inbox-receipt till expense + speglar receipt_path', () => {
    const { companyId, fiscalYearId } = setupCompany()
    const src = writeTempFile('a.pdf', 'A')
    const r = createReceipt(db, {
      company_id: companyId,
      source_path: src,
      original_filename: 'a.pdf',
    })
    if (!r.success) throw new Error(r.error)
    const expenseId = createDraftExpense(companyId, fiscalYearId)

    const link = linkReceiptToExpense(db, {
      receipt_id: r.data.id,
      expense_id: expenseId,
      company_id: companyId,
    })
    expect(link.success).toBe(true)

    const receipt = db
      .prepare('SELECT status, expense_id FROM receipts WHERE id = ?')
      .get(r.data.id) as { status: string; expense_id: number }
    expect(receipt.status).toBe('booked')
    expect(receipt.expense_id).toBe(expenseId)

    const expense = db
      .prepare('SELECT receipt_path FROM expenses WHERE id = ?')
      .get(expenseId) as { receipt_path: string | null }
    expect(expense.receipt_path).toBe(r.data.file_path)
  })

  it('failar med RECEIPT_NOT_FOUND för okänt id', () => {
    const { companyId, fiscalYearId } = setupCompany()
    const expenseId = createDraftExpense(companyId, fiscalYearId)
    const link = linkReceiptToExpense(db, {
      receipt_id: 99999,
      expense_id: expenseId,
      company_id: companyId,
    })
    expect(link.success).toBe(false)
    if (link.success) return
    expect(link.code).toBe('RECEIPT_NOT_FOUND')
  })

  it('failar med VALIDATION_ERROR om receipt redan är arkiverad', () => {
    const { companyId, fiscalYearId } = setupCompany()
    const src = writeTempFile('a.pdf', 'A')
    const r = createReceipt(db, {
      company_id: companyId,
      source_path: src,
      original_filename: 'a.pdf',
    })
    if (!r.success) throw new Error(r.error)
    db.prepare(
      "UPDATE receipts SET status='archived', archived_at = datetime('now') WHERE id = ?",
    ).run(r.data.id)
    const expenseId = createDraftExpense(companyId, fiscalYearId)
    const link = linkReceiptToExpense(db, {
      receipt_id: r.data.id,
      expense_id: expenseId,
      company_id: companyId,
    })
    expect(link.success).toBe(false)
    if (link.success) return
    expect(link.code).toBe('VALIDATION_ERROR')
  })

  it('rejekterar input från annat bolag', () => {
    const { companyId } = setupCompany('556036-0793')
    const { companyId: c2, fiscalYearId: fy2 } = setupCompany('556789-0123')
    const src = writeTempFile('a.pdf', 'A')
    const r = createReceipt(db, {
      company_id: companyId,
      source_path: src,
      original_filename: 'a.pdf',
    })
    if (!r.success) throw new Error(r.error)
    const expenseId = createDraftExpense(c2, fy2)
    const link = linkReceiptToExpense(db, {
      receipt_id: r.data.id,
      expense_id: expenseId,
      company_id: c2, // fel bolag för receipten
    })
    expect(link.success).toBe(false)
    if (link.success) return
    expect(link.code).toBe('RECEIPT_NOT_FOUND')
  })
})
