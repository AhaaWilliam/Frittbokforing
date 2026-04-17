import type Database from 'better-sqlite3'
import {
  INCOME_STATEMENT_CONFIG,
  BALANCE_SHEET_ASSETS_CONFIG,
  BALANCE_SHEET_EQUITY_CONFIG,
} from './k2-mapping'
import { getAccountBalances, buildGroups } from './balance-queries'
import { calculateResultSummary } from '../result-service'
import {
  getFiscalYear,
  getPreviousFiscalYearId,
  getOpeningBalancesFromPreviousYear,
  getBalanceAtDate,
} from '../export/export-data-queries'
import { compareAccountNumbers } from '../../../shared/account-number'
import type {
  AccountBalance,
  IncomeStatementResult,
  BalanceSheetResult,
} from '../../../shared/types'

// ═══ getIncomeStatement ═══

export function getIncomeStatement(
  db: Database.Database,
  fiscalYearId: number,
  dateRange?: { from: string; to: string },
): IncomeStatementResult {
  const fy = getFiscalYear(db, fiscalYearId)
  const balances = getAccountBalances(db, fiscalYearId, dateRange)

  const groups = buildGroups(INCOME_STATEMENT_CONFIG, balances)
  const summary = calculateResultSummary(db, fiscalYearId, dateRange)

  return {
    fiscalYear: { startDate: fy.start_date, endDate: fy.end_date },
    dateRange,
    groups,
    operatingResult: summary.operatingResultOre,
    resultAfterFinancial: summary.resultAfterFinancialOre,
    netResult: summary.netResultOre,
  }
}

// ═══ getBalanceSheet ═══

export function getBalanceSheet(
  db: Database.Database,
  fiscalYearId: number,
  dateRange?: { from: string; to: string },
): BalanceSheetResult {
  const fy = getFiscalYear(db, fiscalYearId)

  // 1. Get movements for the period
  const movements = getAccountBalances(db, fiscalYearId, dateRange)

  // 2. Opening balances for class 1-2
  let openingBalances: Map<string, number>

  if (!dateRange) {
    // Full year: IB = previous year closing
    const prevFyId = getPreviousFiscalYearId(db, fiscalYearId)
    openingBalances = prevFyId
      ? getOpeningBalancesFromPreviousYear(db, prevFyId)
      : new Map()
  } else {
    // Date range: IB = closing before range start
    // getBalanceAtDate returns debit-credit for all accounts before a date
    const balBefore = getBalanceAtDate(db, fiscalYearId, dateRange.from)
    // Also need previous year closing for class 1-2
    const prevFyId = getPreviousFiscalYearId(db, fiscalYearId)
    const prevClosing = prevFyId
      ? getOpeningBalancesFromPreviousYear(db, prevFyId)
      : new Map<string, number>()

    openingBalances = new Map<string, number>()
    // Combine: prev closing + movements before dateRange.from
    const allAccounts = new Set([...prevClosing.keys(), ...balBefore.keys()])
    for (const acc of allAccounts) {
      if (acc.startsWith('1') || acc.startsWith('2')) {
        const prev = prevClosing.get(acc) ?? 0
        const before = balBefore.get(acc) ?? 0
        // getBalanceAtDate returns debit-credit; prevClosing also debit-credit
        openingBalances.set(acc, prev + before)
      }
    }
  }

  // 3. Build combined balances for class 1-2 (IB + movements)
  // openingBalances is debit-credit convention; movements.net is credit-debit
  // Convert IB to credit-debit: negate
  const bsBalances: AccountBalance[] = []
  const accountsSeen = new Set<string>()

  for (const m of movements) {
    if (m.account_number.startsWith('1') || m.account_number.startsWith('2')) {
      const ibDebitMinusCredit = openingBalances.get(m.account_number) ?? 0
      const ibNet = -ibDebitMinusCredit // convert to credit-debit
      bsBalances.push({
        account_number: m.account_number,
        account_name: m.account_name,
        total_debit: m.total_debit,
        total_credit: m.total_credit,
        net: ibNet + m.net,
      })
      accountsSeen.add(m.account_number)
    }
  }

  // Add accounts with IB but no movements
  for (const [acc, ibDebitMinusCredit] of openingBalances) {
    if (!accountsSeen.has(acc)) {
      const ibNet = -ibDebitMinusCredit
      // Look up account name
      const row = db
        .prepare('SELECT name FROM accounts WHERE account_number = ?')
        .get(acc) as { name: string } | undefined
      bsBalances.push({
        account_number: acc,
        account_name: row?.name ?? acc,
        total_debit: 0,
        total_credit: 0,
        net: ibNet,
      })
    }
  }

  bsBalances.sort((a, b) =>
    compareAccountNumbers(a.account_number, b.account_number),
  )

  // 4. Build asset groups
  const assetGroups = buildGroups(BALANCE_SHEET_ASSETS_CONFIG, bsBalances)
  const totalAssets = assetGroups.reduce((s, g) => s + g.subtotalDisplay, 0)

  // 5. Build equity + liabilities groups
  const equityGroups = buildGroups(BALANCE_SHEET_EQUITY_CONFIG, bsBalances)

  // 6. Calculate net result from class 3-8 (M134: single source of truth)
  const resultSummary = calculateResultSummary(db, fiscalYearId, dateRange)
  const calculatedNetResult = resultSummary.netResultOre

  const equitySubtotal = equityGroups.reduce((s, g) => s + g.subtotalDisplay, 0)
  const totalEquityAndLiabilities = equitySubtotal + calculatedNetResult
  const balanceDifference = totalAssets - totalEquityAndLiabilities

  return {
    fiscalYear: { startDate: fy.start_date, endDate: fy.end_date },
    dateRange,
    assets: { groups: assetGroups, total: totalAssets },
    equityAndLiabilities: {
      groups: equityGroups,
      calculatedNetResult,
      total: totalEquityAndLiabilities,
    },
    balanceDifference,
  }
}
