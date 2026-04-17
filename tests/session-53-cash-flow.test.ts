import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { bookYearEndResult } from '../src/main/services/opening-balance-service'
import { getCashFlowStatement, WORKING_CAPITAL_RANGES } from '../src/main/services/cash-flow-service'

let db: Database.Database
let companyId: number
let fyId: number

const VALID_COMPANY = {
  name: 'CF Test AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2025-01-15',
  fiscal_year_start: '2025-01-01',
  fiscal_year_end: '2025-12-31',
}

function ensureAccount(number: string, name: string, type = 'asset') {
  const existing = db.prepare('SELECT 1 FROM accounts WHERE account_number = ?').get(number)
  if (!existing) {
    db.prepare(
      "INSERT INTO accounts (account_number, name, account_type, is_active, is_system_account) VALUES (?, ?, ?, 1, 0)",
    ).run(number, name, type)
  }
}

function bookEntry(
  date: string,
  lines: Array<{ account: string; debit?: number; credit?: number }>,
  series: 'A' | 'B' | 'C' | 'E' = 'C',
) {
  const nextVer = db
    .prepare(
      `SELECT COALESCE(MAX(verification_number), 0) + 1 as n FROM journal_entries
       WHERE fiscal_year_id = ? AND verification_series = ?`,
    )
    .get(fyId, series) as { n: number }

  const je = db
    .prepare(
      `INSERT INTO journal_entries (
        company_id, fiscal_year_id, verification_number, verification_series,
        journal_date, description, status, source_type
      ) VALUES (?, ?, ?, ?, ?, 'Test', 'draft', 'manual')`,
    )
    .run(companyId, fyId, nextVer.n, series, date)

  const jeId = Number(je.lastInsertRowid)
  let lineNum = 1
  for (const l of lines) {
    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(jeId, lineNum++, l.account, l.debit ?? 0, l.credit ?? 0)
  }

  db.prepare("UPDATE journal_entries SET status = 'booked' WHERE id = ?").run(jeId)
  return jeId
}

beforeEach(() => {
  db = createTestDb()
  createCompany(db, VALID_COMPANY)
  companyId = (db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: number }).id
  fyId = (db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }).id

  // Seed required accounts — use ensureAccount for each
  for (const acc of ['1220', '1229', '1510', '1920', '2099', '2350', '2440', '2081', '3000', '6990', '7832', '8999']) {
    ensureAccount(acc, `Test ${acc}`, 'asset')
  }
})

afterEach(() => {
  db.close()
})

describe('WORKING_CAPITAL_RANGES', () => {
  it('täcker K2/K3-standard: 14xx-17xx assets, 24xx/26xx/28xx/29xx liabilities', () => {
    const assetRanges = WORKING_CAPITAL_RANGES.current_assets
    expect(assetRanges.map((r) => r.from)).toEqual([1400, 1500, 1600, 1700])

    const liabRanges = WORKING_CAPITAL_RANGES.current_liabilities
    expect(liabRanges.map((r) => r.from)).toEqual([2400, 2600, 2800, 2900])

    expect(WORKING_CAPITAL_RANGES.cash[0]).toEqual({ from: 1900, to: 1999, label: 'Likvida medel' })
  })
})

