import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'

let db: Database.Database

const VALID_COMPANY = {
  name: 'Test AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2025-01-15',
  fiscal_year_start: '2025-01-01',
  fiscal_year_end: '2025-12-31',
}

let companyId: number

beforeEach(() => {
  db = createTestDb()
  const result = createCompany(db, VALID_COMPANY)
  if (!result.success) throw new Error('Company seed failed')
  companyId = result.data.id
})

afterEach(() => {
  if (db) db.close()
})

describe('Migration 014: Fiscal year overlap protection', () => {
  it('user_version = 14 efter migration', () => {
    const v = db.pragma('user_version', { simple: true }) as number
    expect(v).toBe(58)
  })

  it('avvisar FY som överlappar helt med befintligt', () => {
    // Existing FY från createCompany: 2025-01-01 till 2025-12-31
    expect(() =>
      db
        .prepare(
          `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
         VALUES (?, '2025-dup', '2025-01-01', '2025-12-31')`,
        )
        .run(companyId),
    ).toThrow(/överlappar/i)
  })

  it('avvisar FY som överlappar delvis (start inom befintligt)', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
         VALUES (?, '2025-partial', '2025-06-01', '2026-05-31')`,
        )
        .run(companyId),
    ).toThrow(/överlappar/i)
  })

  it('avvisar FY som omsluter befintligt', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
         VALUES (?, '2024-2026', '2024-01-01', '2026-12-31')`,
        )
        .run(companyId),
    ).toThrow(/överlappar/i)
  })

  it('tillåter FY direkt efter (end_date + 1 = start_date)', () => {
    const result = db
      .prepare(
        `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
         VALUES (?, '2026', '2026-01-01', '2026-12-31')`,
      )
      .run(companyId)
    expect(result.changes).toBe(1)
  })

  it('tillåter FY direkt före', () => {
    const result = db
      .prepare(
        `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
         VALUES (?, '2024', '2024-01-01', '2024-12-31')`,
      )
      .run(companyId)
    expect(result.changes).toBe(1)
  })

  it('tillåter FY för annat företag att ha samma datumintervall', () => {
    // Create second company with DIFFERENT org_number (UNIQUE constraint)
    const co2Result = createCompany(db, {
      ...VALID_COMPANY,
      name: 'Annat AB',
      org_number: '556677-8899', // annat organisationsnummer
    })
    if (!co2Result.success) {
      throw new Error('co2 failed: ' + co2Result.error)
    }

    // createCompany skapar automatiskt en 2025-FY för det nya företaget
    // (samma datumintervall som company 1). Overlap-triggern är scoped
    // per company_id så detta ska fungera utan konflikt.
    const co1Fys = db
      .prepare(
        'SELECT start_date, end_date FROM fiscal_years WHERE company_id = ?',
      )
      .all(companyId) as { start_date: string; end_date: string }[]
    const co2Fys = db
      .prepare(
        'SELECT start_date, end_date FROM fiscal_years WHERE company_id = ?',
      )
      .all(co2Result.data.id) as { start_date: string; end_date: string }[]

    expect(co1Fys.length).toBe(1)
    expect(co2Fys.length).toBe(1)
    expect(co1Fys[0].start_date).toBe('2025-01-01')
    expect(co2Fys[0].start_date).toBe('2025-01-01')
  })

  it('UPDATE som skulle skapa overlapp avvisas', () => {
    // Create 2026 FY first (OK — ingen overlap med 2025)
    db.prepare(
      `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
       VALUES (?, '2026', '2026-01-01', '2026-12-31')`,
    ).run(companyId)

    // Försök UPDATE 2026 så den överlappar med 2025
    expect(() =>
      db
        .prepare(
          `UPDATE fiscal_years SET start_date = '2025-06-01', end_date = '2026-05-31'
         WHERE year_label = '2026' AND company_id = ?`,
        )
        .run(companyId),
    ).toThrow(/överlappar/i)
  })
})
