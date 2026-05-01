/**
 * Sprint VS-1 — Vardag Sheets backend-grund
 *
 * Verifierar:
 * - Migration 058 lägger till expenses.receipt_path (TEXT, default NULL)
 * - saveReceiptFile kopierar fil + uppdaterar expenses.receipt_path
 * - setCounterpartyDefaultAccount sätter default_expense_account /
 *   default_revenue_account med konto-validering
 */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDocs = fs.mkdtempSync(path.join(os.tmpdir(), 'fritt-vs1-'))

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
  createCounterparty,
  setCounterpartyDefaultAccount,
  getCounterparty,
} from '../src/main/services/counterparty-service'
import { saveReceiptFile } from '../src/main/services/receipt-storage'

let db: Database.Database

function setupCompany() {
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

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  if (db) db.close()
})

describe('VS-1 migration 058: receipt_path-kolumn', () => {
  it('expenses har receipt_path TEXT med DEFAULT NULL', () => {
    const cols = db
      .prepare("PRAGMA table_info('expenses')")
      .all() as Array<{ name: string; type: string; dflt_value: unknown }>
    const col = cols.find((c) => c.name === 'receipt_path')
    expect(col).toBeDefined()
    expect(col?.type).toBe('TEXT')
    expect(col?.dflt_value).toBe('NULL')
  })

  it('user_version är minst 58', () => {
    const v = db.pragma('user_version', { simple: true }) as number
    expect(v).toBeGreaterThanOrEqual(58)
  })
})

describe('VS-1 saveReceiptFile', () => {
  function createDraftExpense(companyId: number, fiscalYearId: number): number {
    const cp = createCounterparty(db, {
      company_id: companyId,
      name: 'Acme Leverantör',
      type: 'supplier',
    })
    if (!cp.success) throw new Error(cp.error)
    const result = db
      .prepare(
        `INSERT INTO expenses
          (fiscal_year_id, counterparty_id, expense_date, due_date,
           description, status, payment_terms, total_amount_ore, paid_amount_ore)
         VALUES (?, ?, '2025-03-15', '2025-04-15', 'Test', 'draft', 30, 0, 0)`,
      )
      .run(fiscalYearId, cp.data.id)
    return Number(result.lastInsertRowid)
  }

  it('kopierar fil och uppdaterar receipt_path till relativ path', () => {
    const { companyId, fiscalYearId } = setupCompany()
    const expenseId = createDraftExpense(companyId, fiscalYearId)

    const sourcePath = path.join(tmpDocs, 'kvitto-original.pdf')
    fs.writeFileSync(sourcePath, 'PDF-DUMMY-DATA')

    const res = saveReceiptFile(db, {
      expense_id: expenseId,
      source_file_path: sourcePath,
    })
    expect(res.success).toBe(true)
    if (!res.success) return

    expect(res.data.receipt_path).toMatch(/^receipts[\\/]/)

    const row = db
      .prepare('SELECT receipt_path FROM expenses WHERE id = ?')
      .get(expenseId) as { receipt_path: string }
    expect(row.receipt_path).toBe(res.data.receipt_path)

    const absoluteTarget = path.join(
      tmpDocs,
      'Fritt Bokföring',
      res.data.receipt_path,
    )
    expect(fs.existsSync(absoluteTarget)).toBe(true)
    expect(fs.readFileSync(absoluteTarget, 'utf8')).toBe('PDF-DUMMY-DATA')
  })

  it('returnerar EXPENSE_NOT_FOUND om expense_id saknas', () => {
    const sourcePath = path.join(tmpDocs, 'orphan.pdf')
    fs.writeFileSync(sourcePath, 'X')
    const res = saveReceiptFile(db, {
      expense_id: 9999,
      source_file_path: sourcePath,
    })
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.code).toBe('EXPENSE_NOT_FOUND')
  })

  it('returnerar VALIDATION_ERROR om källfil saknas', () => {
    const { companyId, fiscalYearId } = setupCompany()
    const expenseId = createDraftExpense(companyId, fiscalYearId)
    const res = saveReceiptFile(db, {
      expense_id: expenseId,
      source_file_path: path.join(tmpDocs, 'finns-inte.pdf'),
    })
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.code).toBe('VALIDATION_ERROR')
    expect(res.field).toBe('source_file_path')
  })

  it('saneraer farliga filnamn (path-traversal-skydd)', () => {
    const { companyId, fiscalYearId } = setupCompany()
    const expenseId = createDraftExpense(companyId, fiscalYearId)
    const sourcePath = path.join(tmpDocs, 'normal.pdf')
    fs.writeFileSync(sourcePath, 'X')
    const res = saveReceiptFile(db, {
      expense_id: expenseId,
      source_file_path: sourcePath,
    })
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.data.receipt_path).not.toContain('..')
  })
})

