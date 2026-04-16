import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import { getTaxForecast } from '../src/main/services/tax-service'

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
let fyPast: number // 2025 — has elapsed periods
let fyFuture: number // 2028 — 0 elapsed periods

interface Seed {
  companyId: number
  fiscalYearId: number
}

function seedAll(testDb: Database.Database) {
  createCompany(testDb, VALID_COMPANY)
  const company = testDb.prepare('SELECT id FROM companies LIMIT 1').get() as {
    id: number
  }
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }

  createCounterparty(testDb, { name: 'Kund AB', type: 'customer' })
  createCounterparty(testDb, { name: 'Lev AB', type: 'supplier' })

  const vatCodeOut = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
    .get() as { id: number }
  const account = testDb
    .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
    .get() as { id: number }
  createProduct(testDb, {
    name: 'Konsult',
    default_price_ore: 100_000,
    vat_code_id: vatCodeOut.id,
    account_id: account.id,
  })

  // Create a FUTURE fiscal year (2028) — monthsElapsed guaranteed 0
  const fyFutureId = testDb
    .prepare(
      `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
     VALUES (?, '2028', '2028-01-01', '2028-12-31')`,
    )
    .run(company.id).lastInsertRowid as number

  // Create 12 periods for future year
  for (let m = 1; m <= 12; m++) {
    const start = `2028-${String(m).padStart(2, '0')}-01`
    const endDay = new Date(2028, m, 0).getDate()
    const end = `2028-${String(m).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
    testDb
      .prepare(
        `INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date)
       VALUES (?, ?, ?, ?, ?)`,
      )
      .run(company.id, fyFutureId, m, start, end)
  }

  return {
    companyId: company.id,
    fyPast: fy.id,
    fyFuture: fyFutureId,
  }
}

function createManualBookedEntry(
  testDb: Database.Database,
  seed: Seed,
  lines: { account_number: string; debit: number; credit: number }[],
) {
  // Use a journal_date within the fiscal year
  const fy = testDb
    .prepare('SELECT start_date FROM fiscal_years WHERE id = ?')
    .get(seed.fiscalYearId) as { start_date: string }
  const journalDate = fy.start_date.replace(/-01$/, '-15') // 15th of first month

  const jeId = testDb
    .prepare(
      `INSERT INTO journal_entries (company_id, fiscal_year_id, journal_date, description, status, source_type)
     VALUES (?, ?, ?, 'Manual test entry', 'draft', 'manual')`,
    )
    .run(seed.companyId, seed.fiscalYearId, journalDate)
    .lastInsertRowid as number
  for (let i = 0; i < lines.length; i++) {
    testDb
      .prepare(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
       VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        jeId,
        i + 1,
        lines[i].account_number,
        lines[i].debit,
        lines[i].credit,
      )
  }
  testDb
    .prepare("UPDATE journal_entries SET status = 'booked' WHERE id = ?")
    .run(jeId)
  return jeId
}

describe('getTaxForecast', () => {
  beforeEach(() => {
    db = createTestDb()
    const s = seedAll(db)
    companyId = s.companyId
    fyPast = s.fyPast
    fyFuture = s.fyFuture
  })

  afterEach(() => {
    db.close()
  })

  const futureSeed = (): Seed => ({
    companyId,
    fiscalYearId: fyFuture,
  })

  const pastSeed = (): Seed => ({
    companyId,
    fiscalYearId: fyPast,
  })

  // Test 1: Empty future year -> zeros and null projections
  it('returnerar nollor och null-projektioner för tomt räkenskapsår', () => {
    const r = getTaxForecast(db, fyFuture)
    expect(r.operatingProfitOre).toBe(0)
    expect(r.taxableIncomeOre).toBe(0)
    expect(r.corporateTaxOre).toBe(0)
    expect(r.periodiseringsfondMaxOre).toBe(0)
    expect(r.corporateTaxAfterFondOre).toBe(0)
    expect(r.taxSavingsFromFondOre).toBe(0)
    expect(r.monthsElapsed).toBe(0)
    expect(r.projectedFullYearIncomeOre).toBeNull()
    expect(r.projectedFullYearTaxOre).toBeNull()
    expect(r.projectedFullYearTaxAfterFondOre).toBeNull()
  })

  // Test 2: Correct 20.6% tax — integer arithmetic
  it('beräknar bolagsskatt exakt med heltalsaritmetik', () => {
    // 100 000 kr = 10_000_000 öre revenue
    createManualBookedEntry(db, futureSeed(), [
      { account_number: '1510', debit: 10_000_000, credit: 0 },
      { account_number: '3001', debit: 0, credit: 10_000_000 },
    ])
    const r = getTaxForecast(db, fyFuture)
    expect(r.taxableIncomeOre).toBe(10_000_000)
    // floor(10_000_000 * 206 / 1000) = 2_060_000
    expect(r.corporateTaxOre).toBe(2_060_000)
  })

  // Test 3: Loss -> taxableIncome = 0, tax = 0
  it('returnerar noll skatt vid förlust', () => {
    createManualBookedEntry(db, futureSeed(), [
      { account_number: '5010', debit: 500_000, credit: 0 },
      { account_number: '1930', debit: 0, credit: 500_000 },
    ])
    const r = getTaxForecast(db, fyFuture)
    expect(r.operatingProfitOre).toBeLessThan(0)
    expect(r.taxableIncomeOre).toBe(0)
    expect(r.corporateTaxOre).toBe(0)
    expect(r.periodiseringsfondMaxOre).toBe(0)
    expect(r.corporateTaxAfterFondOre).toBe(0)
    expect(r.taxSavingsFromFondOre).toBe(0)
  })

  // Test 4: Periodiseringsfond 25%
  it('beräknar periodiseringsfond korrekt (25% av vinst)', () => {
    // 400 000 kr = 40_000_000 öre
    createManualBookedEntry(db, futureSeed(), [
      { account_number: '1510', debit: 40_000_000, credit: 0 },
      { account_number: '3001', debit: 0, credit: 40_000_000 },
    ])
    const r = getTaxForecast(db, fyFuture)
    expect(r.periodiseringsfondMaxOre).toBe(10_000_000)
    expect(r.taxableIncomeAfterFondOre).toBe(30_000_000)
    expect(r.corporateTaxOre).toBe(8_240_000)
    expect(r.corporateTaxAfterFondOre).toBe(6_180_000)
    expect(r.taxSavingsFromFondOre).toBe(2_060_000)
    expect(r.corporateTaxAfterFondOre).toBeLessThan(r.corporateTaxOre)
  })

  // Test 5: monthsElapsed = 0 -> null projections
  it('returnerar null-projektioner när inga perioder avslutats', () => {
    const r = getTaxForecast(db, fyFuture)
    expect(r.monthsElapsed).toBe(0)
    expect(r.projectedFullYearIncomeOre).toBeNull()
    expect(r.projectedFullYearTaxOre).toBeNull()
    expect(r.projectedFullYearTaxAfterFondOre).toBeNull()
  })

  // Test 6: Full year projection
  it('extrapolerar korrekt till helår', () => {
    const monthsElapsedRow = db
      .prepare(
        `SELECT COUNT(*) AS c FROM accounting_periods
       WHERE fiscal_year_id = ? AND date(end_date) < date('now', 'localtime')`,
      )
      .get(fyPast) as { c: number }
    const elapsed = monthsElapsedRow.c
    if (elapsed === 0) return // skip if no periods elapsed

    createManualBookedEntry(db, pastSeed(), [
      { account_number: '1510', debit: 5_000_000, credit: 0 },
      { account_number: '3001', debit: 0, credit: 5_000_000 },
    ])
    const r = getTaxForecast(db, fyPast)
    expect(r.monthsElapsed).toBe(elapsed)
    expect(r.projectedFullYearIncomeOre).toBe(
      Math.round((5_000_000 * 12) / elapsed),
    )
    expect(r.projectedFullYearTaxOre).not.toBeNull()
    expect(r.projectedFullYearTaxAfterFondOre).not.toBeNull()
    expect(r.projectedFullYearTaxAfterFondOre!).toBeLessThan(
      r.projectedFullYearTaxOre!,
    )
  })

  // Test 7: Projected loss -> projectedTax = 0
  it('hanterar projicerad förlust korrekt', () => {
    const monthsElapsedRow = db
      .prepare(
        `SELECT COUNT(*) AS c FROM accounting_periods
       WHERE fiscal_year_id = ? AND date(end_date) < date('now', 'localtime')`,
      )
      .get(fyPast) as { c: number }
    if (monthsElapsedRow.c === 0) return

    createManualBookedEntry(db, pastSeed(), [
      { account_number: '5010', debit: 5_000_000, credit: 0 },
      { account_number: '1930', debit: 0, credit: 5_000_000 },
    ])
    const r = getTaxForecast(db, fyPast)
    expect(r.monthsElapsed).toBeGreaterThan(0)
    expect(r.projectedFullYearIncomeOre!).toBeLessThan(0)
    expect(r.projectedFullYearTaxOre).toBe(0)
    expect(r.projectedFullYearTaxAfterFondOre).toBe(0)
  })

  // Test 8: fiscal_year_id scoping
  it('scopas korrekt till räkenskapsår', () => {
    createManualBookedEntry(db, futureSeed(), [
      { account_number: '1510', debit: 1_000_000, credit: 0 },
      { account_number: '3001', debit: 0, credit: 1_000_000 },
    ])
    createManualBookedEntry(db, pastSeed(), [
      { account_number: '1510', debit: 2_000_000, credit: 0 },
      { account_number: '3001', debit: 0, credit: 2_000_000 },
    ])
    const rFuture = getTaxForecast(db, fyFuture)
    const rPast = getTaxForecast(db, fyPast)
    expect(rFuture.operatingProfitOre).toBe(1_000_000)
    expect(rPast.operatingProfitOre).toBe(2_000_000)
  })

  // Fixed in Sprint 11 Fas 3: 3740 (öresutjämning) ingår nu korrekt i rörelseresultatet
  it('inkluderar konto 3740 i intäkter och skattebas', () => {
    createManualBookedEntry(db, futureSeed(), [
      { account_number: '1510', debit: 1_000_000, credit: 0 },
      { account_number: '3001', debit: 0, credit: 999_950 },
      { account_number: '3740', debit: 0, credit: 50 },
    ])
    const r = getTaxForecast(db, fyFuture)
    // Full amount: 999_950 + 50 = 1_000_000 (3740 included via INCOME_STATEMENT_CONFIG)
    expect(r.operatingProfitOre).toBe(1_000_000)
  })

  // Test 10: Class 8 excluded
  it('exkluderar klass 8-konton (finansiella poster) från kostnader', () => {
    createManualBookedEntry(db, futureSeed(), [
      { account_number: '1510', debit: 2_000_000, credit: 0 },
      { account_number: '3001', debit: 0, credit: 2_000_000 },
    ])
    createManualBookedEntry(db, futureSeed(), [
      { account_number: '8410', debit: 100_000, credit: 0 },
      { account_number: '1930', debit: 0, credit: 100_000 },
    ])
    const r = getTaxForecast(db, fyFuture)
    expect(r.operatingProfitOre).toBe(2_000_000)
  })

  // Test 11: Algebraic invariants
  it('algebraiska invarianter: taxAfterFond <= tax, savings = tax - taxAfterFond', () => {
    createManualBookedEntry(db, futureSeed(), [
      { account_number: '1510', debit: 5_000_000, credit: 0 },
      { account_number: '3001', debit: 0, credit: 5_000_000 },
    ])
    const r = getTaxForecast(db, fyFuture)
    expect(r.taxableIncomeOre).toBeGreaterThan(0)
    expect(r.corporateTaxAfterFondOre).toBeLessThanOrEqual(r.corporateTaxOre)
    expect(r.taxSavingsFromFondOre).toBe(
      r.corporateTaxOre - r.corporateTaxAfterFondOre,
    )
    expect(r.taxableIncomeAfterFondOre).toBe(
      r.taxableIncomeOre - r.periodiseringsfondMaxOre,
    )
    for (const key of [
      'operatingProfitOre',
      'taxableIncomeOre',
      'corporateTaxOre',
      'periodiseringsfondMaxOre',
      'taxableIncomeAfterFondOre',
      'corporateTaxAfterFondOre',
      'taxSavingsFromFondOre',
      'monthsElapsed',
      'fiscalYearMonths',
    ] as const) {
      expect(typeof r[key]).toBe('number')
    }
    expect(r.taxRatePercent).toBe(20.6)
    expect(r.periodiseringsfondRatePercent).toBe(25.0)
    expect(r.fiscalYearMonths).toBe(12)
  })

  // Test 12: Regression — no migration
  it('regression: user_version=10, 20 tabeller', () => {
    const version = db.pragma('user_version', { simple: true }) as number
    expect(version).toBe(35) // S48: Uppdatera vid nya migrationer
    const tables = db
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .get() as { count: number }
    expect(tables.count).toBe(31)
  })
})
