import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany, getCompany } from '../src/main/services/company-service'
import {
  listFiscalYears,
  listFiscalPeriods,
  closePeriod,
  reopenPeriod,
} from '../src/main/services/fiscal-service'

let db: Database.Database

function createTestDb(): Database.Database {
  const testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.pragma('foreign_keys = ON')
  for (let i = 0; i < migrations.length; i++) {
    testDb.exec('BEGIN EXCLUSIVE')
    testDb.exec(migrations[i].sql)
    if (migrations[i].programmatic) migrations[i].programmatic(testDb)
    testDb.pragma(`user_version = ${i + 1}`)
    testDb.exec('COMMIT')
  }
  return testDb
}

const VALID_INPUT = {
  name: 'Test AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2025-01-15',
  fiscal_year_start: '2025-01-01',
  fiscal_year_end: '2025-12-31',
}

function seedCompany(testDb: Database.Database) {
  const result = createCompany(testDb, VALID_INPUT)
  if (!result.success) throw new Error('seedCompany failed: ' + result.error)
  return result.data
}

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  if (db) db.close()
})

// ═══════════════════════════════════════════════════════════
// IPC (4 tester)
// ═══════════════════════════════════════════════════════════
describe('IPC — fiscal year/period', () => {
  it('1. fiscal-year:list returnerar 1 år efter onboarding', () => {
    seedCompany(db)
    const years = listFiscalYears(db)
    expect(years.length).toBe(1)
    expect(years[0].start_date).toBe('2025-01-01')
  })

  it('2. fiscal-period:list returnerar 12 perioder sorterade', () => {
    seedCompany(db)
    const years = listFiscalYears(db)
    const periods = listFiscalPeriods(db, years[0].id)
    expect(periods.length).toBe(12)
    expect(periods[0].period_number).toBe(1)
    expect(periods[11].period_number).toBe(12)
  })

  it('3. fiscal-period:close stänger period 1', () => {
    seedCompany(db)
    const years = listFiscalYears(db)
    const periods = listFiscalPeriods(db, years[0].id)
    const result = closePeriod(db, periods[0].id)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.is_closed).toBe(1)
    }
  })

  it('4. fiscal-period:close avvisar osekventiell stängning', () => {
    seedCompany(db)
    const years = listFiscalYears(db)
    const periods = listFiscalPeriods(db, years[0].id)
    // Försök stänga period 3 utan att stänga 1 och 2
    const result = closePeriod(db, periods[2].id)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('PERIOD_NOT_SEQUENTIAL')
    }
  })
})

