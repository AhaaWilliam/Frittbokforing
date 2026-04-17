import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import {
  getIncomeStatement,
  getBalanceSheet,
} from '../src/main/services/report/report-service'
import { calculateResultSummary } from '../src/main/services/result-service'
import { calculateNetResult } from '../src/main/services/opening-balance-service'

function createTestDb(): Database.Database {
  const testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.pragma('foreign_keys = ON')
  for (let i = 0; i < migrations.length; i++) {
    const m = migrations[i]
    const needsFkOff = i === 21 || i === 22
    if (needsFkOff) testDb.pragma('foreign_keys = OFF')
    testDb.exec('BEGIN EXCLUSIVE')
    testDb.exec(m.sql)
    if (m.programmatic) m.programmatic(testDb)
    testDb.pragma(`user_version = ${i + 1}`)
    testDb.exec('COMMIT')
    if (needsFkOff) {
      testDb.pragma('foreign_keys = ON')
      const fkCheck = testDb.pragma('foreign_key_check') as unknown[]
      if (fkCheck.length > 0) {
        throw new Error(`Migration ${i + 1} FK check failed: ${JSON.stringify(fkCheck)}`)
      }
    }
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

let db: Database.Database
let companyId: number
let fyId: number

function bookEntry(
  date: string,
  lines: { account: string; debit: number; credit: number }[],
) {
  const je = db
    .prepare(
      `INSERT INTO journal_entries (company_id, fiscal_year_id, verification_series, verification_number, journal_date, description, status, source_type)
       VALUES (?, ?, 'A', (SELECT COALESCE(MAX(verification_number),0)+1 FROM journal_entries WHERE fiscal_year_id = ? AND verification_series = 'A'), ?, 'Test', 'draft', 'manual')`,
    )
    .run(companyId, fyId, fyId, date)

  const jeId = je.lastInsertRowid as number
  let lineNum = 1
  for (const l of lines) {
    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
       VALUES (?, ?, ?, ?, ?, '')`,
    ).run(jeId, lineNum++, l.account, l.debit, l.credit)
  }

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

describe('BR/RR netResult konsistens (F19 — M134)', () => {
  it('positivt resultat med klass 8 + skatt 89xx', () => {
    // Revenue 200k + financial expense 10k + tax 20k → netto 170k
    bookEntry('2025-03-01', [
      { account: '1930', debit: 20_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 20_000_000 },
    ])
    bookEntry('2025-06-30', [
      { account: '8410', debit: 1_000_000, credit: 0 },
      { account: '1930', debit: 0, credit: 1_000_000 },
    ])
    bookEntry('2025-12-31', [
      { account: '8910', debit: 2_000_000, credit: 0 },
      { account: '2510', debit: 0, credit: 2_000_000 },
    ])

    const rr = getIncomeStatement(db, fyId)
    const br = getBalanceSheet(db, fyId)
    expect(br.equityAndLiabilities.calculatedNetResult).toBe(rr.netResult)
    expect(rr.netResult).toBe(17_000_000)
  })

  it('negativt resultat utan klass 8', () => {
    bookEntry('2025-03-01', [
      { account: '5010', debit: 5_000_000, credit: 0 },
      { account: '1930', debit: 0, credit: 5_000_000 },
    ])

    const rr = getIncomeStatement(db, fyId)
    const br = getBalanceSheet(db, fyId)
    expect(br.equityAndLiabilities.calculatedNetResult).toBe(rr.netResult)
    expect(rr.netResult).toBe(-5_000_000)
  })

  it('noll-resultat (inga verifikationer)', () => {
    const rr = getIncomeStatement(db, fyId)
    const br = getBalanceSheet(db, fyId)
    expect(br.equityAndLiabilities.calculatedNetResult).toBe(rr.netResult)
    expect(rr.netResult).toBe(0)
  })
})

describe('Negativa kontrakt', () => {
  it('obefintligt fiscal_year_id kastar strukturerat NOT_FOUND-fel (M100)', () => {
    // getFiscalYear throws { code: 'NOT_FOUND', error: 'Räkenskapsår 99999 hittades inte' }
    expect(() => getIncomeStatement(db, 99999)).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    )
  })

  it('klass 8 finns men 89xx (skatt) saknas → korrekt netResult, ingen krasch', () => {
    bookEntry('2025-06-30', [
      { account: '1930', debit: 50_000, credit: 0 },
      { account: '8310', debit: 0, credit: 50_000 },
    ])

    const rr = getIncomeStatement(db, fyId)
    expect(rr.netResult).toBe(50_000)
  })

  it('BR balanserar efter fix', () => {
    bookEntry('2025-03-01', [
      { account: '1930', debit: 10_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 10_000_000 },
    ])
    bookEntry('2025-06-30', [
      { account: '8410', debit: 500_000, credit: 0 },
      { account: '1930', debit: 0, credit: 500_000 },
    ])

    const br = getBalanceSheet(db, fyId)
    expect(br.assets.total).toBe(br.equityAndLiabilities.total)
  })
})

describe('F19 permanent vakt — alla konsumenter ger identisk siffra', () => {
  it('alla 4 konsument-vägar returnerar identisk netResult', () => {
    bookEntry('2025-03-01', [
      { account: '1930', debit: 20_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 20_000_000 },
    ])
    bookEntry('2025-06-30', [
      { account: '8410', debit: 1_000_000, credit: 0 },
      { account: '1930', debit: 0, credit: 1_000_000 },
    ])
    bookEntry('2025-12-31', [
      { account: '8910', debit: 2_000_000, credit: 0 },
      { account: '2510', debit: 0, credit: 2_000_000 },
    ])

    const summary = calculateResultSummary(db, fyId)
    const viaReExport = calculateNetResult(db, fyId)
    const rr = getIncomeStatement(db, fyId)
    const br = getBalanceSheet(db, fyId)

    const consumers = new Map<string, number>([
      ['result-service.netResultOre', summary.netResultOre],
      ['opening-balance-service.calculateNetResult (re-export)', viaReExport],
      ['report-service.getIncomeStatement.netResult', rr.netResult],
      [
        'report-service.getBalanceSheet.calculatedNetResult',
        br.equityAndLiabilities.calculatedNetResult,
      ],
    ])

    const distinctValues = new Set(consumers.values())
    expect(distinctValues.size).toBe(1)
    expect(summary.netResultOre).toBe(17_000_000)
  })
})
