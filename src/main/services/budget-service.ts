import type Database from 'better-sqlite3'
import { INCOME_STATEMENT_CONFIG, matchesRanges } from './report/k2-mapping'
import type {
  BudgetTarget,
  SaveBudgetTargetItem,
  BudgetLineMeta,
  BudgetVarianceLine,
  BudgetVarianceReport,
  BudgetVariancePeriod,
} from '../../shared/types'
import type { IpcResult } from '../../shared/types'

// ═══ Derived config ═══

const VALID_LINE_IDS = new Set(
  INCOME_STATEMENT_CONFIG.flatMap((g) => g.lines.map((l) => l.id)),
)

const LINE_META: BudgetLineMeta[] = INCOME_STATEMENT_CONFIG.flatMap((g) =>
  g.lines.map((l) => ({
    lineId: l.id,
    label: l.label,
    groupId: g.id,
    groupLabel: g.label,
    signMultiplier: l.signMultiplier,
  })),
)

// ═══ Public API ═══

export function getBudgetLines(): IpcResult<BudgetLineMeta[]> {
  return { success: true, data: LINE_META }
}

export function getBudgetTargets(
  db: Database.Database,
  fiscalYearId: number,
): IpcResult<BudgetTarget[]> {
  const rows = db
    .prepare(
      `SELECT id, fiscal_year_id, line_id, period_number, amount_ore, created_at, updated_at
       FROM budget_targets WHERE fiscal_year_id = ?
       ORDER BY line_id, period_number`,
    )
    .all(fiscalYearId) as BudgetTarget[]

  return { success: true, data: rows }
}

export function saveBudgetTargets(
  db: Database.Database,
  fiscalYearId: number,
  targets: SaveBudgetTargetItem[],
): IpcResult<{ count: number }> {
  for (const t of targets) {
    if (!VALID_LINE_IDS.has(t.line_id)) {
      return {
        success: false,
        error: `Ogiltigt line_id: ${t.line_id}`,
        code: 'VALIDATION_ERROR',
        field: 'line_id',
      }
    }
  }

  const stmt = db.prepare(
    `INSERT INTO budget_targets (fiscal_year_id, line_id, period_number, amount_ore, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT (fiscal_year_id, line_id, period_number)
     DO UPDATE SET amount_ore = excluded.amount_ore, updated_at = datetime('now')`,
  )

  db.transaction(() => {
    for (const t of targets) {
      stmt.run(fiscalYearId, t.line_id, t.period_number, t.amount_ore)
    }
  })()

  return { success: true, data: { count: targets.length } }
}

export function getBudgetVsActual(
  db: Database.Database,
  fiscalYearId: number,
): IpcResult<BudgetVarianceReport> {
  // 1. Fetch budget targets
  const budgetRows = db
    .prepare(
      `SELECT line_id, period_number, amount_ore
       FROM budget_targets WHERE fiscal_year_id = ?`,
    )
    .all(fiscalYearId) as Array<{
    line_id: string
    period_number: number
    amount_ore: number
  }>

  const budgetMap = new Map<string, Map<number, number>>()
  for (const r of budgetRows) {
    if (!budgetMap.has(r.line_id)) budgetMap.set(r.line_id, new Map())
    budgetMap.get(r.line_id)!.set(r.period_number, r.amount_ore)
  }

  // 2. Fetch actuals in one query, grouped by period + account
  const actualRows = db
    .prepare(
      `SELECT ap.period_number, jel.account_number,
              SUM(jel.credit_ore) - SUM(jel.debit_ore) AS net
       FROM journal_entry_lines jel
       JOIN journal_entries je ON jel.journal_entry_id = je.id
       JOIN accounting_periods ap ON je.fiscal_year_id = ap.fiscal_year_id
         AND je.journal_date >= ap.start_date AND je.journal_date <= ap.end_date
       WHERE je.fiscal_year_id = ? AND je.status = 'booked'
       GROUP BY ap.period_number, jel.account_number`,
    )
    .all(fiscalYearId) as Array<{
    period_number: number
    account_number: string
    net: number
  }>

  // 3. Map accounts to line IDs via matchesRanges, applying signMultiplier
  const actualMap = new Map<string, Map<number, number>>() // lineId → periodNumber → displayAmount

  for (const row of actualRows) {
    for (const group of INCOME_STATEMENT_CONFIG) {
      for (const line of group.lines) {
        if (matchesRanges(row.account_number, line.ranges)) {
          if (!actualMap.has(line.id)) actualMap.set(line.id, new Map())
          const periodMap = actualMap.get(line.id)!
          const prev = periodMap.get(row.period_number) ?? 0
          periodMap.set(row.period_number, prev + row.net * line.signMultiplier)
          break // account matches at most one line
        }
      }
    }
  }

  // 4. Build variance report
  const lines: BudgetVarianceLine[] = LINE_META.map((meta) => {
    const budgetPeriods = budgetMap.get(meta.lineId)
    const actualPeriods = actualMap.get(meta.lineId)

    const periods: BudgetVariancePeriod[] = []
    let totalBudgetOre = 0
    let totalActualOre = 0

    for (let p = 1; p <= 12; p++) {
      const budgetOre = budgetPeriods?.get(p) ?? 0
      const actualOre = actualPeriods?.get(p) ?? 0
      const varianceOre = actualOre - budgetOre

      totalBudgetOre += budgetOre
      totalActualOre += actualOre

      periods.push({
        periodNumber: p,
        budgetOre,
        actualOre,
        varianceOre,
        variancePercent:
          budgetOre !== 0
            ? Math.round((varianceOre / Math.abs(budgetOre)) * 10000) / 100
            : null,
      })
    }

    const totalVarianceOre = totalActualOre - totalBudgetOre

    return {
      ...meta,
      periods,
      totalBudgetOre,
      totalActualOre,
      totalVarianceOre,
      totalVariancePercent:
        totalBudgetOre !== 0
          ? Math.round((totalVarianceOre / Math.abs(totalBudgetOre)) * 10000) /
            100
          : null,
    }
  })

  return { success: true, data: { lines } }
}

export function copyBudgetFromPreviousFy(
  db: Database.Database,
  targetFyId: number,
  sourceFyId: number,
): IpcResult<{ count: number }> {
  const sourceCount = (
    db
      .prepare(
        'SELECT COUNT(*) AS cnt FROM budget_targets WHERE fiscal_year_id = ?',
      )
      .get(sourceFyId) as { cnt: number }
  ).cnt

  if (sourceCount === 0) {
    return {
      success: false,
      error: 'Inga budgetvärden hittades för källåret',
      code: 'NOT_FOUND',
    }
  }

  const result = db
    .prepare(
      `INSERT OR REPLACE INTO budget_targets (fiscal_year_id, line_id, period_number, amount_ore, updated_at)
       SELECT ?, line_id, period_number, amount_ore, datetime('now')
       FROM budget_targets WHERE fiscal_year_id = ?`,
    )
    .run(targetFyId, sourceFyId)

  return { success: true, data: { count: result.changes } }
}
