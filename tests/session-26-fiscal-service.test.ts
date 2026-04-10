import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { createNewFiscalYear } from '../src/main/services/fiscal-service'
import {
  calculateNetResult,
  bookYearEndResult,
} from '../src/main/services/opening-balance-service'

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

let companyId: number
let fyId: number

function seedBookedEntry(opts: {
  debitAccount: string
  creditAccount: string
  amount: number
  date: string
  series?: string
}) {
  const series = opts.series ?? 'A'
  const maxVer = db
    .prepare(
      `SELECT COALESCE(MAX(verification_number), 0) + 1 as n
       FROM journal_entries WHERE fiscal_year_id = ? AND verification_series = ?`,
    )
    .get(fyId, series) as { n: number }

  const je = db
    .prepare(
      `INSERT INTO journal_entries (
        company_id, fiscal_year_id, verification_number, verification_series,
        journal_date, description, status, source_type
      ) VALUES (?, ?, ?, ?, ?, 'Test', 'draft', 'manual')`,
    )
    .run(companyId, fyId, maxVer.n, series, opts.date)
  const jeId = Number(je.lastInsertRowid)

  db.prepare(
    `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_amount, credit_amount)
     VALUES (?, 1, ?, ?, 0)`,
  ).run(jeId, opts.debitAccount, opts.amount)
  db.prepare(
    `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_amount, credit_amount)
     VALUES (?, 2, ?, 0, ?)`,
  ).run(jeId, opts.creditAccount, opts.amount)

  db.prepare("UPDATE journal_entries SET status = 'booked' WHERE id = ?").run(
    jeId,
  )
  return jeId
}

beforeEach(() => {
  db = createTestDb()
  createCompany(db, VALID_COMPANY)
  const co = db.prepare('SELECT id FROM companies LIMIT 1').get() as {
    id: number
  }
  companyId = co.id
  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  fyId = fy.id
})

afterEach(() => {
  db.close()
})

describe('createNewFiscalYear with bookResult (K1)', () => {
  it('books year-end result and creates new fiscal year atomically', () => {
    // Vinst 100 000 kr: debit 1510, credit 3001
    seedBookedEntry({
      debitAccount: '1510',
      creditAccount: '3001',
      amount: 10_000_000,
      date: '2025-06-15',
    })

    const netResult = calculateNetResult(db, fyId)
    expect(netResult).toBe(10_000_000)

    const result = createNewFiscalYear(db, companyId, fyId, {
      confirmBookResult: true,
      netResultOre: 10_000_000,
    })

    // New FY exists
    expect(result.fiscalYear).toBeDefined()
    expect(result.fiscalYear.start_date).toBe('2026-01-01')

    // C-series year-end result voucher exists
    const cVouchers = db
      .prepare(
        "SELECT * FROM journal_entries WHERE verification_series = 'C' AND fiscal_year_id = ?",
      )
      .all(fyId)
    expect(cVouchers.length).toBe(1)

    // Opening balance exists in new FY
    const obVouchers = db
      .prepare(
        "SELECT * FROM journal_entries WHERE verification_series = 'O' AND fiscal_year_id = ?",
      )
      .all(result.fiscalYear.id)
    expect(obVouchers.length).toBe(1)
  })

  it('creates new fiscal year without booking result when confirmBookResult is false', () => {
    // Only BS entries (no P&L) — so IB will balance without result booking
    seedBookedEntry({
      debitAccount: '1930',
      creditAccount: '2081',
      amount: 2_500_000,
      date: '2025-01-15',
    })

    const result = createNewFiscalYear(db, companyId, fyId, {
      confirmBookResult: false,
      netResultOre: 0,
    })

    expect(result.fiscalYear).toBeDefined()

    // NO C-series year-end result voucher
    const cVouchers = db
      .prepare(
        "SELECT * FROM journal_entries WHERE verification_series = 'C' AND fiscal_year_id = ?",
      )
      .all(fyId)
    expect(cVouchers.length).toBe(0)
  })

  it('rolls back year-end result if fiscal year creation fails', () => {
    seedBookedEntry({
      debitAccount: '1510',
      creditAccount: '3001',
      amount: 10_000_000,
      date: '2025-06-15',
    })

    // Manually insert a conflicting FY to force the creation to fail
    db.prepare(
      `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
       VALUES (?, '2026', '2026-01-01', '2026-12-31')`,
    ).run(companyId)

    // Should fail because FY for 2026-01-01 already exists
    expect(() =>
      createNewFiscalYear(db, companyId, fyId, {
        confirmBookResult: true,
        netResultOre: 10_000_000,
      }),
    ).toThrow('Räkenskapsår för denna period finns redan')

    // C-series voucher should NOT exist (rolled back with the transaction)
    const cVouchers = db
      .prepare(
        "SELECT * FROM journal_entries WHERE verification_series = 'C' AND fiscal_year_id = ?",
      )
      .all(fyId)
    expect(cVouchers.length).toBe(0)
  })

  it('rejects booking if netResultOre does not match actual result', () => {
    seedBookedEntry({
      debitAccount: '1510',
      creditAccount: '3001',
      amount: 10_000_000,
      date: '2025-06-15',
    })

    expect(() =>
      createNewFiscalYear(db, companyId, fyId, {
        confirmBookResult: true,
        netResultOre: 99999,
      }),
    ).toThrow('ändrats sedan dialogen öppnades')

    // No C-series voucher
    const cVouchers = db
      .prepare(
        "SELECT * FROM journal_entries WHERE verification_series = 'C' AND fiscal_year_id = ?",
      )
      .all(fyId)
    expect(cVouchers.length).toBe(0)

    // No new FY
    const fys = db
      .prepare('SELECT COUNT(*) as cnt FROM fiscal_years')
      .get() as { cnt: number }
    expect(fys.cnt).toBe(1)
  })

  it('rejects booking if year-end result is already booked', () => {
    seedBookedEntry({
      debitAccount: '1510',
      creditAccount: '3001',
      amount: 10_000_000,
      date: '2025-06-15',
    })

    // Book year-end result using the proper function
    bookYearEndResult(db, fyId, 10_000_000)

    // User still has the old netResultOre from when dialog opened
    // The race condition guard catches the mismatch (actual is now 0 due to 8999 booking)
    // OR the double-booking guard catches the existing C-series
    expect(() =>
      createNewFiscalYear(db, companyId, fyId, {
        confirmBookResult: true,
        netResultOre: 10_000_000,
      }),
    ).toThrow()
  })
})

