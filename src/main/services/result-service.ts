import type Database from 'better-sqlite3'
import {
  INCOME_STATEMENT_CONFIG,
  matchesRanges,
  validateResultConfigInvariants,
} from './report/k2-mapping'
import type { AccountRange } from './report/k2-mapping'
import { getAccountBalances, buildGroups } from './report/balance-queries'
import type { ReportGroupResult } from '../../shared/types'

// ═══ Validate config at module load — fail fast if broken ═══

validateResultConfigInvariants(INCOME_STATEMENT_CONFIG)

// ═══ Internal helpers ═══

// Strict group lookup — INCOME_STATEMENT_CONFIG invariant guarantees presence.
// Throwing instead of optional-chaining gives mutation testing a real signal:
// a missing group is a corrupted invariant, not a silent zero.
export function _requireGroupForTesting(
  groups: ReportGroupResult[],
  id: string,
): ReportGroupResult {
  return requireGroup(groups, id)
}

function requireGroup(
  groups: ReportGroupResult[],
  id: string,
): ReportGroupResult {
  const group = groups.find((g) => g.id === id)
  if (!group) {
    throw new Error(
      `Result-service invariant broken: group '${id}' missing from INCOME_STATEMENT_CONFIG`,
    )
  }
  return group
}

// ═══ Types ═══

export interface ResultSummary {
  operatingResultOre: number // EBIT: operating_income + operating_expenses
  resultAfterFinancialOre: number // EBT: + financial_items
  netResultOre: number // Årets resultat: hela klass 3–8
}

export interface ResultBreakdown extends ResultSummary {
  revenueOre: number // operating_income.subtotalDisplay (positiv vid intäkter)
  expensesOre: number // operating_expenses.subtotalDisplay (positiv vid kostnader)
}

// ═══ Balance sheet account ranges (klass 1–2) ═══

const BS_ACCOUNT_RANGES: AccountRange[] = [{ from: '1000', to: '2999' }]

// ═══ Public API ═══

export function calculateResultSummary(
  db: Database.Database,
  fiscalYearId: number,
  dateRange?: { from: string; to: string },
): ResultSummary {
  const balances = getAccountBalances(db, fiscalYearId, dateRange)
  const groups = buildGroups(INCOME_STATEMENT_CONFIG, balances)

  const operatingIncome = requireGroup(groups, 'operating_income').subtotalNet
  const operatingExpenses = requireGroup(
    groups,
    'operating_expenses',
  ).subtotalNet
  const operatingResultOre = operatingIncome + operatingExpenses

  const financialNet = requireGroup(groups, 'financial_items').subtotalNet
  const resultAfterFinancialOre = operatingResultOre + financialNet

  const appropriationsNet = requireGroup(
    groups,
    'appropriations_and_tax',
  ).subtotalNet
  const netResultOre = resultAfterFinancialOre + appropriationsNet

  return { operatingResultOre, resultAfterFinancialOre, netResultOre }
}

export function calculateResultBreakdown(
  db: Database.Database,
  fiscalYearId: number,
  dateRange?: { from: string; to: string },
): ResultBreakdown {
  const balances = getAccountBalances(db, fiscalYearId, dateRange)
  const groups = buildGroups(INCOME_STATEMENT_CONFIG, balances)

  const operatingIncomeGroup = requireGroup(groups, 'operating_income')
  const operatingExpensesGroup = requireGroup(groups, 'operating_expenses')

  const operatingIncome = operatingIncomeGroup.subtotalNet
  const operatingExpenses = operatingExpensesGroup.subtotalNet
  const operatingResultOre = operatingIncome + operatingExpenses

  const financialNet = requireGroup(groups, 'financial_items').subtotalNet
  const resultAfterFinancialOre = operatingResultOre + financialNet

  const appropriationsNet = requireGroup(
    groups,
    'appropriations_and_tax',
  ).subtotalNet
  const netResultOre = resultAfterFinancialOre + appropriationsNet

  // subtotalDisplay: for +1 signMultiplier groups, equals subtotalNet
  // For operating_expenses (signMultiplier -1), subtotalDisplay is positive for costs
  const revenueOre = operatingIncomeGroup.subtotalDisplay
  const expensesOre = operatingExpensesGroup.subtotalDisplay

  return {
    operatingResultOre,
    resultAfterFinancialOre,
    netResultOre,
    revenueOre,
    expensesOre,
  }
}

export function calculateOperatingResult(
  db: Database.Database,
  fiscalYearId: number,
  dateRange?: { from: string; to: string },
): number {
  return calculateResultSummary(db, fiscalYearId, dateRange).operatingResultOre
}

export function calculateNetResult(
  db: Database.Database,
  fiscalYearId: number,
  dateRange?: { from: string; to: string },
): number {
  return calculateResultSummary(db, fiscalYearId, dateRange).netResultOre
}

export function getBalanceSheetAccountBalances(
  db: Database.Database,
  fiscalYearId: number,
): { account_number: string; balance: number }[] {
  const balances = getAccountBalances(db, fiscalYearId)
  const result: { account_number: string; balance: number }[] = []

  for (const b of balances) {
    if (matchesRanges(b.account_number, BS_ACCOUNT_RANGES)) {
      // debit - credit convention (same as opening-balance-service)
      const balance = b.total_debit - b.total_credit
      result.push({ account_number: b.account_number, balance })
    }
  }

  return result
}
