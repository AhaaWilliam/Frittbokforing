import type Database from 'better-sqlite3'

// ═══ Types ═══

export interface CompanyInfo {
  org_number: string
  name: string
}

export interface FiscalYearInfo {
  id: number
  start_date: string
  end_date: string
}

export interface PeriodInfo {
  period_number: number
  start_date: string
  end_date: string
}

export interface AccountInfo {
  account_number: string
  name: string
}

export interface MonthlyTotal {
  account_number: string
  month: string // YYYY-MM
  total_debit: number
  total_credit: number
}

export interface JournalEntryInfo {
  id: number
  verification_series: string
  verification_number: number
  journal_date: string
  description: string
  created_at: string
  created_by_id: number | null
}

export interface JournalLineInfo {
  account_number: string
  debit_ore: number
  credit_ore: number
  description: string | null
}

export interface CounterpartyInfo {
  id: number
  type: string
  name: string
  org_number: string | null
}

export interface InvoiceInfo {
  id: number
  invoice_number: string
  invoice_date: string
  due_date: string | null
  counterparty_id: number
  status: string
  total_amount_ore: number
}

export interface ExpenseInfo {
  id: number
  supplier_invoice_number: string | null
  expense_date: string
  due_date: string | null
  counterparty_id: number
  status: string
  total_amount_ore: number
}

export interface PaymentInfo {
  parent_id: number // invoice_id or expense_id
  amount_ore: number
  payment_date: string
}

// ═══ Date Range (D2) ═══

export interface ExportDateRange {
  startDate?: string // YYYY-MM-DD, inclusive
  endDate?: string // YYYY-MM-DD, inclusive
}

// ═══ Queries ═══

export function getCompanyInfo(
  db: Database.Database,
  fiscalYearId: number,
): CompanyInfo {
  const row = db
    .prepare(
      `SELECT c.org_number, c.name
         FROM companies c
         JOIN fiscal_years fy ON fy.company_id = c.id
        WHERE fy.id = ?`,
    )
    .get(fiscalYearId) as CompanyInfo | undefined
  if (!row)
    throw { code: 'NOT_FOUND' as const, error: 'Inget företag hittades' }
  return {
    org_number: row.org_number || '000000-0000',
    name: row.name,
  }
}

export function getFiscalYear(
  db: Database.Database,
  fiscalYearId: number,
): FiscalYearInfo {
  const row = db
    .prepare('SELECT id, start_date, end_date FROM fiscal_years WHERE id = ?')
    .get(fiscalYearId) as FiscalYearInfo | undefined
  if (!row)
    throw {
      code: 'NOT_FOUND' as const,
      error: `Räkenskapsår ${fiscalYearId} hittades inte`,
    }
  return row
}

export function getPreviousFiscalYearId(
  db: Database.Database,
  fiscalYearId: number,
): number | null {
  const row = db
    .prepare(
      `SELECT id FROM fiscal_years
     WHERE end_date < (SELECT start_date FROM fiscal_years WHERE id = ?)
     ORDER BY end_date DESC LIMIT 1`,
    )
    .get(fiscalYearId) as { id: number } | undefined
  return row?.id ?? null
}

export function getPeriods(
  db: Database.Database,
  fiscalYearId: number,
): PeriodInfo[] {
  return db
    .prepare(
      `SELECT period_number, start_date, end_date
     FROM accounting_periods
     WHERE fiscal_year_id = ?
     ORDER BY start_date`,
    )
    .all(fiscalYearId) as PeriodInfo[]
}

export function getUsedAccounts(
  db: Database.Database,
  fiscalYearId: number,
): AccountInfo[] {
  // F25: only accounts with booked entries in this FY or IB from previous FY
  // (not all active accounts — that bloats exports for unused chart entries)
  const prevFyId = getPreviousFiscalYearId(db, fiscalYearId)
  return db
    .prepare(
      `SELECT DISTINCT a.account_number, a.name
     FROM accounts a
     WHERE a.account_number IN (
       SELECT DISTINCT jel.account_number
       FROM journal_entry_lines jel
       JOIN journal_entries je ON jel.journal_entry_id = je.id
       WHERE je.fiscal_year_id = ? AND je.status = 'booked'
     )
     OR (? IS NOT NULL AND a.account_number IN (
       SELECT DISTINCT jel2.account_number
       FROM journal_entry_lines jel2
       JOIN journal_entries je2 ON jel2.journal_entry_id = je2.id
       WHERE je2.fiscal_year_id = ? AND je2.status = 'booked'
     ))
     ORDER BY CAST(a.account_number AS INTEGER)`,
    )
    .all(fiscalYearId, prevFyId, prevFyId) as AccountInfo[]
}

