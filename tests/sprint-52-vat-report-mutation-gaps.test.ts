/**
 * Sprint 52 — Stäng mutation-gap i vat-report-service.ts (64.52% → mål 85%+).
 *
 * Stryker baseline (Sprint 51) avslöjade att 18 mutanter överlevde i
 * vat-report-service. Detta testfile riktar sig specifikt mot dessa
 * mönster:
 *
 * - L26 monthIndexFromISO: substring-bounds + `-1`-aritmetik
 * - L41 buildQuarterLabel: quarterIndex + 1, label-format
 * - L80 quarterFrames empty-check
 * - L141 vatData undefined-check (sparse data)
 * - L183 yearTotal.quarterIndex === -1 (UnaryOp)
 * - L187 yearTotal.hasData reduktion (ArrowFunction)
 * - L196 yearTotal taxableBase-aritmetik
 *
 * Varje test är skriven så att en exakt mutation av motsvarande rad
 * ska bryta minst en assertion.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
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
  name: 'VAT Mut Test AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2026-01-15',
  fiscal_year_start: '2026-01-01',
  fiscal_year_end: '2026-12-31',
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

function bookEntry(
  testDb: Database.Database,
  date: string,
  lines: { account_number: string; debit_ore: number; credit_ore: number }[],
): void {
  const jeId = testDb
    .prepare(
      `INSERT INTO journal_entries (company_id, fiscal_year_id, journal_date, description, status, source_type)
       VALUES (?, ?, ?, 'Test', 'draft', 'manual')`,
    )
    .run(companyId, fiscalYearId, date).lastInsertRowid as number
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    testDb
      .prepare(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(jeId, i + 1, l.account_number, l.debit_ore, l.credit_ore)
  }
  testDb
    .prepare("UPDATE journal_entries SET status = 'booked' WHERE id = ?")
    .run(jeId)
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

describe('Sprint 52 — vat-report quarterLabel exakt format', () => {
  it('Q1 label = "Kv 1 (jan–mar 2026)" — fångar quarterIndex+1 + substring-mutationer', () => {
    const r = getVatReport(db, fiscalYearId)
    expect(r.quarters[0].quarterLabel).toBe('Kv 1 (jan–mar 2026)')
  })

  it('Q2 label = "Kv 2 (apr–jun 2026)"', () => {
    const r = getVatReport(db, fiscalYearId)
    expect(r.quarters[1].quarterLabel).toBe('Kv 2 (apr–jun 2026)')
  })

  it('Q3 label = "Kv 3 (jul–sep 2026)"', () => {
    const r = getVatReport(db, fiscalYearId)
    expect(r.quarters[2].quarterLabel).toBe('Kv 3 (jul–sep 2026)')
  })

  it('Q4 label = "Kv 4 (okt–dec 2026)"', () => {
    const r = getVatReport(db, fiscalYearId)
    expect(r.quarters[3].quarterLabel).toBe('Kv 4 (okt–dec 2026)')
  })

  it('yearTotal label = "Helår" och quarterIndex === -1 (fångar UnaryOp-mutation L183)', () => {
    const r = getVatReport(db, fiscalYearId)
    expect(r.yearTotal.quarterLabel).toBe('Helår')
    expect(r.yearTotal.quarterIndex).toBe(-1)
    // Explicit-not-+1 — fångar +1/-1-flip exakt
    expect(r.yearTotal.quarterIndex).not.toBe(1)
    expect(r.yearTotal.quarterIndex).toBeLessThan(0)
  })
})

describe('Sprint 52 — vat-report quarter date-bounds', () => {
  it('Q1 startDate=2026-01-01 endDate=2026-03-31', () => {
    const r = getVatReport(db, fiscalYearId)
    expect(r.quarters[0].startDate).toBe('2026-01-01')
    expect(r.quarters[0].endDate).toBe('2026-03-31')
  })

  it('Q4 startDate=2026-10-01 endDate=2026-12-31', () => {
    const r = getVatReport(db, fiscalYearId)
    expect(r.quarters[3].startDate).toBe('2026-10-01')
    expect(r.quarters[3].endDate).toBe('2026-12-31')
  })

  it('yearTotal startDate=Q1.start och endDate=Q4.end', () => {
    const r = getVatReport(db, fiscalYearId)
    expect(r.yearTotal.startDate).toBe('2026-01-01')
    expect(r.yearTotal.endDate).toBe('2026-12-31')
  })
})

describe('Sprint 52 — vat-report sparse data (vatData undefined-check L141)', () => {
  it('hasData=true endast för kvartal med bokade VAT-poster', () => {
    // Bokför moms ENDAST i Q2
    bookEntry(db, '2026-05-15', [
      { account_number: '1930', debit_ore: 12500, credit_ore: 0 },
      { account_number: '3001', debit_ore: 0, credit_ore: 10000 },
      { account_number: '2610', debit_ore: 0, credit_ore: 2500 },
    ])

    const r = getVatReport(db, fiscalYearId)
    expect(r.quarters[0].hasData).toBe(false) // Q1
    expect(r.quarters[1].hasData).toBe(true) // Q2 — har data
    expect(r.quarters[2].hasData).toBe(false) // Q3
    expect(r.quarters[3].hasData).toBe(false) // Q4
  })

  it('yearTotal.hasData=true om minst ett kvartal har data (fångar ArrowFunc L187)', () => {
    bookEntry(db, '2026-08-15', [
      { account_number: '1930', debit_ore: 1250, credit_ore: 0 },
      { account_number: '3001', debit_ore: 0, credit_ore: 1000 },
      { account_number: '2610', debit_ore: 0, credit_ore: 250 },
    ])

    const r = getVatReport(db, fiscalYearId)
    // Bara Q3 har data — yearTotal måste reduce:a till true
    const dataQuarters = r.quarters.filter((q) => q.hasData)
    expect(dataQuarters.length).toBe(1)
    expect(r.yearTotal.hasData).toBe(true)
  })

  it('yearTotal.hasData=false när alla kvartal är tomma', () => {
    const r = getVatReport(db, fiscalYearId)
    expect(r.yearTotal.hasData).toBe(false)
  })

  it('sparse-kvartal har vatOut25Ore=0 (fångar `vatData?.vat_out_25 ?? 0`-mutation)', () => {
    bookEntry(db, '2026-05-15', [
      { account_number: '1930', debit_ore: 12500, credit_ore: 0 },
      { account_number: '3001', debit_ore: 0, credit_ore: 10000 },
      { account_number: '2610', debit_ore: 0, credit_ore: 2500 },
    ])

    const r = getVatReport(db, fiscalYearId)
    expect(r.quarters[0].vatOut25Ore).toBe(0)
    expect(r.quarters[2].vatOut25Ore).toBe(0)
    expect(r.quarters[3].vatOut25Ore).toBe(0)
    expect(r.quarters[1].vatOut25Ore).toBe(2500) // Q2 har data
  })
})

describe('Sprint 52 — vat-report yearTotal aggregering', () => {
  it('yearTotal.vatOut25Ore = SUM över quarters (Q2 + Q4)', () => {
    bookEntry(db, '2026-05-15', [
      { account_number: '1930', debit_ore: 12500, credit_ore: 0 },
      { account_number: '3001', debit_ore: 0, credit_ore: 10000 },
      { account_number: '2610', debit_ore: 0, credit_ore: 2500 },
    ])
    bookEntry(db, '2026-11-15', [
      { account_number: '1930', debit_ore: 6250, credit_ore: 0 },
      { account_number: '3001', debit_ore: 0, credit_ore: 5000 },
      { account_number: '2610', debit_ore: 0, credit_ore: 1250 },
    ])

    const r = getVatReport(db, fiscalYearId)
    const sum = r.quarters.reduce((s, q) => s + q.vatOut25Ore, 0)
    expect(r.yearTotal.vatOut25Ore).toBe(sum)
    expect(r.yearTotal.vatOut25Ore).toBe(3750) // 2500 + 1250
  })

  it('yearTotal.taxableBase25Ore = vatOut25Ore × 4 (fångar L194 ArithmeticOp)', () => {
    bookEntry(db, '2026-05-15', [
      { account_number: '1930', debit_ore: 12500, credit_ore: 0 },
      { account_number: '3001', debit_ore: 0, credit_ore: 10000 },
      { account_number: '2610', debit_ore: 0, credit_ore: 2500 },
    ])

    const r = getVatReport(db, fiscalYearId)
    expect(r.yearTotal.taxableBase25Ore).toBe(r.yearTotal.vatOut25Ore * 4)
    expect(r.yearTotal.taxableBase25Ore).toBe(10000)
  })

  it('yearTotal.vatNetOre = vatOutTotalOre - vatInOre (fångar L199 ArithmeticOp)', () => {
    // Utgående 25%: bokfor 2500 öre VAT
    bookEntry(db, '2026-05-15', [
      { account_number: '1930', debit_ore: 12500, credit_ore: 0 },
      { account_number: '3001', debit_ore: 0, credit_ore: 10000 },
      { account_number: '2610', debit_ore: 0, credit_ore: 2500 },
    ])
    // Ingaende 25%: 1000 öre
    bookEntry(db, '2026-08-15', [
      { account_number: '6230', debit_ore: 4000, credit_ore: 0 },
      { account_number: '2640', debit_ore: 1000, credit_ore: 0 },
      { account_number: '2440', debit_ore: 0, credit_ore: 5000 },
    ])

    const r = getVatReport(db, fiscalYearId)
    expect(r.yearTotal.vatNetOre).toBe(
      r.yearTotal.vatOutTotalOre - r.yearTotal.vatInOre,
    )
    expect(r.yearTotal.vatNetOre).toBe(1500) // 2500 - 1000
  })
})

describe('Sprint 52 — vat-report 12% och 6% taxableBase-aritmetik', () => {
  it('12% taxableBase = round(vatOut12 × 25/3) — fångar L168 ArithmeticOp', () => {
    // 12 öre VAT → bas = round(12 × 25/3) = round(100) = 100
    bookEntry(db, '2026-05-15', [
      { account_number: '1930', debit_ore: 112, credit_ore: 0 },
      { account_number: '3003', debit_ore: 0, credit_ore: 100 },
      { account_number: '2620', debit_ore: 0, credit_ore: 12 },
    ])

    const r = getVatReport(db, fiscalYearId)
    expect(r.quarters[1].vatOut12Ore).toBe(12)
    expect(r.quarters[1].taxableBase12Ore).toBe(100)
  })

  it('6% taxableBase = round(vatOut6 × 50/3) — fångar L168 ArithmeticOp', () => {
    // 6 öre VAT → bas = round(6 × 50/3) = round(100) = 100
    bookEntry(db, '2026-05-15', [
      { account_number: '1930', debit_ore: 106, credit_ore: 0 },
      { account_number: '3004', debit_ore: 0, credit_ore: 100 },
      { account_number: '2630', debit_ore: 0, credit_ore: 6 },
    ])

    const r = getVatReport(db, fiscalYearId)
    expect(r.quarters[1].vatOut6Ore).toBe(6)
    expect(r.quarters[1].taxableBase6Ore).toBe(100)
  })
})
