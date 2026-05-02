/**
 * Sprint VS-107 — receipt-service: CRUD + bulk-archive + tx-helpers.
 */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDocs = fs.mkdtempSync(path.join(os.tmpdir(), 'fritt-vs107-'))

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
  listReceipts,
  createReceipt,
  updateReceiptNotes,
  archiveReceipt,
  bulkArchiveReceipts,
  getReceiptCounts,
  deleteReceipt,
  _linkReceiptToExpenseTx,
  _unlinkReceiptFromExpenseTx,
} from '../src/main/services/receipt-service'

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

describe('VS-107 createReceipt', () => {
  it('skapar inbox-rad och kopierar fil', () => {
    const companyId = setupCompany()
    const src = writeTempFile('kvitto-1.pdf', 'PDF-CONTENT-1')
    const r = createReceipt(db, {
      company_id: companyId,
      source_path: src,
      original_filename: 'kvitto-1.pdf',
    })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.status).toBe('inbox')
    expect(r.data.expense_id).toBeNull()
    expect(r.data.mime_type).toBe('application/pdf')
    expect(r.data.file_size_bytes).toBeGreaterThan(0)
    // Filen ska finnas under documents/Fritt Bokföring/receipts-inbox/
    const absolute = path.join(tmpDocs, 'Fritt Bokföring', r.data.file_path)
    expect(fs.existsSync(absolute)).toBe(true)
  })

  it('blockerar dubblett (samma hash i samma bolag)', () => {
    const companyId = setupCompany()
    const src1 = writeTempFile('a.pdf', 'IDENTISK-CONTENT')
    const src2 = writeTempFile('b.pdf', 'IDENTISK-CONTENT')
    const r1 = createReceipt(db, {
      company_id: companyId,
      source_path: src1,
      original_filename: 'a.pdf',
    })
    expect(r1.success).toBe(true)
    const r2 = createReceipt(db, {
      company_id: companyId,
      source_path: src2,
      original_filename: 'b.pdf',
    })
    expect(r2.success).toBe(false)
    if (r2.success) return
    expect(r2.code).toBe('RECEIPT_DUPLICATE_HASH')
  })

  it('tillåter samma hash i olika bolag', () => {
    const c1 = setupCompany('556036-0793')
    const c2 = setupCompany('556789-0123')
    const src = writeTempFile('shared.pdf', 'SHARED-CONTENT')
    expect(
      createReceipt(db, {
        company_id: c1,
        source_path: src,
        original_filename: 'shared.pdf',
      }).success,
    ).toBe(true)
    expect(
      createReceipt(db, {
        company_id: c2,
        source_path: src,
        original_filename: 'shared.pdf',
      }).success,
    ).toBe(true)
  })

  it('returnerar VALIDATION_ERROR när källfilen saknas', () => {
    const companyId = setupCompany()
    const r = createReceipt(db, {
      company_id: companyId,
      source_path: '/tmp/nonexistent-file-xyz.pdf',
      original_filename: 'x.pdf',
    })
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('VALIDATION_ERROR')
  })

  it('avvisar tom fil', () => {
    const companyId = setupCompany()
    const src = writeTempFile('empty.pdf', '')
    const r = createReceipt(db, {
      company_id: companyId,
      source_path: src,
      original_filename: 'empty.pdf',
    })
    expect(r.success).toBe(false)
  })
})

