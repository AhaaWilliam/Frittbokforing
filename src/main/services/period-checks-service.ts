import type Database from 'better-sqlite3'
import type { IpcResult, ErrorCode } from '../../shared/types'
import { z } from 'zod'
import { validateWithZod } from './validate-with-zod'
import log from 'electron-log/main'

/**
 * Period-checks-service (Sprint VS-113).
 *
 * Aggregerar fyra status-checkar för en given period innan användaren
 * stänger månaden i Vardag-läget. Checkar är ADVISORY: status='warning'
 * blockerar inte stängning men visas tydligt i UI:n så användaren kan
 * fatta informerat beslut.
 *
 * Checkar:
 *   1. Bankavstämning — alla bank_transactions inom periodens datum-
 *      range har reconciliation_status != 'unmatched'.
 *   2. Lön bokförd — minst en journal-rad mot konto 7010, 7090, 7210
 *      eller 7211 finns i perioden. (Heuristik: bolag utan anställda
 *      har naturligt 'na'-status.)
 *   3. Moms-rapport — alla draft-fakturor och draft-kostnader inom
 *      perioden är finalized. Draft-status indikerar att moms-summor
 *      ännu inte är slutgiltiga.
 *   4. Leverantörsbetalningar — alla finalized expenses med
 *      due_date <= periodens slut är paid eller partial.
 *
 * Status-värden:
 *   'ok'      — checken klarar gränsen
 *   'warning' — checken hittade icke-blockerande ärenden
 *   'na'      — checken är inte tillämplig (t.ex. bolag utan bank-statement)
 */

export type CheckStatus = 'ok' | 'warning' | 'na'

export interface CheckResult {
  status: CheckStatus
  count: number
  detail: string
}

export interface PeriodChecks {
  period_id: number
  period_start: string
  period_end: string
  bankReconciliation: CheckResult
  salaryBooked: CheckResult
  vatReportReady: CheckResult
  supplierPayments: CheckResult
  allOk: boolean
}

const PeriodChecksInputSchema = z
  .object({
    period_id: z.number().int().positive(),
  })
  .strict()

export const PERIOD_CHECKS_SCHEMA = PeriodChecksInputSchema

export function getPeriodChecks(
  db: Database.Database,
  rawInput: unknown,
): IpcResult<PeriodChecks> {
  let input: { period_id: number }
  try {
    input = validateWithZod(PeriodChecksInputSchema, rawInput)
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err) {
      const e = err as { code: string; error: string; field?: string }
      return {
        success: false,
        code: e.code as ErrorCode,
        error: e.error,
        ...(e.field ? { field: e.field } : {}),
      }
    }
    throw err
  }

  try {
    const period = db
      .prepare(
        'SELECT id, fiscal_year_id, company_id, start_date, end_date FROM accounting_periods WHERE id = ?',
      )
      .get(input.period_id) as
      | {
          id: number
          fiscal_year_id: number
          company_id: number
          start_date: string
          end_date: string
        }
      | undefined
    if (!period) {
      return {
        success: false,
        code: 'NOT_FOUND',
        error: 'Perioden hittades inte.',
      }
    }

    const bankReconciliation = checkBankReconciliation(db, period)
    const salaryBooked = checkSalaryBooked(db, period)
    const vatReportReady = checkVatReportReady(db, period)
    const supplierPayments = checkSupplierPayments(db, period)

    const allOk =
      bankReconciliation.status !== 'warning' &&
      salaryBooked.status !== 'warning' &&
      vatReportReady.status !== 'warning' &&
      supplierPayments.status !== 'warning'

    return {
      success: true,
      data: {
        period_id: period.id,
        period_start: period.start_date,
        period_end: period.end_date,
        bankReconciliation,
        salaryBooked,
        vatReportReady,
        supplierPayments,
        allOk,
      },
    }
  } catch (err) {
    log.error('[period-checks] getPeriodChecks:', err)
    return {
      success: false,
      code: 'UNEXPECTED_ERROR',
      error: 'Kunde inte beräkna periodstatus.',
    }
  }
}

interface PeriodScope {
  fiscal_year_id: number
  company_id: number
  start_date: string
  end_date: string
}

