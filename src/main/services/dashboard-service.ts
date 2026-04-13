import type Database from 'better-sqlite3'
import type { DashboardSummary } from '../../shared/types'
import { calculateResultBreakdown } from './result-service'

export function getDashboardSummary(
  db: Database.Database,
  fiscalYearId: number,
): DashboardSummary {
  const run = db.transaction((): DashboardSummary => {
    const breakdown = calculateResultBreakdown(db, fiscalYearId)

    // VAT: still uses direct SQL (VAT accounts are not part of income statement config)
    const vatRow = db
      .prepare(
        `
      SELECT
        COALESCE(SUM(CASE
          WHEN jel.account_number IN ('2610', '2620', '2630')
          THEN jel.credit_ore
          ELSE 0
        END), 0) AS vat_outgoing,

        COALESCE(SUM(CASE
          WHEN jel.account_number = '2640'
          THEN jel.debit_ore
          ELSE 0
        END), 0) AS vat_incoming

      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
      WHERE je.fiscal_year_id = ?
        AND je.status = 'booked'
    `,
      )
      .get(fiscalYearId) as {
      vat_outgoing: number
      vat_incoming: number
    }

    // Unpaid receivables (invoices) — reads paid_amount column directly (M101)
    const receivablesRow = db
      .prepare(
        `
      SELECT COALESCE(
        SUM(i.total_amount_ore - i.paid_amount_ore),
        0
      ) AS unpaid_receivables
      FROM invoices i
      WHERE i.fiscal_year_id = ?
        AND i.status IN ('unpaid', 'overdue', 'partial')
    `,
      )
      .get(fiscalYearId) as { unpaid_receivables: number }

    // Unpaid payables (expenses) — reads paid_amount column directly (M101)
    const payablesRow = db
      .prepare(
        `
      SELECT COALESCE(
        SUM(e.total_amount_ore - e.paid_amount_ore),
        0
      ) AS unpaid_payables
      FROM expenses e
      WHERE e.fiscal_year_id = ?
        AND e.status IN ('unpaid', 'overdue', 'partial')
    `,
      )
      .get(fiscalYearId) as { unpaid_payables: number }

    return {
      revenueOre: breakdown.revenueOre,
      expensesOre: breakdown.expensesOre,
      operatingResultOre: breakdown.operatingResultOre,
      vatOutgoingOre: vatRow.vat_outgoing,
      vatIncomingOre: vatRow.vat_incoming,
      vatNetOre: vatRow.vat_outgoing - vatRow.vat_incoming,
      unpaidReceivablesOre: receivablesRow.unpaid_receivables,
      unpaidPayablesOre: payablesRow.unpaid_payables,
    }
  })

  return run()
}
