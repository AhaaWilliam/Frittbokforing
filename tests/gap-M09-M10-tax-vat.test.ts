import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { getTaxForecast } from '../src/main/services/tax-service'
import { getVatReport } from '../src/main/services/vat-report-service'

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
let fiscalYearId: number

function seedCompany(testDb: Database.Database) {
  createCompany(testDb, VALID_COMPANY)
  const company = testDb.prepare('SELECT id FROM companies LIMIT 1').get() as {
    id: number
  }
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  return { companyId: company.id, fiscalYearId: fy.id }
}

function createBookedEntry(
  testDb: Database.Database,
  seed: { companyId: number; fiscalYearId: number },
  lines: { account_number: string; debit: number; credit: number }[],
) {
  const fy = testDb
    .prepare('SELECT start_date FROM fiscal_years WHERE id = ?')
    .get(seed.fiscalYearId) as { start_date: string }
  const journalDate = fy.start_date.replace(/-01$/, '-15')

  const jeId = testDb
    .prepare(
      `INSERT INTO journal_entries (company_id, fiscal_year_id, journal_date, description, status, source_type)
     VALUES (?, ?, ?, 'Test entry', 'draft', 'manual')`,
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

beforeEach(() => {
  db = createTestDb()
  const s = seedCompany(db)
  companyId = s.companyId
  fiscalYearId = s.fiscalYearId
})

afterEach(() => {
  if (db) db.close()
})

// ═══════════════════════════════════════════════════════════
// GAP M09: Skatteprognos — specifika beräkningar
// ═══════════════════════════════════════════════════════════

describe('GAP M09-1: Exakt bolagsskatt-beräkning', () => {
  it('vinst 100 000 00 öre (1 Mkr) → skatt = 20 600 00 öre', () => {
    // Seed: 1 000 000 kr intäkt = 100_000_00 öre
    createBookedEntry(db, { companyId, fiscalYearId }, [
      { account_number: '3002', debit: 0, credit: 100_000_00 },
      { account_number: '1510', debit: 100_000_00, credit: 0 },
    ])

    const result = getTaxForecast(db, fiscalYearId)
    expect(result.operatingProfitOre).toBe(100_000_00)
    expect(result.corporateTaxOre).toBe(Math.floor((100_000_00 * 206) / 1000))
    expect(result.corporateTaxOre).toBe(20_600_00)
  })

  it('vinst 1 öre → skatt = 0 (floor)', () => {
    createBookedEntry(db, { companyId, fiscalYearId }, [
      { account_number: '3002', debit: 0, credit: 1 },
      { account_number: '1510', debit: 1, credit: 0 },
    ])

    const result = getTaxForecast(db, fiscalYearId)
    expect(result.operatingProfitOre).toBe(1)
    expect(result.corporateTaxOre).toBe(0) // floor(1 * 206 / 1000) = floor(0.206) = 0
  })

  it('vinst 0 → skatt = 0', () => {
    const result = getTaxForecast(db, fiscalYearId)
    expect(result.operatingProfitOre).toBe(0)
    expect(result.corporateTaxOre).toBe(0)
  })

  it('förlust → taxableIncome = 0, aldrig negativ skatt', () => {
    createBookedEntry(db, { companyId, fiscalYearId }, [
      { account_number: '5010', debit: 50_000_00, credit: 0 },
      { account_number: '2440', debit: 0, credit: 50_000_00 },
    ])

    const result = getTaxForecast(db, fiscalYearId)
    expect(result.operatingProfitOre).toBeLessThan(0)
    expect(result.taxableIncomeOre).toBe(0)
    expect(result.corporateTaxOre).toBe(0)
  })
})

describe('GAP M09-2: Periodiseringsfond', () => {
  it('max 25% av positiv vinst', () => {
    createBookedEntry(db, { companyId, fiscalYearId }, [
      { account_number: '3002', debit: 0, credit: 400_000_00 },
      { account_number: '1510', debit: 400_000_00, credit: 0 },
    ])

    const result = getTaxForecast(db, fiscalYearId)
    expect(result.periodiseringsfondMaxOre).toBe(
      Math.floor((400_000_00 * 25) / 100),
    )
    expect(result.periodiseringsfondMaxOre).toBe(100_000_00)
  })

  it('vinst 0 → maxfond = 0', () => {
    const result = getTaxForecast(db, fiscalYearId)
    expect(result.periodiseringsfondMaxOre).toBe(0)
  })

  it('förlust → maxfond = 0', () => {
    createBookedEntry(db, { companyId, fiscalYearId }, [
      { account_number: '5010', debit: 10_000_00, credit: 0 },
      { account_number: '2440', debit: 0, credit: 10_000_00 },
    ])

    const result = getTaxForecast(db, fiscalYearId)
    expect(result.periodiseringsfondMaxOre).toBe(0)
  })

  it('skattebesparing = skatt - skattEfterFond', () => {
    createBookedEntry(db, { companyId, fiscalYearId }, [
      { account_number: '3002', debit: 0, credit: 200_000_00 },
      { account_number: '1510', debit: 200_000_00, credit: 0 },
    ])

    const result = getTaxForecast(db, fiscalYearId)
    expect(result.taxSavingsFromFondOre).toBe(
      result.corporateTaxOre - result.corporateTaxAfterFondOre,
    )
  })
})

describe('GAP M09-3: Helårsprognos', () => {
  it('0 avslutade månader → prognos = null', () => {
    // Future year where no periods have ended
    const fyFutureId = db
      .prepare(
        `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
       VALUES (?, '2028', '2028-01-01', '2028-12-31')`,
      )
      .run(companyId).lastInsertRowid as number
    for (let m = 1; m <= 12; m++) {
      const start = `2028-${String(m).padStart(2, '0')}-01`
      const endDay = new Date(2028, m, 0).getDate()
      const end = `2028-${String(m).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
      db.prepare(
        `INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date)
       VALUES (?, ?, ?, ?, ?)`,
      ).run(companyId, fyFutureId, m, start, end)
    }

    const result = getTaxForecast(db, fyFutureId)
    expect(result.projectedFullYearIncomeOre).toBeNull()
    expect(result.projectedFullYearTaxOre).toBeNull()
  })

  it('12 avslutade månader → prognos = faktiskt EBIT', () => {
    // Use the 2025 fiscal year which should have elapsed periods (if now > periods)
    // We need all 12 periods to have passed. Since test date varies, use seed with older year.
    const fyOldId = db
      .prepare(
        `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
       VALUES (?, '2020', '2020-01-01', '2020-12-31')`,
      )
      .run(companyId).lastInsertRowid as number
    for (let m = 1; m <= 12; m++) {
      const start = `2020-${String(m).padStart(2, '0')}-01`
      const endDay = new Date(2020, m, 0).getDate()
      const end = `2020-${String(m).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
      db.prepare(
        `INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date)
       VALUES (?, ?, ?, ?, ?)`,
      ).run(companyId, fyOldId, m, start, end)
    }

    createBookedEntry(db, { companyId, fiscalYearId: fyOldId }, [
      { account_number: '3002', debit: 0, credit: 120_000_00 },
      { account_number: '1510', debit: 120_000_00, credit: 0 },
    ])

    const result = getTaxForecast(db, fyOldId)
    expect(result.monthsElapsed).toBe(12)
    // 12 months elapsed, projection = actual * 12 / 12 = actual
    expect(result.projectedFullYearIncomeOre).toBe(result.operatingProfitOre)
  })
})

// ═══════════════════════════════════════════════════════════
// GAP M10: Momsrapport — edge cases
// ═══════════════════════════════════════════════════════════

describe('GAP M10-1: Kvartalsskelett', () => {
  it('4 kvartal + årstotal returneras alltid', () => {
    const report = getVatReport(db, fiscalYearId)
    expect(report.quarters).toHaveLength(4)
    expect(report.yearTotal).toBeDefined()
    expect(report.yearTotal.quarterLabel).toBe('Helår')
  })

  it('tomt kvartal visar nollor med hasData=false', () => {
    const report = getVatReport(db, fiscalYearId)
    // No data seeded, all quarters should have hasData=false
    for (const q of report.quarters) {
      expect(q.hasData).toBe(false)
      expect(q.vatOut25Ore).toBe(0)
      expect(q.vatOut12Ore).toBe(0)
      expect(q.vatOut6Ore).toBe(0)
      expect(q.vatInOre).toBe(0)
      expect(q.vatNetOre).toBe(0)
    }
  })
})

describe('GAP M10-2: Momspliktiga underlag (härledda)', () => {
  it('25%: underlag = moms × 4 (exakt)', () => {
    // Seed Q1 with 25% VAT
    createBookedEntry(db, { companyId, fiscalYearId }, [
      { account_number: '2610', debit: 0, credit: 25_000 }, // 250 kr moms
      { account_number: '3002', debit: 0, credit: 100_000 }, // 1000 kr netto
      { account_number: '1510', debit: 125_000, credit: 0 },
    ])

    const report = getVatReport(db, fiscalYearId)
    const q1 = report.quarters[0]
    expect(q1.taxableBase25Ore).toBe(q1.vatOut25Ore * 4)
  })

  it('12%: underlag = Math.round(moms × 25 / 3)', () => {
    createBookedEntry(db, { companyId, fiscalYearId }, [
      { account_number: '2620', debit: 0, credit: 12_000 }, // 120 kr moms (12%)
      { account_number: '3002', debit: 0, credit: 100_000 },
      { account_number: '1510', debit: 112_000, credit: 0 },
    ])

    const report = getVatReport(db, fiscalYearId)
    const q1 = report.quarters[0]
    expect(q1.taxableBase12Ore).toBe(Math.round((q1.vatOut12Ore * 25) / 3))
  })

  it('6%: underlag = Math.round(moms × 50 / 3)', () => {
    createBookedEntry(db, { companyId, fiscalYearId }, [
      { account_number: '2630', debit: 0, credit: 6_000 }, // 60 kr moms (6%)
      { account_number: '3002', debit: 0, credit: 100_000 },
      { account_number: '1510', debit: 106_000, credit: 0 },
    ])

    const report = getVatReport(db, fiscalYearId)
    const q1 = report.quarters[0]
    expect(q1.taxableBase6Ore).toBe(Math.round((q1.vatOut6Ore * 50) / 3))
  })
})

describe('GAP M10-3: Årstotal = summa kvartal', () => {
  it('årstotal summerar kvartal korrekt', () => {
    // Seed Q1 + Q3 with data, Q2 + Q4 empty
    createBookedEntry(db, { companyId, fiscalYearId }, [
      { account_number: '2610', debit: 0, credit: 10_000 },
      { account_number: '3002', debit: 0, credit: 40_000 },
      { account_number: '1510', debit: 50_000, credit: 0 },
    ])

    // Q3 entry (jul-sep, needs a date in Q3)
    const jeId = db
      .prepare(
        `INSERT INTO journal_entries (company_id, fiscal_year_id, journal_date, description, status, source_type)
       VALUES (?, ?, '2025-08-15', 'Q3 entry', 'draft', 'manual')`,
      )
      .run(companyId, fiscalYearId).lastInsertRowid as number
    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
     VALUES (?, 1, '2610', 0, 5000)`,
    ).run(jeId)
    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
     VALUES (?, 2, '3002', 0, 20000)`,
    ).run(jeId)
    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
     VALUES (?, 3, '1510', 25000, 0)`,
    ).run(jeId)
    db.prepare("UPDATE journal_entries SET status = 'booked' WHERE id = ?").run(
      jeId,
    )

    const report = getVatReport(db, fiscalYearId)
    const sumVat25 = report.quarters.reduce((s, q) => s + q.vatOut25Ore, 0)
    expect(report.yearTotal.vatOut25Ore).toBe(sumVat25)
  })
})

describe('GAP M10-4: Timezone-säker datumparsning', () => {
  it('vat-report-service uses parseInt(substring), not new Date()', async () => {
    // Static code analysis: verify vat-report-service.ts
    const { readFileSync } = await import('fs')
    const src = readFileSync('src/main/services/vat-report-service.ts', 'utf-8')
    // Should use parseInt/substring for month extraction
    expect(src).toContain('parseInt')
    expect(src).toContain('substring')
    // Should NOT use new Date() for date parsing
    const dateConstructorUses = (src.match(/new Date\(/g) || []).length
    expect(dateConstructorUses).toBe(0)
  })
})