export function getOpeningBalancesFromPreviousYear(
  db: Database.Database,
  previousFyId: number,
): Map<string, number> {
  // M98: numerisk jämförelse — LIKE '1%' bryter för 5-siffriga underkonton
  const rows = db
    .prepare(
      `SELECT
      jel.account_number,
      SUM(jel.debit_ore) - SUM(jel.credit_ore) as closing_balance_ore
     FROM journal_entry_lines jel
     JOIN journal_entries je ON jel.journal_entry_id = je.id
     WHERE je.fiscal_year_id = ?
       AND je.status = 'booked'
       AND CAST(SUBSTR(jel.account_number || '0000', 1, 4) AS INTEGER) BETWEEN 1000 AND 2999
     GROUP BY jel.account_number`,
    )
    .all(previousFyId) as {
    account_number: string
    closing_balance_ore: number
  }[]

  const map = new Map<string, number>()
  for (const row of rows) {
    map.set(row.account_number, row.closing_balance_ore)
  }
  return map
}

export function getMonthlyTotals(
  db: Database.Database,
  fiscalYearId: number,
  dateRange?: ExportDateRange,
): MonthlyTotal[] {
  const conditions = ['je.fiscal_year_id = ?', "je.status = 'booked'"]
  const params: (string | number)[] = [fiscalYearId]

  if (dateRange?.startDate) {
    conditions.push('je.journal_date >= ?')
    params.push(dateRange.startDate)
  }
  if (dateRange?.endDate) {
    conditions.push('je.journal_date <= ?')
    params.push(dateRange.endDate)
  }

  return db
    .prepare(
      `SELECT
      jel.account_number,
      strftime('%Y-%m', je.journal_date) as month,
      SUM(jel.debit_ore) as total_debit,
      SUM(jel.credit_ore) as total_credit
     FROM journal_entry_lines jel
     JOIN journal_entries je ON jel.journal_entry_id = je.id
     WHERE ${conditions.join(' AND ')}
     GROUP BY jel.account_number, strftime('%Y-%m', je.journal_date)
     ORDER BY CAST(jel.account_number AS INTEGER), month`,
    )
    .all(...params) as MonthlyTotal[]
}

export function getBookedJournalEntries(
  db: Database.Database,
  fiscalYearId: number,
  dateRange?: ExportDateRange,
): JournalEntryInfo[] {
  const conditions = ['fiscal_year_id = ?', "status = 'booked'"]
  const params: (string | number)[] = [fiscalYearId]

  if (dateRange?.startDate) {
    conditions.push('journal_date >= ?')
    params.push(dateRange.startDate)
  }
  if (dateRange?.endDate) {
    conditions.push('journal_date <= ?')
    params.push(dateRange.endDate)
  }

  return db
    .prepare(
      `SELECT id, verification_series, verification_number,
            journal_date, description, created_at, created_by_id
     FROM journal_entries
     WHERE ${conditions.join(' AND ')}
     ORDER BY verification_series, verification_number`,
    )
    .all(...params) as JournalEntryInfo[]
}

/**
 * Get cumulative balance per account for all booked transactions
 * BEFORE the given date within the fiscal year.
 * Includes BOTH BS (1-2) and PL (3-8) accounts.
 */