describe('VS-107 listReceipts + counts', () => {
  it('listar bara company-scope och filtrerar på status', () => {
    const c1 = setupCompany('556036-0793')
    const c2 = setupCompany('556789-0123')
    const src1 = writeTempFile('1.pdf', 'A')
    const src2 = writeTempFile('2.pdf', 'B')
    const src3 = writeTempFile('3.pdf', 'C')
    createReceipt(db, {
      company_id: c1,
      source_path: src1,
      original_filename: '1.pdf',
    })
    createReceipt(db, {
      company_id: c1,
      source_path: src2,
      original_filename: '2.pdf',
    })
    createReceipt(db, {
      company_id: c2,
      source_path: src3,
      original_filename: '3.pdf',
    })

    const list1 = listReceipts(db, { company_id: c1 })
    expect(list1.success).toBe(true)
    if (!list1.success) return
    expect(list1.data).toHaveLength(2)

    const list2 = listReceipts(db, { company_id: c2 })
    if (!list2.success) return
    expect(list2.data).toHaveLength(1)
  })

  it('counts grupperar per status', () => {
    const companyId = setupCompany()
    const src1 = writeTempFile('a.pdf', 'A')
    const src2 = writeTempFile('b.pdf', 'B')
    const r1 = createReceipt(db, {
      company_id: companyId,
      source_path: src1,
      original_filename: 'a.pdf',
    })
    createReceipt(db, {
      company_id: companyId,
      source_path: src2,
      original_filename: 'b.pdf',
    })
    if (!r1.success) return
    archiveReceipt(db, { id: r1.data.id, company_id: companyId })

    const c = getReceiptCounts(db, { company_id: companyId })
    expect(c.success).toBe(true)
    if (!c.success) return
    expect(c.data.inbox).toBe(1)
    expect(c.data.archived).toBe(1)
    expect(c.data.booked).toBe(0)
  })
})

describe('VS-107 archiveReceipt + delete', () => {
  it('arkiverar inbox-rad och sätter archived_at', () => {
    const companyId = setupCompany()
    const src = writeTempFile('a.pdf', 'A')
    const r = createReceipt(db, {
      company_id: companyId,
      source_path: src,
      original_filename: 'a.pdf',
    })
    if (!r.success) return
    const arch = archiveReceipt(db, {
      id: r.data.id,
      company_id: companyId,
    })
    expect(arch.success).toBe(true)
    if (!arch.success) return
    expect(arch.data.status).toBe('archived')
    expect(arch.data.archived_at).not.toBeNull()
  })

  it('blockerar arkivering av booked-rad', () => {
    const companyId = setupCompany()
    const src = writeTempFile('a.pdf', 'A')
    const r = createReceipt(db, {
      company_id: companyId,
      source_path: src,
      original_filename: 'a.pdf',
    })
    if (!r.success) return
    // Manuell expense + link
    const fy = db
      .prepare('SELECT id FROM fiscal_years WHERE company_id = ?')
      .get(companyId) as { id: number }
    const cp = db
      .prepare(
        `INSERT INTO counterparties (company_id, name, type)
         VALUES (?, 'X', 'supplier')`,
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
    db.transaction(() => {
      _linkReceiptToExpenseTx(
        db,
        r.data.id,
        companyId,
        Number(exp.lastInsertRowid),
      )
    })()

    const arch = archiveReceipt(db, {
      id: r.data.id,
      company_id: companyId,
    })
    expect(arch.success).toBe(false)
    if (arch.success) return
    expect(arch.code).toBe('RECEIPT_BOOKED')
  })

  it('delete tar bort archived-rad och raderar disk-fil', () => {
    const companyId = setupCompany()
    const src = writeTempFile('a.pdf', 'A')
    const r = createReceipt(db, {
      company_id: companyId,
      source_path: src,
      original_filename: 'a.pdf',
    })
    if (!r.success) return
    archiveReceipt(db, { id: r.data.id, company_id: companyId })
    const absolute = path.join(tmpDocs, 'Fritt Bokföring', r.data.file_path)
    expect(fs.existsSync(absolute)).toBe(true)

    const del = deleteReceipt(db, { id: r.data.id, company_id: companyId })
    expect(del.success).toBe(true)

    const row = db.prepare('SELECT id FROM receipts WHERE id = ?').get(r.data.id)
    expect(row).toBeUndefined()
    expect(fs.existsSync(absolute)).toBe(false)
  })
})

describe('VS-107 bulkArchiveReceipts', () => {
  it('arkiverar flera rader, returnerar succeeded/failed', () => {
    const companyId = setupCompany()
    const ids: number[] = []
    for (let i = 0; i < 3; i++) {
      const src = writeTempFile(`r-${i}.pdf`, `CONTENT-${i}`)
      const r = createReceipt(db, {
        company_id: companyId,
        source_path: src,
        original_filename: `r-${i}.pdf`,
      })
      if (r.success) ids.push(r.data.id)
    }
    expect(ids).toHaveLength(3)
    const r = bulkArchiveReceipts(db, { ids, company_id: companyId })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.succeeded).toEqual(ids)
    expect(r.data.failed).toEqual([])
  })

  it('blandar succeed och fail (ej-existerande id)', () => {
    const companyId = setupCompany()
    const src = writeTempFile('ok.pdf', 'OK')
    const r1 = createReceipt(db, {
      company_id: companyId,
      source_path: src,
      original_filename: 'ok.pdf',
    })
    if (!r1.success) return
    const r = bulkArchiveReceipts(db, {
      ids: [r1.data.id, 99999],
      company_id: companyId,
    })
    if (!r.success) return
    expect(r.data.succeeded).toEqual([r1.data.id])
    expect(r.data.failed).toHaveLength(1)
    expect(r.data.failed[0]?.code).toBe('RECEIPT_NOT_FOUND')
  })
})

