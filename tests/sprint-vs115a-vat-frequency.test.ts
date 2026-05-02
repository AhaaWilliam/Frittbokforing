/**
 * Sprint VS-115a — companies.vat_frequency-kolumn (migration 060).
 */
import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'

let db: Database.Database

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  if (db) db.close()
})

describe('VS-115a migration 060: companies.vat_frequency', () => {
  it('user_version är minst 60', () => {
    const v = db.pragma('user_version', { simple: true }) as number
    expect(v).toBeGreaterThanOrEqual(60)
  })

  it('kolumnen finns med rätt typ och default', () => {
    const cols = db
      .prepare("PRAGMA table_info('companies')")
      .all() as Array<{
      name: string
      type: string
      notnull: number
      dflt_value: unknown
    }>
    const col = cols.find((c) => c.name === 'vat_frequency')
    expect(col).toBeDefined()
    expect(col?.type).toBe('TEXT')
    expect(col?.notnull).toBe(1)
    // DEFAULT-värde lagras med citationstecken i sqlite_master
    expect(String(col?.dflt_value)).toContain('quarterly')
  })

  it('nya bolag får default quarterly', () => {
    const res = createCompany(db, {
      name: 'Test AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2',
      share_capital: 2_500_000,
      registration_date: '2025-01-15',
      fiscal_year_start: '2025-01-01',
      fiscal_year_end: '2025-12-31',
    })
    if (!res.success) throw new Error(res.error)
    const row = db
      .prepare('SELECT vat_frequency FROM companies WHERE id = ?')
      .get(res.data.id) as { vat_frequency: string }
    expect(row.vat_frequency).toBe('quarterly')
  })

  it('CHECK-constraint blockerar ogiltiga värden', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO companies
            (name, org_number, fiscal_rule, share_capital, registration_date, country, vat_frequency)
           VALUES ('X', '556036-0793', 'K2', 0, '2025-01-01', 'SE', 'invalid')`,
        )
        .run(),
    ).toThrow(/CHECK constraint/i)
  })
})
