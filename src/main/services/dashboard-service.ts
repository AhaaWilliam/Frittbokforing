import type Database from 'better-sqlite3'
import type { DashboardSummary, LatestVerification } from '../../shared/types'
import { calculateResultBreakdown } from './result-service'
import {
  VAT_OUTGOING_ACCOUNTS,
  VAT_IN_ACCOUNT,
} from '../../shared/vat-accounts'
import { BANK_ACCOUNTS } from '../../shared/bank-accounts'

const VAT_OUT_PLACEHOLDERS = VAT_OUTGOING_ACCOUNTS.map(() => '?').join(', ')
const BANK_PLACEHOLDERS = BANK_ACCOUNTS.map(() => '?').join(', ')

export function getDashboardSummary(
  db: Database.Database,
  fiscalYearId: number,
): DashboardSummary {
  const run = db.transaction((): DashboardSummary => {
    const breakdown = calculateResultBreakdown(db, fiscalYearId)

    const vatRow = db
      .prepare(
        `
      SELECT
        COALESCE(SUM(CASE
          WHEN jel.account_number IN (${VAT_OUT_PLACEHOLDERS})
          THEN jel.credit_ore
          ELSE 0
        END), 0) AS vat_outgoing,

        COALESCE(SUM(CASE
          WHEN jel.account_number = ?
          THEN jel.debit_ore
          ELSE 0
        END), 0) AS vat_incoming

      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
      WHERE je.fiscal_year_id = ?
        AND je.status = 'booked'
    `,
      )
      .get(...VAT_OUTGOING_ACCOUNTS, VAT_IN_ACCOUNT, fiscalYearId) as {
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

    // Bank balance — sum av (debit - credit) för bank-/kassa-konton i bokade
    // verifikat. Inkluderar IB (source_type='opening_balance' som också är
    // booked) så detta är ett YTD running balance, inte en period-rörelse.
    const bankRow = db
      .prepare(
        `
      SELECT COALESCE(
        SUM(jel.debit_ore - jel.credit_ore),
        0
      ) AS bank_balance
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
      WHERE je.fiscal_year_id = ?
        AND je.status = 'booked'
        AND jel.account_number IN (${BANK_PLACEHOLDERS})
    `,
      )
      .get(fiscalYearId, ...BANK_ACCOUNTS) as { bank_balance: number }

    return {
      revenueOre: breakdown.revenueOre,
      expensesOre: breakdown.expensesOre,
      operatingResultOre: breakdown.operatingResultOre,
      vatOutgoingOre: vatRow.vat_outgoing,
      vatIncomingOre: vatRow.vat_incoming,
      vatNetOre: vatRow.vat_outgoing - vatRow.vat_incoming,
      unpaidReceivablesOre: receivablesRow.unpaid_receivables,
      unpaidPayablesOre: payablesRow.unpaid_payables,
      bankBalanceOre: bankRow.bank_balance,
    }
  })

  return run()
}

/**
 * VS-42: Senast bokförda verifikatet i ett räkenskapsår, oavsett serie.
 * Sorterar primärt på entry_date desc, sekundärt på id desc (tie-break
 * vid samma datum). Returnerar null om inga bokade verifikat finns.
 */
export function getLatestVerification(
  db: Database.Database,
  fiscalYearId: number,
): LatestVerification | null {
  const row = db
    .prepare(
      `
      SELECT verification_series, verification_number, entry_date
      FROM journal_entries
      WHERE fiscal_year_id = ?
        AND status = 'booked'
        AND verification_number IS NOT NULL
      ORDER BY entry_date DESC, id DESC
      LIMIT 1
    `,
    )
    .get(fiscalYearId) as
    | {
        verification_series: string
        verification_number: number
        entry_date: string
      }
    | undefined

  if (!row) return null
  return {
    series: row.verification_series,
    number: row.verification_number,
    entry_date: row.entry_date,
  }
}