export function getBalanceAtDate(
  db: Database.Database,
  fiscalYearId: number,
  beforeDate: string,
): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT
      jel.account_number,
      SUM(jel.debit_ore) - SUM(jel.credit_ore) as balance_ore
     FROM journal_entry_lines jel
     JOIN journal_entries je ON jel.journal_entry_id = je.id
     WHERE je.fiscal_year_id = ?
       AND je.status = 'booked'
       AND je.journal_date < ?
     GROUP BY jel.account_number`,
    )
    .all(fiscalYearId, beforeDate) as {
    account_number: string
    balance_ore: number
  }[]

  const map = new Map<string, number>()
  for (const row of rows) {
    map.set(row.account_number, row.balance_ore)
  }
  return map
}

export function getJournalEntryLines(
  db: Database.Database,
  journalEntryId: number,
): JournalLineInfo[] {
  return db
    .prepare(
      `SELECT account_number, debit_ore, credit_ore, description
     FROM journal_entry_lines
     WHERE journal_entry_id = ?`,
    )
    .all(journalEntryId) as JournalLineInfo[]
}

/**
 * Batchad variant av getJournalEntryLines. Returnerar alla rader för alla
 * booked entries i en fiscal year (med optional dateRange), grupperade per
 * journal_entry_id. Eliminerar N+1 i exporttjänsterna.
 *
 * Filter speglar getBookedJournalEntries exakt (fiscalYearId + dateRange +
 * status='booked') för att garantera att lines och entries alltid är i synk.
 *
 * ORDER BY journal_entry_id, line_number säkerställer determinism.
 */
export function getAllJournalEntryLines(
  db: Database.Database,
  fiscalYearId: number,
  dateRange?: ExportDateRange,
): Map<number, JournalLineInfo[]> {
  const conditions = ['je.fiscal_year_id = ?', "je.status = 'booked'"]
  const params: (string | number)[] = [fiscalYearId]

  if (dateRange?.startDate) {
    conditions.push('je.journal_date >= ?')
    params.push(dateRange.startDate)
  }
  if (dateRange?.endDate) {
    conditions.push('je.journal_date <= ?')
    params.push(dateRange.endDate)
  }

  const rows = db
    .prepare(
      `SELECT
        jel.journal_entry_id,
        jel.account_number,
        jel.debit_ore,
        jel.credit_ore,
        jel.description
       FROM journal_entry_lines jel
       JOIN journal_entries je ON jel.journal_entry_id = je.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY jel.journal_entry_id, jel.line_number`,
    )
    .all(...params) as {
    journal_entry_id: number
    account_number: string
    debit_ore: number
    credit_ore: number
    description: string | null
  }[]

  const map = new Map<number, JournalLineInfo[]>()
  for (const row of rows) {
    const existing = map.get(row.journal_entry_id)
    const line: JournalLineInfo = {
      account_number: row.account_number,
      debit_ore: row.debit_ore,
      credit_ore: row.credit_ore,
      description: row.description,
    }
    if (existing) {
      existing.push(line)
    } else {
      map.set(row.journal_entry_id, [line])
    }
  }
  return map
}

export function getCustomers(db: Database.Database): CounterpartyInfo[] {
  return db
    .prepare(
      `SELECT id, type, name, org_number FROM counterparties
     WHERE type IN ('customer', 'both') AND is_active = 1`,
    )
    .all() as CounterpartyInfo[]
}

export function getSuppliers(db: Database.Database): CounterpartyInfo[] {
  return db
    .prepare(
      `SELECT id, type, name, org_number FROM counterparties
     WHERE type IN ('supplier', 'both') AND is_active = 1`,
    )
    .all() as CounterpartyInfo[]
}

export function getBookedInvoices(
  db: Database.Database,
  fiscalYearId: number,
): InvoiceInfo[] {
  return db
    .prepare(
      `SELECT i.id, i.invoice_number, i.invoice_date, i.due_date,
            i.counterparty_id, i.status, i.total_amount_ore
     FROM invoices i
     WHERE i.journal_entry_id IN (
       SELECT je.id FROM journal_entries je
       WHERE je.fiscal_year_id = ? AND je.status = 'booked'
     )
     AND i.status NOT IN ('draft')`,
    )
    .all(fiscalYearId) as InvoiceInfo[]
}

export function getInvoicePayments(
  db: Database.Database,
  invoiceIds: number[],
): PaymentInfo[] {
  if (invoiceIds.length === 0) return []
  const placeholders = invoiceIds.map(() => '?').join(',')
  return db
    .prepare(
      `SELECT invoice_id as parent_id, amount_ore, payment_date
     FROM invoice_payments
     WHERE invoice_id IN (${placeholders})
     ORDER BY invoice_id, payment_date`,
    )
    .all(...invoiceIds) as PaymentInfo[]
}

export function getBookedExpenses(
  db: Database.Database,
  fiscalYearId: number,
): ExpenseInfo[] {
  return db
    .prepare(
      `SELECT e.id, e.supplier_invoice_number, e.expense_date, e.due_date,
            e.counterparty_id, e.status, e.total_amount_ore
     FROM expenses e
     WHERE e.journal_entry_id IN (
       SELECT je.id FROM journal_entries je
       WHERE je.fiscal_year_id = ? AND je.status = 'booked'
     )
     AND e.status NOT IN ('draft')`,
    )
    .all(fiscalYearId) as ExpenseInfo[]
}

export function getExpensePayments(
  db: Database.Database,
  expenseIds: number[],
): PaymentInfo[] {
  if (expenseIds.length === 0) return []
  const placeholders = expenseIds.map(() => '?').join(',')
  return db
    .prepare(
      `SELECT expense_id as parent_id, amount_ore, payment_date
     FROM expense_payments
     WHERE expense_id IN (${placeholders})
     ORDER BY expense_id, payment_date`,
    )
    .all(...expenseIds) as PaymentInfo[]
}
