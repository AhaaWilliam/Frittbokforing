import type Database from 'better-sqlite3'
import {
  INCOME_STATEMENT_CONFIG,
  matchesRanges,
  validateResultConfigInvariants,
} from './report/k2-mapping'
import type { AccountRange } from './report/k2-mapping'
import { getAccountBalances, buildGroups } from './report/balance-queries'

// ═══ Validate config at module load — fail fast if broken ═══

validateResultConfigInvariants(INCOME_STATEMENT_CONFIG)

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

  const operatingIncome =
    groups.find((g) => g.id === 'operating_income')?.subtotalNet ?? 0
  const operatingExpenses =
    groups.find((g) => g.id === 'operating_expenses')?.subtotalNet ?? 0
  const operatingResultOre = operatingIncome + operatingExpenses

  const financialNet =
    groups.find((g) => g.id === 'financial_items')?.subtotalNet ?? 0
  const resultAfterFinancialOre = operatingResultOre + financialNet

  const appropriationsNet =
    groups.find((g) => g.id === 'appropriations_and_tax')?.subtotalNet ?? 0
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

  const operatingIncomeGroup = groups.find((g) => g.id === 'operating_income')
  const operatingExpensesGroup = groups.find(
    (g) => g.id === 'operating_expenses',
  )

  const operatingIncome = operatingIncomeGroup?.subtotalNet ?? 0
  const operatingExpenses = operatingExpensesGroup?.subtotalNet ?? 0
  const operatingResultOre = operatingIncome + operatingExpenses

  const financialNet =
    groups.find((g) => g.id === 'financial_items')?.subtotalNet ?? 0
  const resultAfterFinancialOre = operatingResultOre + financialNet

  const appropriationsNet =
    groups.find((g) => g.id === 'appropriations_and_tax')?.subtotalNet ?? 0
  const netResultOre = resultAfterFinancialOre + appropriationsNet

  // subtotalDisplay: for +1 signMultiplier groups, equals subtotalNet
  // For operating_expenses (signMultiplier -1), subtotalDisplay is positive for costs
  const revenueOre = operatingIncomeGroup?.subtotalDisplay ?? 0
  const expensesOre = operatingExpensesGroup?.subtotalDisplay ?? 0

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
