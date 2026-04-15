import type Database from 'better-sqlite3'
import { matchesRanges } from './k2-mapping'
import type { ReportGroup } from './k2-mapping'
import type {
  AccountBalance,
  ReportGroupResult,
  ReportLineResult,
} from '../../../shared/types'

// ═══ Shared query helpers (extracted from report-service.ts) ═══
// Used by both report-service and result-service to avoid circular deps.

export function getAccountBalances(
  db: Database.Database,
  fiscalYearId: number,
  dateRange?: { from: string; to: string },
): AccountBalance[] {
  const conditions = ['je.fiscal_year_id = ?', "je.status = 'booked'"]
  const params: (string | number)[] = [fiscalYearId]

  if (dateRange?.from) {
    conditions.push('je.journal_date >= ?')
    params.push(dateRange.from)
  }
  if (dateRange?.to) {
    conditions.push('je.journal_date <= ?')
    params.push(dateRange.to)
  }

  return db
    .prepare(
      `SELECT
        jel.account_number,
        a.name AS account_name,
        SUM(jel.debit_ore) AS total_debit,
        SUM(jel.credit_ore) AS total_credit,
        SUM(jel.credit_ore) - SUM(jel.debit_ore) AS net
      FROM journal_entry_lines jel
      JOIN journal_entries je ON jel.journal_entry_id = je.id
      LEFT JOIN accounts a ON jel.account_number = a.account_number
      WHERE ${conditions.join(' AND ')}
      GROUP BY jel.account_number
      ORDER BY CAST(jel.account_number AS INTEGER)`,
    )
    .all(...params) as AccountBalance[]
}

export function buildGroups(
  config: ReportGroup[],
  balances: AccountBalance[],
): ReportGroupResult[] {
  return config.map((group) => {
    const lines: ReportLineResult[] = group.lines.map((line) => {
      const matching = balances.filter((b) =>
        matchesRanges(b.account_number, line.ranges),
      )
      const netAmount = matching.reduce((sum, b) => sum + b.net, 0)
      const displayAmount = netAmount * line.signMultiplier

      return {
        id: line.id,
        label: line.label,
        netAmount,
        displayAmount,
        accounts: matching.map((b) => ({
          accountNumber: b.account_number,
          accountName: b.account_name || b.account_number,
          netAmount: b.net,
          displayAmount: b.net * line.signMultiplier,
        })),
      }
    })

    const subtotalNet = lines.reduce((s, l) => s + l.netAmount, 0)
    const subtotalDisplay = lines.reduce((s, l) => s + l.displayAmount, 0)

    return {
      id: group.id,
      label: group.label,
      lines,
      subtotalNet,
      subtotalDisplay,
    }
  })
}