describe('getCashFlowStatement — invariant: op+inv+fin === ΔCash', () => {
  it('kontantförsäljning (utan year-end-booking): netChange = +netResult, financing = 0', () => {
    // F65-b: utan year-end-booking ska financing = 0 (inte −netResult som i S53).
    bookEntry('2025-01-15', [
      { account: '1920', debit: 100_000 },
      { account: '3000', credit: 100_000 },
    ], 'A')

    const r = getCashFlowStatement(db, fyId)
    expect(r.success).toBe(true)
    if (!r.success) return

    expect(r.data.netResultOre).toBe(100_000)
    expect(r.data.operating.subtotal_ore).toBe(100_000)
    expect(r.data.investing.subtotal_ore).toBe(0)
    expect(r.data.financing.subtotal_ore).toBe(0)
    expect(r.data.netChangeOre).toBe(100_000)
    // Invariant: op + inv + fin === closingCash − openingCash
    expect(r.data.netChangeOre).toBe(r.data.closingCashOre - r.data.openingCashOre)
  })

  it('kontantförsäljning + year-end booked: invariant håller, financing = 0', () => {
    // F65-b: med year-end-booking (D 8999 / K 2099) ska invarianten fortfarande hålla.
    bookEntry('2025-01-15', [
      { account: '1920', debit: 100_000 },
      { account: '3000', credit: 100_000 },
    ], 'A')
    // Boka årsresultat
    bookYearEndResult(db, fyId, 100_000)

    const r = getCashFlowStatement(db, fyId)
    expect(r.success).toBe(true)
    if (!r.success) return

    // netResultOre exponeras som pre-YE-värde (= +100_000)
    expect(r.data.netResultOre).toBe(100_000)
    expect(r.data.operating.subtotal_ore).toBe(100_000)
    expect(r.data.financing.subtotal_ore).toBe(0)
    expect(r.data.netChangeOre).toBe(100_000)
    expect(r.data.netChangeOre).toBe(r.data.closingCashOre - r.data.openingCashOre)
  })

  it('kontantförlust + year-end booked (förlust): invariant håller', () => {
    // F65-b: förlust med year-end-booking (D 2099 / K 8999).
    bookEntry('2025-02-01', [
      { account: '6990', debit: 50_000 }, // Cost (expense class)
      { account: '1920', credit: 50_000 }, // Bank minskar
    ], 'B')
    bookYearEndResult(db, fyId, -50_000)

    const r = getCashFlowStatement(db, fyId)
    expect(r.success).toBe(true)
    if (!r.success) return

    expect(r.data.netResultOre).toBe(-50_000)
    expect(r.data.operating.subtotal_ore).toBe(-50_000)
    expect(r.data.financing.subtotal_ore).toBe(0)
    expect(r.data.netChangeOre).toBe(-50_000)
    expect(r.data.netChangeOre).toBe(r.data.closingCashOre - r.data.openingCashOre)
  })

  it('kreditförsäljning: cash flow = 0 (ingen cash)', () => {
    bookEntry('2025-01-15', [
      { account: '1510', debit: 100_000 }, // Receivable
      { account: '3000', credit: 100_000 }, // Sales
    ], 'A')

    const r = getCashFlowStatement(db, fyId)
    if (!r.success) return
    expect(r.data.netResultOre).toBe(100_000)
    // operating = 100_000 + 0 - 100_000 (Δreceivables) - 0 = 0 ✓
    expect(r.data.operating.subtotal_ore).toBe(0)
  })

  it('lån inkommet: cash flow = financing', () => {
    bookEntry('2025-02-01', [
      { account: '1920', debit: 500_000 }, // Bank
      { account: '2350', credit: 500_000 }, // Long-term loan
    ], 'C')

    const r = getCashFlowStatement(db, fyId)
    if (!r.success) return
    expect(r.data.operating.subtotal_ore).toBe(0)
    expect(r.data.investing.subtotal_ore).toBe(0)
    expect(r.data.financing.subtotal_ore).toBe(500_000)
  })

  it('investering av anläggningstillgång: cash flow = investing', () => {
    bookEntry('2025-03-01', [
      { account: '1220', debit: 200_000 }, // Inventory
      { account: '1920', credit: 200_000 }, // Bank
    ], 'C')

    const r = getCashFlowStatement(db, fyId)
    if (!r.success) return
    // netResult = 0 (no income/expense — balance sheet only)
    // investing = -rawΔ(1000-1299) - depExp = -200_000 - 0 = -200_000
    expect(r.data.investing.subtotal_ore).toBe(-200_000)
    expect(r.data.netChangeOre).toBe(-200_000)
  })
})
