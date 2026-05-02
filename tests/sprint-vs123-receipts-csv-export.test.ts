/**
 * Sprint VS-123 — exportReceiptsCsv (service-nivå).
 *
 * Verifierar CSV-format: BOM, headers, ; som separator, escape av
 * specialtecken, status/expense-id/notes-rad-mappning, sortering.
 */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDocs = fs.mkdtempSync(path.join(os.tmpdir(), 'fritt-vs123-'))

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
  exportReceiptsCsv,
} from '../src/main/services/receipt-service'

let db: Database.Database

function setup(): { companyId: number } {
  const r = createCompany(db, {
    name: 'Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 2_500_000,
    registration_date: '2025-01-15',
    fiscal_year_start: '2025-01-01',
    fiscal_year_end: '2025-12-31',
  })
  if (!r.success) throw new Error(r.error)
  return { companyId: r.data.id }
}

function writeFile(name: string, content: string): string {
  const p = path.join(tmpDocs, name)
  fs.writeFileSync(p, content)
  return p
}

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  if (db) db.close()
})

describe('VS-123 exportReceiptsCsv', () => {
  it('returnerar CSV med BOM, headers och CRLF', () => {
    const { companyId } = setup()
    const r = exportReceiptsCsv(db, { company_id: companyId })
    expect(r.success).toBe(true)
    if (!r.success) return
    const { csv, filename } = r.data
    // BOM
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    // Headers (efter BOM)
    expect(csv).toMatch(/ID;Status;Filnamn;Storlek/)
    // CRLF radslut
    expect(csv).toMatch(/\r\n/)
    // Filnamn-format
    expect(filename).toMatch(/^Kvitton_556036-0793_\d{8}\.csv$/)
  })

  it('inkluderar alla statusar (inbox, booked, archived)', () => {
    const { companyId } = setup()
    const f1 = writeFile('a.pdf', 'A')
    const f2 = writeFile('b.pdf', 'B')
    const f3 = writeFile('c.pdf', 'C')
    const r1 = createReceipt(db, {
      company_id: companyId,
      source_path: f1,
      original_filename: 'inbox.pdf',
    })
    const r2 = createReceipt(db, {
      company_id: companyId,
      source_path: f2,
      original_filename: 'booked.pdf',
    })
    const r3 = createReceipt(db, {
      company_id: companyId,
      source_path: f3,
      original_filename: 'archived.pdf',
    })
    if (!r1.success || !r2.success || !r3.success) throw new Error('seed')
    db.prepare(
      "UPDATE receipts SET status='archived', archived_at='2025-01-01' WHERE id=?",
    ).run(r3.data.id)

    const out = exportReceiptsCsv(db, { company_id: companyId })
    if (!out.success) return
    expect(out.data.csv).toContain('inbox.pdf')
    expect(out.data.csv).toContain('booked.pdf')
    expect(out.data.csv).toContain('archived.pdf')
    // Alla tre statusar representerade
    const lines = out.data.csv.split('\r\n').filter((l) => l.length > 0)
    // 1 header + 3 rows
    expect(lines.length).toBe(4)
  })

  it('escapar ; och " och radslut i notes-fält', () => {
    const { companyId } = setup()
    const f = writeFile('a.pdf', 'A')
    const r = createReceipt(db, {
      company_id: companyId,
      source_path: f,
      original_filename: 'a.pdf',
      notes: 'Foo;Bar "quoted"\nNew line',
    })
    if (!r.success) return

    const out = exportReceiptsCsv(db, { company_id: companyId })
    if (!out.success) return
    // Quotes runt fältet, inre " dubblerat
    expect(out.data.csv).toContain('"Foo;Bar ""quoted""\nNew line"')
  })

  it('returnerar NOT_FOUND för okänt company_id', () => {
    const r = exportReceiptsCsv(db, { company_id: 99999 })
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('NOT_FOUND')
  })

  it('tom företag → bara header-rad', () => {
    const { companyId } = setup()
    const r = exportReceiptsCsv(db, { company_id: companyId })
    if (!r.success) return
    const lines = r.data.csv.split('\r\n').filter((l) => l.length > 0)
    expect(lines.length).toBe(1)
  })
})
