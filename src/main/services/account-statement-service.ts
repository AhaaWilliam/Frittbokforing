import type Database from 'better-sqlite3'

export interface AccountStatementLine {
  date: string
  verification_series: string
  verification_number: number
  description: string
  debit_ore: number
  credit_ore: number
  running_balance_ore: number
}

export interface AccountStatementSummary {
  opening_balance_ore: number
  total_debit_ore: number
  total_credit_ore: number
  closing_balance_ore: number
  transaction_count: number
}

export interface AccountStatement {
  account_number: string
  account_name: string
  lines: AccountStatementLine[]
  summary: AccountStatementSummary
}

/**
 * Get account statement: all booked journal entry lines for a specific account
 * within a fiscal year. IB (source_type='opening_balance', O-series) is included
 * as a regular row — do NOT fetch from opening_balances table (would double-count).
 *
 * Running balance accumulates from 0. O-series sorted first via CASE expression.
 * Named parameters to avoid the double-positional bug.
 */
export function getAccountStatement(
  db: Database.Database,
  input: {
    fiscal_year_id: number
    account_number: string
    date_from?: string | null
    date_to?: string | null
  },
): AccountStatement {
  // Get account name
  const account = db
    .prepare('SELECT name FROM accounts WHERE account_number = :acct')
    .get({ acct: input.account_number }) as { name: string } | undefined

  const accountName = account?.name ?? input.account_number

  // Query all booked lines for this account in the fiscal year
  const rows = db
    .prepare(
      `SELECT je.journal_date, je.verification_series,
              je.verification_number, je.description,
              jel.debit_ore, jel.credit_ore
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       WHERE jel.account_number = :acct
         AND je.fiscal_year_id = :fy
         AND je.status = 'booked'
         AND (:date_from IS NULL OR je.journal_date >= :date_from)
         AND (:date_to IS NULL OR je.journal_date <= :date_to)
       ORDER BY je.journal_date,
                CASE je.verification_series WHEN 'O' THEN 0 ELSE 1 END,
                je.verification_number`,
    )
    .all({
      acct: input.account_number,
      fy: input.fiscal_year_id,
      date_from: input.date_from ?? null,
      date_to: input.date_to ?? null,
    }) as {
    journal_date: string
    verification_series: string
    verification_number: number
    description: string
    debit_ore: number
    credit_ore: number
  }[]

  // Calculate running balance from 0
  let runningBalance = 0
  const lines: AccountStatementLine[] = rows.map((row) => {
    runningBalance += row.debit_ore - row.credit_ore
    return {
      date: row.journal_date,
      verification_series: row.verification_series,
      verification_number: row.verification_number,
      description: row.description,
      debit_ore: row.debit_ore,
      credit_ore: row.credit_ore,
      running_balance_ore: runningBalance,
    }
  })

  // Calculate summary from accumulated lines
  let totalDebit = 0
  let totalCredit = 0
  for (const line of lines) {
    totalDebit += line.debit_ore
    totalCredit += line.credit_ore
  }

  return {
    account_number: input.account_number,
    account_name: accountName,
    lines,
    summary: {
      opening_balance_ore: 0, // running_balance starts at 0; IB is a regular row
      total_debit_ore: totalDebit,
      total_credit_ore: totalCredit,
      closing_balance_ore: totalDebit - totalCredit,
      transaction_count: lines.length,
    },
  }
}