describe('VS-107 _linkReceiptToExpenseTx + _unlinkReceiptFromExpenseTx', () => {
  it('link sätter status=booked, unlink återställer till inbox', () => {
    const companyId = setupCompany()
    const src = writeTempFile('a.pdf', 'A')
    const r = createReceipt(db, {
      company_id: companyId,
      source_path: src,
      original_filename: 'a.pdf',
    })
    if (!r.success) return
    const fy = db
      .prepare('SELECT id FROM fiscal_years WHERE company_id = ?')
      .get(companyId) as { id: number }
    const cp = db
      .prepare(
        `INSERT INTO counterparties (company_id, name, type)
         VALUES (?, 'X', 'supplier')`,
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
    const expenseId = Number(exp.lastInsertRowid)

    db.transaction(() => {
      _linkReceiptToExpenseTx(db, r.data.id, companyId, expenseId)
    })()
    let row = db
      .prepare('SELECT status, expense_id FROM receipts WHERE id = ?')
      .get(r.data.id) as { status: string; expense_id: number | null }
    expect(row.status).toBe('booked')
    expect(row.expense_id).toBe(expenseId)

    db.transaction(() => {
      _unlinkReceiptFromExpenseTx(db, expenseId)
    })()
    row = db
      .prepare('SELECT status, expense_id FROM receipts WHERE id = ?')
      .get(r.data.id) as { status: string; expense_id: number | null }
    expect(row.status).toBe('inbox')
    expect(row.expense_id).toBeNull()
  })

  it('link kastar RECEIPT_NOT_FOUND för okänt id', () => {
    const companyId = setupCompany()
    let caught: unknown
    try {
      db.transaction(() => {
        _linkReceiptToExpenseTx(db, 99999, companyId, 1)
      })()
    } catch (err) {
      caught = err
    }
    expect(caught).toMatchObject({ code: 'RECEIPT_NOT_FOUND' })
  })

  it('link kastar VALIDATION_ERROR om receipt redan är booked', () => {
    const companyId = setupCompany()
    const src = writeTempFile('a.pdf', 'A')
    const r = createReceipt(db, {
      company_id: companyId,
      source_path: src,
      original_filename: 'a.pdf',
    })
    if (!r.success) return
    archiveReceipt(db, { id: r.data.id, company_id: companyId })
    let caught: unknown
    try {
      db.transaction(() => {
        _linkReceiptToExpenseTx(db, r.data.id, companyId, 1)
      })()
    } catch (err) {
      caught = err
    }
    expect(caught).toMatchObject({ code: 'VALIDATION_ERROR' })
  })
})

describe('VS-107 updateReceiptNotes', () => {
  it('uppdaterar notes på inbox-rad', () => {
    const companyId = setupCompany()
    const src = writeTempFile('a.pdf', 'A')
    const r = createReceipt(db, {
      company_id: companyId,
      source_path: src,
      original_filename: 'a.pdf',
    })
    if (!r.success) return
    const u = updateReceiptNotes(db, {
      id: r.data.id,
      company_id: companyId,
      notes: 'Lunch med kund',
    })
    expect(u.success).toBe(true)
    if (!u.success) return
    expect(u.data.notes).toBe('Lunch med kund')
  })

  it('returnerar RECEIPT_NOT_FOUND för okänt id', () => {
    const companyId = setupCompany()
    const u = updateReceiptNotes(db, {
      id: 99999,
      company_id: companyId,
      notes: null,
    })
    expect(u.success).toBe(false)
    if (u.success) return
    expect(u.code).toBe('RECEIPT_NOT_FOUND')
  })
})
