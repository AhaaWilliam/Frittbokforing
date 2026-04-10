import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import {
  getIncomeStatement,
  getBalanceSheet,
} from '../src/main/services/report/report-service'
import {
  matchesRanges,
  validateNoOverlap,
  validateAllAccountsCovered,
  INCOME_STATEMENT_CONFIG,
  BALANCE_SHEET_ASSETS_CONFIG,
  BALANCE_SHEET_EQUITY_CONFIG,
} from '../src/main/services/report/k2-mapping'

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

// Helper: create a booked journal entry with lines
// Insert as draft first, add lines, then update to booked (trigger blocks lines on booked entries)
function bookEntry(
  date: string,
  lines: { account: string; debit: number; credit: number }[],
) {
  const je = db
    .prepare(
      `INSERT INTO journal_entries (company_id, fiscal_year_id, verification_series, verification_number, journal_date, description, status, source_type)
       VALUES (1, ?, 'A', (SELECT COALESCE(MAX(verification_number),0)+1 FROM journal_entries WHERE fiscal_year_id = ? AND verification_series = 'A'), ?, 'Test', 'draft', 'manual')`,
    )
    .run(fyId, fyId, date)

  const jeId = je.lastInsertRowid as number
  let lineNum = 1
  for (const l of lines) {
    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_amount, credit_amount, description)
       VALUES (?, ?, ?, ?, ?, '')`,
    ).run(jeId, lineNum++, l.account, l.debit, l.credit)
  }

  db.prepare("UPDATE journal_entries SET status = 'booked' WHERE id = ?").run(
    jeId,
  )
}

// ═══ K2 Mapping Validation ═══

describe('K2 mapping validation', () => {
  it('RR-konfiguration har inga överlapp', () => {
    expect(() => validateNoOverlap([INCOME_STATEMENT_CONFIG])).not.toThrow()
  })

  it('BR-konfiguration har inga överlapp', () => {
    expect(() =>
      validateNoOverlap([
        BALANCE_SHEET_ASSETS_CONFIG,
        BALANCE_SHEET_EQUITY_CONFIG,
      ]),
    ).not.toThrow()
  })

  it('alla seedade konton klass 3-8 matchar exakt en RR-rubrik', () => {
    const plAccounts = (
      db
        .prepare(
          "SELECT account_number FROM accounts WHERE account_number >= '3000' AND account_number < '9000' ORDER BY account_number",
        )
        .all() as { account_number: string }[]
    ).map((r) => r.account_number)

    const uncovered = validateAllAccountsCovered(plAccounts, [
      INCOME_STATEMENT_CONFIG,
    ])
    expect(uncovered).toEqual([])
  })

  it('alla seedade konton klass 1-2 matchar exakt en BR-rubrik', () => {
    const bsAccounts = (
      db
        .prepare(
          "SELECT account_number FROM accounts WHERE account_number < '3000' ORDER BY account_number",
        )
        .all() as { account_number: string }[]
    ).map((r) => r.account_number)

    const uncovered = validateAllAccountsCovered(bsAccounts, [
      BALANCE_SHEET_ASSETS_CONFIG,
      BALANCE_SHEET_EQUITY_CONFIG,
    ])
    expect(uncovered).toEqual([])
  })

  it('matchesRanges: 5-siffrigt konto 37991 matchar 3000-3799', () => {
    expect(matchesRanges('37991', [{ from: '3000', to: '3799' }])).toBe(true)
  })

  it('matchesRanges: kort konto 99 matchar INTE 1000-1999', () => {
    expect(matchesRanges('99', [{ from: '1000', to: '1999' }])).toBe(false)
  })
})

// ═══ Resultaträkning ═══

describe('Resultaträkning', () => {
  it('korrekt nettoomsättning', () => {
    // Credit 3002 (tjänster 25%) with 100 000 kr
    bookEntry('2025-03-15', [
      { account: '1930', debit: 12_500_000, credit: 0 },
      { account: '3002', debit: 0, credit: 10_000_000 },
      { account: '2610', debit: 0, credit: 2_500_000 },
    ])

    const rr = getIncomeStatement(db, fyId)
    const netRevLine = rr.groups
      .flatMap((g) => g.lines)
      .find((l) => l.id === 'net_revenue')!
    expect(netRevLine.displayAmount).toBe(10_000_000) // positive
  })

  it('korrekt rörelseresultat', () => {
    // Revenue 100k
    bookEntry('2025-03-15', [
      { account: '1930', debit: 10_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 10_000_000 },
    ])
    // Expense 30k lokalhyra
    bookEntry('2025-03-20', [
      { account: '5010', debit: 3_000_000, credit: 0 },
      { account: '1930', debit: 0, credit: 3_000_000 },
    ])

    const rr = getIncomeStatement(db, fyId)
    // operatingResult = income (10M net) + expenses (-3M net) = 7M
    expect(rr.operatingResult).toBe(7_000_000)
  })

  it('kostnader: positivt displayAmount (signMultiplier)', () => {
    bookEntry('2025-02-01', [
      { account: '5010', debit: 5_000_000, credit: 0 },
      { account: '1930', debit: 0, credit: 5_000_000 },
    ])

    const rr = getIncomeStatement(db, fyId)
    const otherExternal = rr.groups
      .flatMap((g) => g.lines)
      .find((l) => l.id === 'other_external')!
    // net = credit - debit = 0 - 5_000_000 = -5_000_000
    // displayAmount = -5_000_000 * (-1) = 5_000_000
    expect(otherExternal.displayAmount).toBe(5_000_000)
  })

  it('intäkter: positivt displayAmount', () => {
    bookEntry('2025-01-10', [
      { account: '1930', debit: 10_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 10_000_000 },
    ])

    const rr = getIncomeStatement(db, fyId)
    const netRev = rr.groups
      .flatMap((g) => g.lines)
      .find((l) => l.id === 'net_revenue')!
    expect(netRev.displayAmount).toBe(10_000_000)
  })

  it('korrekt netResult (årets resultat)', () => {
    // Revenue 200k
    bookEntry('2025-03-01', [
      { account: '1930', debit: 20_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 20_000_000 },
    ])
    // Expense 80k
    bookEntry('2025-03-10', [
      { account: '5010', debit: 8_000_000, credit: 0 },
      { account: '1930', debit: 0, credit: 8_000_000 },
    ])
    // Interest income 5k
    bookEntry('2025-06-30', [
      { account: '1930', debit: 500_000, credit: 0 },
      { account: '8310', debit: 0, credit: 500_000 },
    ])

    const rr = getIncomeStatement(db, fyId)
    // net = 20M - 8M + 0.5M = 12.5M
    expect(rr.netResult).toBe(12_500_000)
  })

  it('tomt FY → alla = 0, ingen crash', () => {
    const rr = getIncomeStatement(db, fyId)
    expect(rr.netResult).toBe(0)
    expect(rr.operatingResult).toBe(0)
    expect(rr.groups.length).toBeGreaterThan(0)
  })

  it('drill-down: accounts innehåller kontonummer + kontonamn + belopp', () => {
    bookEntry('2025-04-01', [
      { account: '5010', debit: 1_000_000, credit: 0 },
      { account: '6110', debit: 500_000, credit: 0 },
      { account: '1930', debit: 0, credit: 1_500_000 },
    ])

    const rr = getIncomeStatement(db, fyId)
    const otherExternal = rr.groups
      .flatMap((g) => g.lines)
      .find((l) => l.id === 'other_external')!
    expect(otherExternal.accounts.length).toBe(2)
    const lokalhyra = otherExternal.accounts.find(
      (a) => a.accountNumber === '5010',
    )!
    expect(lokalhyra.accountName).toBe('Lokalhyra')
    expect(lokalhyra.displayAmount).toBe(1_000_000)
  })
})

// ═══ Balansräkning ═══

describe('Balansräkning', () => {
  it('tillgångar = IB + årets rörelser', () => {
    // Deposit cash 500k
    bookEntry('2025-01-05', [
      { account: '1930', debit: 50_000_000, credit: 0 },
      { account: '2081', debit: 0, credit: 50_000_000 },
    ])

    const br = getBalanceSheet(db, fyId)
    const cashLine = br.assets.groups
      .flatMap((g) => g.lines)
      .find((l) => l.id === 'cash_and_bank')!
    expect(cashLine.displayAmount).toBe(50_000_000)
  })

  it('skulder korrekt', () => {
    bookEntry('2025-02-01', [
      { account: '5010', debit: 2_000_000, credit: 0 },
      { account: '2440', debit: 0, credit: 2_000_000 },
    ])

    const br = getBalanceSheet(db, fyId)
    const apLine = br.equityAndLiabilities.groups
      .flatMap((g) => g.lines)
      .find((l) => l.id === 'accounts_payable')!
    expect(apLine.displayAmount).toBe(2_000_000)
  })

  it('calculatedNetResult = SUM(net klass 3-8)', () => {
    // Revenue 100k, expense 40k → net result 60k
    bookEntry('2025-03-01', [
      { account: '1930', debit: 10_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 10_000_000 },
    ])
    bookEntry('2025-03-05', [
      { account: '5010', debit: 4_000_000, credit: 0 },
      { account: '1930', debit: 0, credit: 4_000_000 },
    ])

    const br = getBalanceSheet(db, fyId)
    // net for class 3-8: 3002 credit 10M (net=10M) + 5010 debit 4M (net=-4M) = 6M
    expect(br.equityAndLiabilities.calculatedNetResult).toBe(6_000_000)
  })

  it('BR balanserar (totalAssets === totalEquityAndLiabilities)', () => {
    // Create balanced entries
    bookEntry('2025-01-10', [
      { account: '1930', debit: 25_000_000, credit: 0 },
      { account: '2081', debit: 0, credit: 25_000_000 },
    ])
    bookEntry('2025-02-15', [
      { account: '1930', debit: 10_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 10_000_000 },
    ])
    bookEntry('2025-03-01', [
      { account: '5010', debit: 3_000_000, credit: 0 },
      { account: '1930', debit: 0, credit: 3_000_000 },
    ])

    const br = getBalanceSheet(db, fyId)
    expect(br.balanceDifference).toBe(0)
    expect(br.assets.total).toBe(br.equityAndLiabilities.total)
  })

  it('tomt FY → balanserar (0 = 0)', () => {
    const br = getBalanceSheet(db, fyId)
    expect(br.balanceDifference).toBe(0)
    expect(br.assets.total).toBe(0)
    expect(br.equityAndLiabilities.total).toBe(0)
  })

  it('FY utan föregående → IB = 0', () => {
    bookEntry('2025-06-01', [
      { account: '1930', debit: 5_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 5_000_000 },
    ])

    const br = getBalanceSheet(db, fyId)
    // Only movements, no IB
    const cash = br.assets.groups
      .flatMap((g) => g.lines)
      .find((l) => l.id === 'cash_and_bank')!
    expect(cash.displayAmount).toBe(5_000_000)
    expect(br.balanceDifference).toBe(0)
  })

  it('efter bokslut (8999+2099): calculatedNetResult = 0, BR balanserar', () => {
    // Revenue 100k
    bookEntry('2025-03-01', [
      { account: '1930', debit: 10_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 10_000_000 },
    ])
    // Book closing: debit 8999 10M, credit 2099 10M
    bookEntry('2025-12-31', [
      { account: '8999', debit: 10_000_000, credit: 0 },
      { account: '2099', debit: 0, credit: 10_000_000 },
    ])

    const br = getBalanceSheet(db, fyId)
    // class 3-8: 3002 net=10M + 8999 net=-10M = 0
    expect(br.equityAndLiabilities.calculatedNetResult).toBe(0)
    expect(br.balanceDifference).toBe(0)
  })
})

// ═══ Teckenhantering ═══

describe('Teckenhantering', () => {
  it('intäkt (3xxx) credit 100000 → displayAmount = 100000', () => {
    bookEntry('2025-01-15', [
      { account: '1930', debit: 100_000, credit: 0 },
      { account: '3002', debit: 0, credit: 100_000 },
    ])

    const rr = getIncomeStatement(db, fyId)
    const netRev = rr.groups
      .flatMap((g) => g.lines)
      .find((l) => l.id === 'net_revenue')!
    expect(netRev.displayAmount).toBe(100_000)
  })

  it('kostnad (5xxx) debit 50000 → displayAmount = 50000', () => {
    bookEntry('2025-01-15', [
      { account: '5010', debit: 50_000, credit: 0 },
      { account: '1930', debit: 0, credit: 50_000 },
    ])

    const rr = getIncomeStatement(db, fyId)
    const otherExt = rr.groups
      .flatMap((g) => g.lines)
      .find((l) => l.id === 'other_external')!
    expect(otherExt.displayAmount).toBe(50_000)
  })

  it('tillgång (1930) debit 200000 → displayAmount = 200000', () => {
    bookEntry('2025-01-15', [
      { account: '1930', debit: 200_000, credit: 0 },
      { account: '2081', debit: 0, credit: 200_000 },
    ])

    const br = getBalanceSheet(db, fyId)
    const cash = br.assets.groups
      .flatMap((g) => g.lines)
      .find((l) => l.id === 'cash_and_bank')!
    expect(cash.displayAmount).toBe(200_000)
  })

  it('skuld (2440) credit 75000 → displayAmount = 75000', () => {
    bookEntry('2025-01-15', [
      { account: '5010', debit: 75_000, credit: 0 },
      { account: '2440', debit: 0, credit: 75_000 },
    ])

    const br = getBalanceSheet(db, fyId)
    const ap = br.equityAndLiabilities.groups
      .flatMap((g) => g.lines)
      .find((l) => l.id === 'accounts_payable')!
    expect(ap.displayAmount).toBe(75_000)
  })
})

// ═══ dateRange-filtrering ═══

describe('dateRange-filtrering', () => {
  it('RR med dateRange → bara transaktioner inom intervallet', () => {
    bookEntry('2025-01-15', [
      { account: '1930', debit: 5_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 5_000_000 },
    ])
    bookEntry('2025-03-15', [
      { account: '1930', debit: 3_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 3_000_000 },
    ])

    const rr = getIncomeStatement(db, fyId, {
      from: '2025-03-01',
      to: '2025-03-31',
    })
    const netRev = rr.groups
      .flatMap((g) => g.lines)
      .find((l) => l.id === 'net_revenue')!
    expect(netRev.displayAmount).toBe(3_000_000) // only March
  })

  it('BR med dateRange → korrekt IB', () => {
    // January: deposit 500k
    bookEntry('2025-01-05', [
      { account: '1930', debit: 50_000_000, credit: 0 },
      { account: '2081', debit: 0, credit: 50_000_000 },
    ])
    // March: revenue 100k
    bookEntry('2025-03-15', [
      { account: '1930', debit: 10_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 10_000_000 },
    ])

    const br = getBalanceSheet(db, fyId, {
      from: '2025-03-01',
      to: '2025-03-31',
    })
    // Cash = IB (50M from Jan) + movement (10M from Mar) = 60M
    const cash = br.assets.groups
      .flatMap((g) => g.lines)
      .find((l) => l.id === 'cash_and_bank')!
    expect(cash.displayAmount).toBe(60_000_000)
  })

  it('RR utan dateRange → hela årets data', () => {
    bookEntry('2025-01-15', [
      { account: '1930', debit: 5_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 5_000_000 },
    ])
    bookEntry('2025-06-15', [
      { account: '1930', debit: 3_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 3_000_000 },
    ])

    const rr = getIncomeStatement(db, fyId)
    const netRev = rr.groups
      .flatMap((g) => g.lines)
      .find((l) => l.id === 'net_revenue')!
    expect(netRev.displayAmount).toBe(8_000_000) // both
  })
})