function checkBankReconciliation(
  db: Database.Database,
  period: PeriodScope,
): CheckResult {
  // Räkna bank-transaktioner i periodens range som inte är matchade.
  // Saknar bolaget bank-statements helt → 'na'.
  const stmtCount = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM bank_statements
       WHERE company_id = ? AND fiscal_year_id = ?
         AND statement_date BETWEEN ? AND ?`,
    )
    .get(
      period.company_id,
      period.fiscal_year_id,
      period.start_date,
      period.end_date,
    ) as { cnt: number }

  if (stmtCount.cnt === 0) {
    return {
      status: 'na',
      count: 0,
      detail: 'Inga bankkontoutdrag importerade för perioden.',
    }
  }

  const unmatched = db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM bank_transactions bt
       JOIN bank_statements bs ON bs.id = bt.bank_statement_id
       WHERE bs.company_id = ? AND bs.fiscal_year_id = ?
         AND bt.value_date BETWEEN ? AND ?
         AND bt.reconciliation_status = 'unmatched'`,
    )
    .get(
      period.company_id,
      period.fiscal_year_id,
      period.start_date,
      period.end_date,
    ) as { cnt: number }

  if (unmatched.cnt === 0) {
    return {
      status: 'ok',
      count: 0,
      detail: 'Alla banktransaktioner är matchade.',
    }
  }
  return {
    status: 'warning',
    count: unmatched.cnt,
    detail: `${unmatched.cnt} banktransaktion(er) är omatchade.`,
  }
}

const SALARY_ACCOUNTS = ['7010', '7090', '7210', '7211', '7510', '7520']

function checkSalaryBooked(
  db: Database.Database,
  period: PeriodScope,
): CheckResult {
  // VS-120: companies.has_employees styr om 0 lönerader är 'na' eller
  // 'warning'. Solo-bolag (default has_employees=0) → 'na'. Bolag med
  // anställda (has_employees=1) som glömt bokföra lön → 'warning'.
  const placeholders = SALARY_ACCOUNTS.map(() => '?').join(',')
  const row = db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM journal_entry_lines jel
       JOIN journal_entries je ON je.id = jel.journal_entry_id
       WHERE je.fiscal_year_id = ?
         AND je.journal_date BETWEEN ? AND ?
         AND je.status = 'booked'
         AND jel.account_number IN (${placeholders})`,
    )
    .get(
      period.fiscal_year_id,
      period.start_date,
      period.end_date,
      ...SALARY_ACCOUNTS,
    ) as { cnt: number }

  if (row.cnt === 0) {
    const company = db
      .prepare('SELECT has_employees FROM companies WHERE id = ?')
      .get(period.company_id) as { has_employees: number } | undefined
    const hasEmployees = company?.has_employees === 1
    if (hasEmployees) {
      return {
        status: 'warning',
        count: 0,
        detail:
          'Inga lönebokningar i perioden — bolaget har anställda enligt inställningarna.',
      }
    }
    return {
      status: 'na',
      count: 0,
      detail:
        'Ingen lönebokföring funnen — tillämpligt om bolaget har anställda.',
    }
  }
  return {
    status: 'ok',
    count: row.cnt,
    detail: `${row.cnt} lönerelaterad(e) journalrad(er) bokförd(a).`,
  }
}

function checkVatReportReady(
  db: Database.Database,
  period: PeriodScope,
): CheckResult {
  // Om det finns kvarvarande draft-fakturor eller draft-kostnader i
  // perioden är moms-rapporten inte preliminärt komplett.
  const draftInvoices = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM invoices
       WHERE fiscal_year_id = ? AND status = 'draft'
         AND invoice_date BETWEEN ? AND ?`,
    )
    .get(period.fiscal_year_id, period.start_date, period.end_date) as {
    cnt: number
  }

  const draftExpenses = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM expenses
       WHERE fiscal_year_id = ? AND status = 'draft'
         AND expense_date BETWEEN ? AND ?`,
    )
    .get(period.fiscal_year_id, period.start_date, period.end_date) as {
    cnt: number
  }

  const total = draftInvoices.cnt + draftExpenses.cnt
  if (total === 0) {
    return {
      status: 'ok',
      count: 0,
      detail: 'Inga utkast i perioden — moms är preliminärt komplett.',
    }
  }
  return {
    status: 'warning',
    count: total,
    detail: `${draftInvoices.cnt} fakturautkast, ${draftExpenses.cnt} kostnadsutkast.`,
  }
}

function checkSupplierPayments(
  db: Database.Database,
  period: PeriodScope,
): CheckResult {
  // Förfallna leverantörsfakturor (due_date <= periodens slut) som
  // ännu inte är betalda eller partial-betalda.
  const overdue = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM expenses
       WHERE fiscal_year_id = ?
         AND status = 'unpaid'
         AND due_date <= ?`,
    )
    .get(period.fiscal_year_id, period.end_date) as { cnt: number }

  if (overdue.cnt === 0) {
    return {
      status: 'ok',
      count: 0,
      detail: 'Alla förfallna leverantörsfakturor är betalda.',
    }
  }
  return {
    status: 'warning',
    count: overdue.cnt,
    detail: `${overdue.cnt} leverantörsfaktura(or) har förfallit utan betalning.`,
  }
}