// ═══════════════════════════════════════════════════════════
// Periodstängningslogik (4 tester)
// ═══════════════════════════════════════════════════════════
describe('Periodstängningslogik', () => {
  it('5. Stängd period blockerar bokning via trigger 8', () => {
    const company = seedCompany(db)
    const years = listFiscalYears(db)
    const periods = listFiscalPeriods(db, years[0].id)

    // Stäng period 1
    closePeriod(db, periods[0].id)

    // Försök boka en verifikation i period 1
    const entryResult = db
      .prepare(
        `INSERT INTO journal_entries (company_id, fiscal_year_id, journal_date, description, status)
       VALUES (?, ?, '2025-01-15', 'Test', 'draft')`,
      )
      .run(company.id, years[0].id)
    const entryId = Number(entryResult.lastInsertRowid)

    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_amount, credit_amount)
       VALUES (?, 1, '1930', 10000, 0)`,
    ).run(entryId)
    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_amount, credit_amount)
       VALUES (?, 2, '3001', 0, 10000)`,
    ).run(entryId)

    expect(() => {
      db.prepare(
        "UPDATE journal_entries SET status = 'booked' WHERE id = ?",
      ).run(entryId)
    }).toThrow(/stängd period/)
  })

  it('6. Reopened period tillåter bokning igen', () => {
    const company = seedCompany(db)
    const years = listFiscalYears(db)
    const periods = listFiscalPeriods(db, years[0].id)

    closePeriod(db, periods[0].id)
    reopenPeriod(db, periods[0].id)

    const entryResult = db
      .prepare(
        `INSERT INTO journal_entries (company_id, fiscal_year_id, journal_date, description, status)
       VALUES (?, ?, '2025-01-15', 'Test', 'draft')`,
      )
      .run(company.id, years[0].id)
    const entryId = Number(entryResult.lastInsertRowid)

    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_amount, credit_amount)
       VALUES (?, 1, '1930', 10000, 0)`,
    ).run(entryId)
    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_amount, credit_amount)
       VALUES (?, 2, '3001', 0, 10000)`,
    ).run(entryId)

    expect(() => {
      db.prepare(
        "UPDATE journal_entries SET status = 'booked' WHERE id = ?",
      ).run(entryId)
    }).not.toThrow()
  })

  it('7. Reopen avvisas om inte senast stängda', () => {
    seedCompany(db)
    const years = listFiscalYears(db)
    const periods = listFiscalPeriods(db, years[0].id)

    closePeriod(db, periods[0].id)
    closePeriod(db, periods[1].id)

    // Försök öppna period 1 (period 2 är stängd)
    const result1 = reopenPeriod(db, periods[0].id)
    expect(result1.success).toBe(false)
    if (!result1.success) {
      expect(result1.code).toBe('PERIOD_NOT_SEQUENTIAL')
    }

    // Öppna period 2 ska lyckas
    const result2 = reopenPeriod(db, periods[1].id)
    expect(result2.success).toBe(true)
  })

  it('8. Close avvisas om året är stängt', () => {
    seedCompany(db)
    const years = listFiscalYears(db)
    const periods = listFiscalPeriods(db, years[0].id)

    db.prepare('UPDATE fiscal_years SET is_closed = 1 WHERE id = ?').run(
      years[0].id,
    )

    const result = closePeriod(db, periods[0].id)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('YEAR_IS_CLOSED')
    }
  })
})

// ═══════════════════════════════════════════════════════════
// Service logik (6 tester)
// ═══════════════════════════════════════════════════════════
describe('Service logik', () => {
  it('9. getCompany returnerar rätt namn', () => {
    seedCompany(db)
    const company = getCompany(db)
    expect(company).not.toBeNull()
    expect(company!.name).toBe('Test AB')
  })

  it('10. listFiscalPeriods visar rätt start_date för kalenderår', () => {
    seedCompany(db)
    const years = listFiscalYears(db)
    const periods = listFiscalPeriods(db, years[0].id)
    expect(periods[0].start_date).toBe('2025-01-01')
    expect(periods[0].end_date).toBe('2025-01-31')
    expect(periods[1].start_date).toBe('2025-02-01')
  })

  it('11. Redan stängd period → VALIDATION_ERROR', () => {
    seedCompany(db)
    const years = listFiscalYears(db)
    const periods = listFiscalPeriods(db, years[0].id)

    closePeriod(db, periods[0].id)
    const result = closePeriod(db, periods[0].id)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.error).toContain('redan stängd')
    }
  })

  it('12. Redan öppen period → VALIDATION_ERROR', () => {
    seedCompany(db)
    const years = listFiscalYears(db)
    const periods = listFiscalPeriods(db, years[0].id)

    const result = reopenPeriod(db, periods[0].id)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.error).toContain('redan öppen')
    }
  })

  it('13. Obefintlig period → NOT_FOUND', () => {
    const result = closePeriod(db, 99999)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('NOT_FOUND')
    }
  })

  it('14. Stäng alla 12 perioder sekventiellt lyckas', () => {
    seedCompany(db)
    const years = listFiscalYears(db)
    const periods = listFiscalPeriods(db, years[0].id)

    for (const period of periods) {
      const result = closePeriod(db, period.id)
      expect(result.success).toBe(true)
    }

    // Verifiera alla stängda
    const updatedPeriods = listFiscalPeriods(db, years[0].id)
    const allClosed = updatedPeriods.every((p) => p.is_closed === 1)
    expect(allClosed).toBe(true)
  })
})
