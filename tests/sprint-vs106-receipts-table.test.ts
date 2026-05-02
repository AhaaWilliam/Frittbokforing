/**
 * Sprint VS-106 — Inkorgen-domänen, fundament
 *
 * Verifierar migration 059:
 * - receipts-tabell skapas med rätt kolumner och CHECK-constraints
 * - Indexen idx_receipts_company_status / _expense / _uploaded_at finns
 * - trg_receipts_company_immutable hindrar UPDATE av company_id
 * - UNIQUE (company_id, file_hash) blockerar dubbletter inom bolag
 * - status-CHECK och status/expense_id-konsistens-CHECK fungerar
 */
import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'

let db: Database.Database

function setupCompany(orgNumber = '556036-0793'): number {
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
  return res.data.id
}

function insertReceipt(
  companyId: number,
  overrides: Partial<{
    file_path: string
    file_hash: string
    file_size_bytes: number
    mime_type: string
    status: string
    expense_id: number | null
  }> = {},
): number {
  const params = {
    file_path: 'receipts-inbox/abc.pdf',
    original_filename: 'abc.pdf',
    file_hash: 'hash-' + Math.random().toString(36).slice(2),
    file_size_bytes: 1024,
    mime_type: 'application/pdf',
    status: 'inbox',
    expense_id: null as number | null,
    ...overrides,
  }
  const result = db
    .prepare(
      `INSERT INTO receipts
        (company_id, file_path, original_filename, file_hash,
         file_size_bytes, mime_type, status, expense_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      companyId,
      params.file_path,
      params.original_filename,
      params.file_hash,
      params.file_size_bytes,
      params.mime_type,
      params.status,
      params.expense_id,
    )
  return Number(result.lastInsertRowid)
}

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  if (db) db.close()
})

describe('VS-106 migration 059: receipts-tabell', () => {
  it('user_version är minst 59', () => {
    const v = db.pragma('user_version', { simple: true }) as number
    expect(v).toBeGreaterThanOrEqual(59)
  })

  it('receipts-tabellen finns med förväntade kolumner', () => {
    const cols = db
      .prepare("PRAGMA table_info('receipts')")
      .all() as Array<{ name: string; type: string; notnull: number }>
    const names = cols.map((c) => c.name).sort()
    expect(names).toEqual(
      [
        'archived_at',
        'company_id',
        'expense_id',
        'file_hash',
        'file_path',
        'file_size_bytes',
        'id',
        'mime_type',
        'notes',
        'original_filename',
        'status',
        'uploaded_at',
      ].sort(),
    )
  })

  it('förväntade index finns', () => {
    const idx = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='receipts' ORDER BY name",
      )
      .all() as Array<{ name: string }>
    const names = idx.map((i) => i.name)
    expect(names).toContain('idx_receipts_company_status')
    expect(names).toContain('idx_receipts_expense')
    expect(names).toContain('idx_receipts_uploaded_at')
  })

  it('default status är "inbox" och expense_id default NULL', () => {
    const companyId = setupCompany()
    const id = insertReceipt(companyId)
    const row = db
      .prepare('SELECT status, expense_id FROM receipts WHERE id = ?')
      .get(id) as { status: string; expense_id: number | null }
    expect(row.status).toBe('inbox')
    expect(row.expense_id).toBeNull()
  })
})

describe('VS-106 receipts CHECK-constraints', () => {
  it('status utanför enum blockeras', () => {
    const companyId = setupCompany()
    expect(() =>
      insertReceipt(companyId, { status: 'random' as string }),
    ).toThrow(/CHECK constraint/i)
  })

  it("status='booked' utan expense_id blockeras", () => {
    const companyId = setupCompany()
    expect(() =>
      insertReceipt(companyId, { status: 'booked', expense_id: null }),
    ).toThrow(/CHECK constraint/i)
  })

  it("status='inbox' med expense_id satt blockeras", () => {
    const companyId = setupCompany()
    const fy = db
      .prepare('SELECT id FROM fiscal_years WHERE company_id = ?')
      .get(companyId) as { id: number }
    const cp = db
      .prepare(
        `INSERT INTO counterparties (company_id, name, type)
         VALUES (?, 'Test Leverantör', 'supplier')`,
      )
      .run(companyId)
    const exp = db
      .prepare(
        `INSERT INTO expenses
          (fiscal_year_id, counterparty_id, expense_date, due_date,
           description, status, payment_terms, total_amount_ore, paid_amount_ore)
         VALUES (?, ?, '2025-03-15', '2025-04-15', 'Test', 'draft', 30, 0, 0)`,
      )
      .run(fy.id, cp.lastInsertRowid)
    expect(() =>
      insertReceipt(companyId, {
        status: 'inbox',
        expense_id: Number(exp.lastInsertRowid),
      }),
    ).toThrow(/CHECK constraint/i)
  })

  it('file_size_bytes <= 0 blockeras', () => {
    const companyId = setupCompany()
    expect(() =>
      insertReceipt(companyId, { file_size_bytes: 0 }),
    ).toThrow(/CHECK constraint/i)
  })
})

describe('VS-106 receipts UNIQUE (company_id, file_hash)', () => {
  it('samma hash i samma bolag blockeras', () => {
    const companyId = setupCompany()
    insertReceipt(companyId, { file_hash: 'duplicate-hash' })
    expect(() =>
      insertReceipt(companyId, { file_hash: 'duplicate-hash' }),
    ).toThrow(/UNIQUE constraint/i)
  })

  it('samma hash i olika bolag tillåts', () => {
    const c1 = setupCompany('556036-0793')
    const c2 = setupCompany('556789-0123')
    insertReceipt(c1, { file_hash: 'shared-hash' })
    expect(() =>
      insertReceipt(c2, { file_hash: 'shared-hash' }),
    ).not.toThrow()
  })
})

describe('VS-106 trg_receipts_company_immutable (M158-mönster)', () => {
  it('UPDATE av company_id blockeras', () => {
    const c1 = setupCompany('556036-0793')
    const c2 = setupCompany('556789-0123')
    const id = insertReceipt(c1)
    expect(() =>
      db.prepare('UPDATE receipts SET company_id = ? WHERE id = ?').run(c2, id),
    ).toThrow(/company_id på receipts får inte ändras/i)
  })

  it('UPDATE av andra fält tillåts', () => {
    const companyId = setupCompany()
    const id = insertReceipt(companyId)
    expect(() =>
      db.prepare('UPDATE receipts SET notes = ? WHERE id = ?').run('test', id),
    ).not.toThrow()
  })
})
