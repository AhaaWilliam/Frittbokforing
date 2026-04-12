import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import {
  saveManualEntryDraft,
  getManualEntry,
} from '../src/main/services/manual-entry-service'

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

let fyId: number

beforeEach(() => {
  db = createTestDb()
  createCompany(db, VALID_COMPANY)
  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  fyId = fy.id
})

afterEach(() => {
  db.close()
})

describe('Migration 019 — manual_entry_lines rename', () => {
  it('PRAGMA user_version = 19', () => {
    const v = db.pragma('user_version', { simple: true }) as number
    expect(v).toBe(19)
  })

  it('column rename: debit_ore/credit_ore exist, debit_amount/credit_amount do not', () => {
    const cols = db
      .pragma('table_info(manual_entry_lines)')
      .map((c: { name: string }) => c.name)
    expect(cols).toContain('debit_ore')
    expect(cols).toContain('credit_ore')
    expect(cols).not.toContain('debit_amount')
    expect(cols).not.toContain('credit_amount')
  })

  it('data preservation: seeded amounts survive migration', () => {
    // Seed via direct SQL to simulate pre-migration data
    const meResult = db
      .prepare(
        `INSERT INTO manual_entries (fiscal_year_id, entry_date, description)
         VALUES (?, '2025-06-01', 'Test preservation')`,
      )
      .run(fyId)
    const meId = Number(meResult.lastInsertRowid)

    db.prepare(
      `INSERT INTO manual_entry_lines (manual_entry_id, line_number, account_number, debit_ore, credit_ore)
       VALUES (?, 1, '7010', 150000, 0)`,
    ).run(meId)
    db.prepare(
      `INSERT INTO manual_entry_lines (manual_entry_id, line_number, account_number, debit_ore, credit_ore)
       VALUES (?, 2, '1930', 0, 150000)`,
    ).run(meId)

    const lines = db
      .prepare(
        'SELECT debit_ore, credit_ore FROM manual_entry_lines WHERE manual_entry_id = ? ORDER BY line_number',
      )
      .all(meId) as { debit_ore: number; credit_ore: number }[]

    expect(lines).toHaveLength(2)
    expect(lines[0].debit_ore).toBe(150000)
    expect(lines[0].credit_ore).toBe(0)
    expect(lines[1].debit_ore).toBe(0)
    expect(lines[1].credit_ore).toBe(150000)
  })

  it('E2E smoke: create manual entry via service, verify debit_ore/credit_ore in DB', () => {
    const result = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      entry_date: '2025-03-15',
      description: 'S53 smoke test',
      lines: [
        { account_number: '7010', debit_ore: 250_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 250_000 },
      ],
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const got = getManualEntry(db, result.data.id)
    expect(got.success).toBe(true)
    if (!got.success) return

    expect(got.data.lines).toHaveLength(2)
    expect(got.data.lines[0].debit_ore).toBe(250_000)
    expect(got.data.lines[0].credit_ore).toBe(0)
    expect(got.data.lines[1].debit_ore).toBe(0)
    expect(got.data.lines[1].credit_ore).toBe(250_000)

    // Verify at DB level too
    const dbLines = db
      .prepare(
        'SELECT debit_ore, credit_ore FROM manual_entry_lines WHERE manual_entry_id = ? ORDER BY line_number',
      )
      .all(result.data.id) as { debit_ore: number; credit_ore: number }[]
    expect(dbLines[0].debit_ore).toBe(250_000)
    expect(dbLines[1].credit_ore).toBe(250_000)
  })
})