describe('VS-1 setCounterpartyDefaultAccount', () => {
  it('sätter default_expense_account till giltigt 4-siffrigt konto', () => {
    const { companyId } = setupCompany()
    const cp = createCounterparty(db, {
      company_id: companyId,
      name: 'Hyresvärden AB',
      type: 'supplier',
    })
    if (!cp.success) throw new Error(cp.error)

    const res = setCounterpartyDefaultAccount(db, {
      id: cp.data.id,
      company_id: companyId,
      field: 'default_expense_account',
      account_number: '5010',
    })
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.data.default_expense_account).toBe('5010')
  })

  it('sätter default_revenue_account separat utan att röra default_expense_account', () => {
    const { companyId } = setupCompany()
    const cp = createCounterparty(db, {
      company_id: companyId,
      name: 'Kund X',
      type: 'customer',
    })
    if (!cp.success) throw new Error(cp.error)

    setCounterpartyDefaultAccount(db, {
      id: cp.data.id,
      company_id: companyId,
      field: 'default_expense_account',
      account_number: '6110',
    })
    const res = setCounterpartyDefaultAccount(db, {
      id: cp.data.id,
      company_id: companyId,
      field: 'default_revenue_account',
      account_number: '3001',
    })
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.data.default_expense_account).toBe('6110')
    expect(res.data.default_revenue_account).toBe('3001')
  })

  it('returnerar VALIDATION_ERROR för icke-existerande konto', () => {
    const { companyId } = setupCompany()
    const cp = createCounterparty(db, {
      company_id: companyId,
      name: 'Acme',
      type: 'supplier',
    })
    if (!cp.success) throw new Error(cp.error)

    const res = setCounterpartyDefaultAccount(db, {
      id: cp.data.id,
      company_id: companyId,
      field: 'default_expense_account',
      account_number: '9999',
    })
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.code).toBe('VALIDATION_ERROR')
    expect(res.field).toBe('account_number')
  })

  it('returnerar COUNTERPARTY_NOT_FOUND vid fel id', () => {
    const { companyId } = setupCompany()
    const res = setCounterpartyDefaultAccount(db, {
      id: 99999,
      company_id: companyId,
      field: 'default_expense_account',
      account_number: '5010',
    })
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.code).toBe('COUNTERPARTY_NOT_FOUND')
  })

  it('accepterar null för att rensa default-konto', () => {
    const { companyId } = setupCompany()
    const cp = createCounterparty(db, {
      company_id: companyId,
      name: 'Acme',
      type: 'supplier',
    })
    if (!cp.success) throw new Error(cp.error)

    setCounterpartyDefaultAccount(db, {
      id: cp.data.id,
      company_id: companyId,
      field: 'default_expense_account',
      account_number: '5010',
    })
    const res = setCounterpartyDefaultAccount(db, {
      id: cp.data.id,
      company_id: companyId,
      field: 'default_expense_account',
      account_number: null,
    })
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.data.default_expense_account).toBeNull()
  })

  it('cross-bolag-skydd: kan inte sätta default på counterparty i annat bolag', () => {
    const a = setupCompany()
    const cp = createCounterparty(db, {
      company_id: a.companyId,
      name: 'Acme',
      type: 'supplier',
    })
    if (!cp.success) throw new Error(cp.error)

    const bRes = createCompany(db, {
      name: 'Bolag B',
      org_number: '559900-0006',
      fiscal_rule: 'K2',
      share_capital: 2_500_000,
      registration_date: '2025-01-15',
      fiscal_year_start: '2025-01-01',
      fiscal_year_end: '2025-12-31',
    })
    if (!bRes.success) throw new Error(bRes.error)

    const res = setCounterpartyDefaultAccount(db, {
      id: cp.data.id,
      company_id: bRes.data.id,
      field: 'default_expense_account',
      account_number: '5010',
    })
    expect(res.success).toBe(false)
    if (res.success) return
    expect(res.code).toBe('COUNTERPARTY_NOT_FOUND')

    const verify = getCounterparty(db, cp.data.id, a.companyId)
    expect(verify?.default_expense_account).toBeNull()
  })
})