describe('F2: createNewFiscalYear stänger föregående FY atomärt', () => {
  it('stänger föregående FY när nytt FY skapas', () => {
    seedBookedEntry({
      debitAccount: '1930',
      creditAccount: '2081',
      amount: 2_500_000,
      date: '2025-01-01',
    })

    // Föregående FY är öppet
    const before = db
      .prepare('SELECT is_closed FROM fiscal_years WHERE id = ?')
      .get(fyId) as { is_closed: number }
    expect(before.is_closed).toBe(0)

    createNewFiscalYear(db, companyId, fyId, {
      confirmBookResult: false,
      netResultOre: 0,
    })

    // Föregående FY är nu stängt
    const after = db
      .prepare('SELECT is_closed FROM fiscal_years WHERE id = ?')
      .get(fyId) as { is_closed: number }
    expect(after.is_closed).toBe(1)

    // Alla perioder i föregående FY är också stängda
    const openPeriods = db
      .prepare(
        'SELECT COUNT(*) as cnt FROM accounting_periods WHERE fiscal_year_id = ? AND is_closed = 0',
      )
      .get(fyId) as { cnt: number }
    expect(openPeriods.cnt).toBe(0)
  })

  it('rullar tillbaka FY-stängning om skapande av nytt FY failar', () => {
    seedBookedEntry({
      debitAccount: '1930',
      creditAccount: '2081',
      amount: 2_500_000,
      date: '2025-01-01',
    })

    // Pre-create conflicting FY to force failure
    db.prepare(
      `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
       VALUES (?, '2026', '2026-01-01', '2026-12-31')`,
    ).run(companyId)

    expect(() =>
      createNewFiscalYear(db, companyId, fyId, {
        confirmBookResult: false,
        netResultOre: 0,
      }),
    ).toThrow('Räkenskapsår för denna period finns redan')

    // Föregående FY ska FORTFARANDE vara öppet — rollback funkade
    const fy = db
      .prepare('SELECT is_closed FROM fiscal_years WHERE id = ?')
      .get(fyId) as { is_closed: number }
    expect(fy.is_closed).toBe(0)

    // Perioder ska också fortfarande vara öppna
    const openPeriods = db
      .prepare(
        'SELECT COUNT(*) as cnt FROM accounting_periods WHERE fiscal_year_id = ? AND is_closed = 0',
      )
      .get(fyId) as { cnt: number }
    expect(openPeriods.cnt).toBeGreaterThan(0)
  })
})
