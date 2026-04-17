import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import {
  calculateResultSummary,
  calculateOperatingResult,
  calculateNetResult,
  calculateResultBreakdown,
  getBalanceSheetAccountBalances,
} from '../src/main/services/result-service'
import {
  validateResultConfigInvariants,
  INCOME_STATEMENT_CONFIG,
} from '../src/main/services/report/k2-mapping'
import {
  getIncomeStatement,
  getBalanceSheet,
} from '../src/main/services/report/report-service'
import { getDashboardSummary } from '../src/main/services/dashboard-service'
import { getTaxForecast } from '../src/main/services/tax-service'
import { bookYearEndResult } from '../src/main/services/opening-balance-service'

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

function ensureAccountExists(accountNumber: string, name: string) {
  const existing = db
    .prepare('SELECT 1 FROM accounts WHERE account_number = ?')
    .get(accountNumber)
  if (!existing) {
    db.prepare(
      "INSERT INTO accounts (account_number, name, account_type, is_active, is_system_account) VALUES (?, ?, 'expense', 1, 0)",
    ).run(accountNumber, name)
  }
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

// ═══ Test 1: Baseline — only class 3–7 ═══

describe('result-service baseline', () => {
  it('operatingResult === netResult when class 8 is empty', () => {
    // Revenue 100k
    bookEntry('2025-03-15', [
      { account: '1930', debit: 10_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 10_000_000 },
    ])
    // Expense 30k
    bookEntry('2025-03-20', [
      { account: '5010', debit: 3_000_000, credit: 0 },
      { account: '1930', debit: 0, credit: 3_000_000 },
    ])

    const summary = calculateResultSummary(db, fyId)
    expect(summary.operatingResultOre).toBe(7_000_000)
    expect(summary.resultAfterFinancialOre).toBe(7_000_000)
    expect(summary.netResultOre).toBe(7_000_000)
    expect(calculateOperatingResult(db, fyId)).toBe(7_000_000)
    expect(calculateNetResult(db, fyId)).toBe(7_000_000)
  })
})

// ═══ Test 2: Financial expenses ═══

describe('financial items', () => {
  it('räntekostnad (8410) minskar resultAfterFinancial men inte operatingResult', () => {
    // Revenue 100k
    bookEntry('2025-03-15', [
      { account: '1930', debit: 10_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 10_000_000 },
    ])
    // Interest expense 1000 kr = 100_000 öre
    bookEntry('2025-06-30', [
      { account: '8410', debit: 100_000, credit: 0 },
      { account: '1940', debit: 0, credit: 100_000 },
    ])

    const summary = calculateResultSummary(db, fyId)
    expect(summary.operatingResultOre).toBe(10_000_000)
    expect(summary.resultAfterFinancialOre).toBe(10_000_000 - 100_000)
    expect(summary.netResultOre).toBe(10_000_000 - 100_000)
  })

  // ═══ Test 3: Financial income ═══

  it('ränteintäkt (8310) ökar resultAfterFinancial', () => {
    // Revenue 100k
    bookEntry('2025-03-15', [
      { account: '1930', debit: 10_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 10_000_000 },
    ])
    // Interest income 500 kr = 50_000 öre
    bookEntry('2025-06-30', [
      { account: '1930', debit: 50_000, credit: 0 },
      { account: '8310', debit: 0, credit: 50_000 },
    ])

    const summary = calculateResultSummary(db, fyId)
    expect(summary.operatingResultOre).toBe(10_000_000)
    expect(summary.resultAfterFinancialOre).toBe(10_000_000 + 50_000)
  })
})

// ═══ Test 4: Tax ═══

describe('appropriations and tax', () => {
  it('skatt (8910) minskar netResult men inte resultAfterFinancial', () => {
    // Revenue 100k
    bookEntry('2025-03-15', [
      { account: '1930', debit: 10_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 10_000_000 },
    ])
    // Tax 2000 kr = 200_000 öre
    bookEntry('2025-12-31', [
      { account: '8910', debit: 200_000, credit: 0 },
      { account: '2510', debit: 0, credit: 200_000 },
    ])

    const summary = calculateResultSummary(db, fyId)
    expect(summary.operatingResultOre).toBe(10_000_000)
    expect(summary.resultAfterFinancialOre).toBe(10_000_000)
    expect(summary.netResultOre).toBe(10_000_000 - 200_000)
  })
})

// ═══ Test 5: F4 regression — 5-digit subccount class 8 ═══

describe('F4 regression — 5-digit subaccounts', () => {
  it('5-siffrigt underkonto 89991 inkluderas i netResult', () => {
    ensureAccountExists('89991', 'Skatt underkonto test')

    // Revenue 100k
    bookEntry('2025-03-15', [
      { account: '1930', debit: 10_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 10_000_000 },
    ])
    // 89991 debit (expense/tax)
    bookEntry('2025-12-31', [
      { account: '89991', debit: 100_000, credit: 0 },
      { account: '1930', debit: 0, credit: 100_000 },
    ])

    const netResult = calculateNetResult(db, fyId)
    // 10M revenue - 100k class8 expense = 9.9M
    expect(netResult).toBe(10_000_000 - 100_000)
  })

  // ═══ Test 6: F4 regression — 5-digit BS accounts ═══

  it('5-siffrigt BS-konto 19100 inkluderas i getBalanceSheetAccountBalances', () => {
    ensureAccountExists('19100', 'Bank underkonto test')

    bookEntry('2025-03-15', [
      { account: '19100', debit: 500_000, credit: 0 },
      { account: '3002', debit: 0, credit: 500_000 },
    ])

    const bsBalances = getBalanceSheetAccountBalances(db, fyId)
    const acc19100 = bsBalances.find((b) => b.account_number === '19100')
    expect(acc19100).toBeDefined()
    expect(acc19100!.balance).toBe(500_000) // debit - credit

    // And 19100 should NOT appear in net result
    const netResult = calculateNetResult(db, fyId)
    expect(netResult).toBe(500_000) // Only from 3002 credit
  })
})

// ═══ Test 7: DateRange filter ═══

describe('dateRange filter', () => {
  it('filtrerar resultat per datumintervall', () => {
    // January revenue 50k
    bookEntry('2025-01-15', [
      { account: '1930', debit: 5_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 5_000_000 },
    ])
    // March revenue 100k
    bookEntry('2025-03-15', [
      { account: '1930', debit: 10_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 10_000_000 },
    ])

    const fullYear = calculateResultSummary(db, fyId)
    expect(fullYear.netResultOre).toBe(15_000_000)

    const marchOnly = calculateResultSummary(db, fyId, {
      from: '2025-03-01',
      to: '2025-03-31',
    })
    expect(marchOnly.netResultOre).toBe(10_000_000)
  })
})

// ═══ Test 8: Invariant 1 — result-service vs getIncomeStatement ═══

describe('invariant tests', () => {
  it('calculateResultSummary === getIncomeStatement results (with class 8)', () => {
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
    // Tax 1k
    bookEntry('2025-12-31', [
      { account: '8910', debit: 100_000, credit: 0 },
      { account: '2510', debit: 0, credit: 100_000 },
    ])

    const summary = calculateResultSummary(db, fyId)
    const rr = getIncomeStatement(db, fyId)

    expect(summary.operatingResultOre).toBe(rr.operatingResult)
    expect(summary.resultAfterFinancialOre).toBe(rr.resultAfterFinancial)
    expect(summary.netResultOre).toBe(rr.netResult)
  })

  // ═══ Test 9: Invariant 2 — independent fallback query ═══

  it('calculateNetResult matches independent SQL fallback', () => {
    // Revenue 200k + expense 80k + financial + tax
    bookEntry('2025-03-01', [
      { account: '1930', debit: 20_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 20_000_000 },
    ])
    bookEntry('2025-03-10', [
      { account: '5010', debit: 8_000_000, credit: 0 },
      { account: '1930', debit: 0, credit: 8_000_000 },
    ])
    bookEntry('2025-06-30', [
      { account: '1930', debit: 500_000, credit: 0 },
      { account: '8310', debit: 0, credit: 500_000 },
    ])
    bookEntry('2025-12-31', [
      { account: '8910', debit: 100_000, credit: 0 },
      { account: '2510', debit: 0, credit: 100_000 },
    ])

    const netResult = calculateNetResult(db, fyId)

    // Independent fallback query — direct SQL
    const fallbackRow = db
      .prepare(
        `SELECT
          COALESCE(SUM(jel.credit_ore), 0) - COALESCE(SUM(jel.debit_ore), 0) AS net
        FROM journal_entry_lines jel
        JOIN journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.fiscal_year_id = ?
          AND je.status = 'booked'
          AND CAST(SUBSTR(jel.account_number || '0000', 1, 4) AS INTEGER) BETWEEN 3000 AND 8999`,
      )
      .get(fyId) as { net: number }

    expect(netResult).toBe(fallbackRow.net)
  })

  // ═══ Test 10: Invariant 3 — Dashboard ═══

  it('Dashboard.operatingResultOre === calculateOperatingResult (with class 8)', () => {
    // Revenue 100k
    bookEntry('2025-03-15', [
      { account: '1930', debit: 10_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 10_000_000 },
    ])
    // Expense 30k
    bookEntry('2025-03-20', [
      { account: '5010', debit: 3_000_000, credit: 0 },
      { account: '1930', debit: 0, credit: 3_000_000 },
    ])
    // Interest expense — should NOT affect operatingResult
    bookEntry('2025-06-30', [
      { account: '8410', debit: 100_000, credit: 0 },
      { account: '1930', debit: 0, credit: 100_000 },
    ])

    const dashboard = getDashboardSummary(db, fyId)
    const operatingResult = calculateOperatingResult(db, fyId)
    expect(dashboard.operatingResultOre).toBe(operatingResult)
    expect(dashboard.operatingResultOre).toBe(7_000_000) // not affected by 8410
  })

  // ═══ Test 11: Invariant 4 — Tax ═══

  it('Tax.operatingProfitOre === calculateOperatingResult', () => {
    // Revenue 100k
    bookEntry('2025-03-15', [
      { account: '1930', debit: 10_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 10_000_000 },
    ])
    // Expense 30k
    bookEntry('2025-03-20', [
      { account: '5010', debit: 3_000_000, credit: 0 },
      { account: '1930', debit: 0, credit: 3_000_000 },
    ])

    const tax = getTaxForecast(db, fyId)
    const operatingResult = calculateOperatingResult(db, fyId)
    expect(tax.operatingProfitOre).toBe(operatingResult)
  })
})

// ═══ Test 12: bookYearEndResult with class 8 ═══

describe('bookYearEndResult with class 8', () => {
  it('inkluderar klass 8 i årets resultat', () => {
    // Revenue (klass 3): 50k
    bookEntry('2025-03-15', [
      { account: '1930', debit: 5_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 5_000_000 },
    ])
    // Financial expense (klass 8): 10k
    bookEntry('2025-06-30', [
      { account: '8410', debit: 1_000_000, credit: 0 },
      { account: '1930', debit: 0, credit: 1_000_000 },
    ])

    const netResult = calculateNetResult(db, fyId)
    expect(netResult).toBe(4_000_000) // 50k - 10k

    const je = bookYearEndResult(db, fyId, netResult)
    expect(je).not.toBeNull()

    // Verify the year-end entry uses the full net result (incl class 8)
    const lines = db
      .prepare(
        'SELECT debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
      )
      .all(je!.id) as { debit_ore: number; credit_ore: number }[]

    // Profit: debit 8999, credit 2099
    expect(lines[0].debit_ore).toBe(4_000_000) // includes class 8
    expect(lines[1].credit_ore).toBe(4_000_000)
  })
})

// ═══ Test 13: 3740 regression ═══

describe('3740 öresutjämning regression', () => {
  // 3740-bugfix regression: Sprint 11 Fas 3. Innan fixen exkluderade Dashboard 3740
  // från revenue men fångade det inte någon annanstans, vilket gjorde att
  // operatingResultOre avvek från Resultaträkningen med exakt öresutjämningsbeloppet.
  it('3740 inkluderas korrekt i resultatberäkning', () => {
    // Revenue via normal invoice account
    bookEntry('2025-03-15', [
      { account: '1510', debit: 10_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 9_999_970 },
      { account: '3740', debit: 0, credit: 30 }, // öresutjämning
    ])

    const netResult = calculateNetResult(db, fyId)
    expect(netResult).toBe(10_000_000) // includes 3740

    const operatingResult = calculateOperatingResult(db, fyId)
    expect(operatingResult).toBe(10_000_000) // includes 3740

    const dashboard = getDashboardSummary(db, fyId)
    const rr = getIncomeStatement(db, fyId)
    expect(dashboard.operatingResultOre).toBe(rr.operatingResult)
  })
})

// ═══ Test 14: Config invariant validation ═══

describe('validateResultConfigInvariants', () => {
  it('INCOME_STATEMENT_CONFIG passerar validering', () => {
    expect(() =>
      validateResultConfigInvariants(INCOME_STATEMENT_CONFIG),
    ).not.toThrow()
  })

  it('kastar vid coverage-lucka', () => {
    // Remove tax line (8900-8999) to create a gap
    const broken = INCOME_STATEMENT_CONFIG.map((g) => ({
      ...g,
      lines:
        g.id === 'appropriations_and_tax'
          ? g.lines.filter((l) => l.id !== 'tax')
          : [...g.lines],
    }))

    expect(() => validateResultConfigInvariants(broken)).toThrow(
      /does not cover up to 8999/,
    )
  })

  it('kastar vid sign mismatch', () => {
    const broken = INCOME_STATEMENT_CONFIG.map((g) => ({
      ...g,
      lines:
        g.id === 'operating_income'
          ? g.lines.map((l) => ({ ...l, signMultiplier: -1 as const }))
          : [...g.lines],
    }))

    expect(() => validateResultConfigInvariants(broken)).toThrow(
      /sign mismatch/,
    )
  })
})

// ═══ Session-20 addition: operatingResult !== netResult with class 8 ═══

describe('getIncomeStatement class 8 separation', () => {
  it('operatingResult !== netResult when class 8 has entries', () => {
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
    // Interest income 5k (class 8)
    bookEntry('2025-06-30', [
      { account: '1930', debit: 500_000, credit: 0 },
      { account: '8310', debit: 0, credit: 500_000 },
    ])
    // Tax 1k (class 8)
    bookEntry('2025-12-31', [
      { account: '8910', debit: 100_000, credit: 0 },
      { account: '2510', debit: 0, credit: 100_000 },
    ])

    const rr = getIncomeStatement(db, fyId)
    expect(rr.operatingResult).toBe(12_000_000) // 20M - 8M
    expect(rr.resultAfterFinancial).toBe(12_500_000) // + 0.5M interest
    expect(rr.netResult).toBe(12_400_000) // - 0.1M tax
    expect(rr.operatingResult).not.toBe(rr.netResult)
  })
})

// ═══ ResultBreakdown ═══

describe('calculateResultBreakdown', () => {
  it('returnerar revenue/expenses separat', () => {
    // Revenue 100k
    bookEntry('2025-03-15', [
      { account: '1930', debit: 10_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 10_000_000 },
    ])
    // Expense 30k
    bookEntry('2025-03-20', [
      { account: '5010', debit: 3_000_000, credit: 0 },
      { account: '1930', debit: 0, credit: 3_000_000 },
    ])

    const breakdown = calculateResultBreakdown(db, fyId)
    expect(breakdown.revenueOre).toBe(10_000_000)
    expect(breakdown.expensesOre).toBe(3_000_000)
    expect(breakdown.operatingResultOre).toBe(7_000_000)
  })
})
