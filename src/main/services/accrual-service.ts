import type Database from 'better-sqlite3'
import log from 'electron-log'
import { checkChronology } from './chronology-guard'
import { getCompanyIdForFiscalYear } from '../utils/active-context'
import { validateAccountsActive } from './account-service'
import { rebuildSearchIndex } from './search-service'
import type {
  IpcResult,
  CreateAccrualScheduleInput,
  AccrualScheduleWithStatus,
  AccrualPeriodStatus,
} from '../../shared/types'

// ═══ D/K mapping per accrual_type ═══

const DEBIT_CREDIT_MAP: Record<
  string,
  {
    debitField: 'balance_account' | 'result_account'
    creditField: 'balance_account' | 'result_account'
  }
> = {
  prepaid_expense: {
    debitField: 'balance_account',
    creditField: 'result_account',
  },
  accrued_expense: {
    debitField: 'result_account',
    creditField: 'balance_account',
  },
  prepaid_income: {
    debitField: 'result_account',
    creditField: 'balance_account',
  },
  accrued_income: {
    debitField: 'balance_account',
    creditField: 'result_account',
  },
}

// ═══ Public API ═══

export function createAccrualSchedule(
  db: Database.Database,
  input: CreateAccrualScheduleInput,
): IpcResult<{ id: number }> {
  // Validate account classes
  const balClass = input.balance_account.charAt(0)
  if (balClass !== '1' && balClass !== '2') {
    return {
      success: false,
      error: 'Balanskonto måste vara klass 1 eller 2',
      code: 'VALIDATION_ERROR',
      field: 'balance_account',
    }
  }

  const resClass = parseInt(input.result_account.charAt(0), 10)
  if (resClass < 3 || resClass > 8) {
    return {
      success: false,
      error: 'Resultatkonto måste vara klass 3–8',
      code: 'VALIDATION_ERROR',
      field: 'result_account',
    }
  }

  // Validate period range within FY
  if (input.start_period + input.period_count - 1 > 12) {
    return {
      success: false,
      error: 'Periodiseringen får inte sträcka sig utanför räkenskapsåret',
      code: 'VALIDATION_ERROR',
      field: 'period_count',
    }
  }

  // Validate accounts exist and are active
  try {
    validateAccountsActive(db, [input.balance_account, input.result_account])
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && 'error' in err) {
      const e = err as { code: string; error: string; field?: string }
      return {
        success: false,
        error: e.error,
        code: e.code,
        field: e.field,
      } as IpcResult<{ id: number }>
    }
    return {
      success: false,
      error: 'Kontot kunde inte valideras',
      code: 'VALIDATION_ERROR',
    }
  }

  const result = db
    .prepare(
      `INSERT INTO accrual_schedules (
        fiscal_year_id, description, accrual_type,
        balance_account, result_account, total_amount_ore,
        period_count, start_period
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.fiscal_year_id,
      input.description,
      input.accrual_type,
      input.balance_account,
      input.result_account,
      input.total_amount_ore,
      input.period_count,
      input.start_period,
    )

  return { success: true, data: { id: Number(result.lastInsertRowid) } }
}

export function getAccrualSchedules(
  db: Database.Database,
  fiscalYearId: number,
): IpcResult<AccrualScheduleWithStatus[]> {
  const schedules = db
    .prepare(
      `SELECT * FROM accrual_schedules WHERE fiscal_year_id = ? ORDER BY created_at DESC`,
    )
    .all(fiscalYearId) as Array<{
    id: number
    fiscal_year_id: number
    description: string
    accrual_type: string
    balance_account: string
    result_account: string
    total_amount_ore: number
    period_count: number
    start_period: number
    is_active: number
    created_at: string
  }>

  const entries = db
    .prepare(
      `SELECT accrual_schedule_id, period_number, journal_entry_id, amount_ore
       FROM accrual_entries
       WHERE accrual_schedule_id IN (SELECT id FROM accrual_schedules WHERE fiscal_year_id = ?)`,
    )
    .all(fiscalYearId) as Array<{
    accrual_schedule_id: number
    period_number: number
    journal_entry_id: number
    amount_ore: number
  }>

  // Group entries by schedule
  const entriesBySchedule = new Map<number, typeof entries>()
  for (const e of entries) {
    if (!entriesBySchedule.has(e.accrual_schedule_id)) {
      entriesBySchedule.set(e.accrual_schedule_id, [])
    }
    entriesBySchedule.get(e.accrual_schedule_id)!.push(e)
  }

  const result: AccrualScheduleWithStatus[] = schedules.map((s) => {
    const scheduleEntries = entriesBySchedule.get(s.id) ?? []
    const executedPeriods = new Set(scheduleEntries.map((e) => e.period_number))
    const executedTotal = scheduleEntries.reduce(
      (sum, e) => sum + e.amount_ore,
      0,
    )

    const periodStatuses: AccrualPeriodStatus[] = []
    for (let p = s.start_period; p < s.start_period + s.period_count; p++) {
      const periodEntry = scheduleEntries.find((e) => e.period_number === p)
      periodStatuses.push({
        periodNumber: p,
        executed: executedPeriods.has(p),
        journalEntryId: periodEntry?.journal_entry_id,
        amountOre: computePeriodAmount(
          s.total_amount_ore,
          s.period_count,
          p,
          s.start_period,
        ),
      })
    }

    return {
      ...s,
      accrual_type:
        s.accrual_type as CreateAccrualScheduleInput['accrual_type'],
      periodStatuses,
      executedCount: executedPeriods.size,
      remainingOre: s.total_amount_ore - executedTotal,
    }
  })

  return { success: true, data: result }
}

export function executeAccrualForPeriod(
  db: Database.Database,
  scheduleId: number,
  periodNumber: number,
): IpcResult<{ journalEntryId: number }> {
  try {
    return db.transaction(() => {
      // 1. Fetch schedule
      const schedule = db
        .prepare('SELECT * FROM accrual_schedules WHERE id = ?')
        .get(scheduleId) as
        | {
            id: number
            fiscal_year_id: number
            description: string
            accrual_type: string
            balance_account: string
            result_account: string
            total_amount_ore: number
            period_count: number
            start_period: number
            is_active: number
          }
        | undefined

      if (!schedule) {
        throw { code: 'NOT_FOUND', error: 'Periodiseringsschema hittades inte' }
      }

      // 2. Validate period within range
      const endPeriod = schedule.start_period + schedule.period_count - 1
      if (periodNumber < schedule.start_period || periodNumber > endPeriod) {
        throw {
          code: 'VALIDATION_ERROR',
          error: `Period ${periodNumber} ligger utanför schemat (${schedule.start_period}–${endPeriod})`,
          field: 'period_number',
        }
      }

      // 3. Check period not closed
      const period = db
        .prepare(
          `SELECT is_closed, end_date FROM accounting_periods
           WHERE fiscal_year_id = ? AND period_number = ?`,
        )
        .get(schedule.fiscal_year_id, periodNumber) as
        | {
            is_closed: number
            end_date: string
          }
        | undefined

      if (!period) {
        throw {
          code: 'VALIDATION_ERROR',
          error: `Period ${periodNumber} finns inte`,
        }
      }
      if (period.is_closed) {
        throw {
          code: 'VALIDATION_ERROR',
          error: `Period ${periodNumber} är stängd`,
          field: 'period_number',
        }
      }

      // 4. Compute period amount
      const amountOre = computePeriodAmount(
        schedule.total_amount_ore,
        schedule.period_count,
        periodNumber,
        schedule.start_period,
      )

      // 5. Journal date = period end_date
      const journalDate = period.end_date

      // 6. Chronology check (M142)
      checkChronology(db, schedule.fiscal_year_id, 'C', journalDate)

      // 7. Allocate C-serie number
      const nextVer = db
        .prepare(
          `SELECT COALESCE(MAX(verification_number), 0) + 1 as next_ver
           FROM journal_entries
           WHERE fiscal_year_id = ? AND verification_series = 'C'`,
        )
        .get(schedule.fiscal_year_id) as { next_ver: number }

      // 8. Create journal entry
      const description = `Periodisering: ${schedule.description} (period ${periodNumber}/${schedule.start_period + schedule.period_count - 1})`
      const accrCompanyId = getCompanyIdForFiscalYear(
        db,
        schedule.fiscal_year_id,
      )
      const jeResult = db
        .prepare(
          `INSERT INTO journal_entries (
            company_id, fiscal_year_id, verification_number, verification_series,
            journal_date, description, status, source_type
          ) VALUES (
            ?, ?, ?, 'C',
            ?, ?, 'draft', 'manual'
          )`,
        )
        .run(
          accrCompanyId,
          schedule.fiscal_year_id,
          nextVer.next_ver,
          journalDate,
          description,
        )
      const journalEntryId = Number(jeResult.lastInsertRowid)

      // 9. Insert journal entry lines (D/K based on accrual_type)
      const mapping = DEBIT_CREDIT_MAP[schedule.accrual_type]
      const debitAccount = schedule[mapping.debitField]
      const creditAccount = schedule[mapping.creditField]

      const insertJel = db.prepare(
        `INSERT INTO journal_entry_lines (
          journal_entry_id, line_number, account_number,
          debit_ore, credit_ore, description
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      insertJel.run(journalEntryId, 1, debitAccount, amountOre, 0, description)
      insertJel.run(journalEntryId, 2, creditAccount, 0, amountOre, description)

      // 10. Book the entry
      db.prepare(
        "UPDATE journal_entries SET status = 'booked' WHERE id = ?",
      ).run(journalEntryId)

      // 11. Track in accrual_entries
      db.prepare(
        `INSERT INTO accrual_entries (
          accrual_schedule_id, journal_entry_id, period_number, amount_ore, entry_type
        ) VALUES (?, ?, ?, ?, 'accrual')`,
      ).run(scheduleId, journalEntryId, periodNumber, amountOre)

      // 12. FTS5 rebuild (M143)
      try {
        rebuildSearchIndex(db)
      } catch (err) {
        log.warn('FTS5 rebuild failed in accrual-service:', err)
      }

      return { success: true as const, data: { journalEntryId } }
    })()
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && 'error' in err) {
      const e = err as { code: string; error: string; field?: string }
      return {
        success: false,
        error: e.error,
        code: e.code,
        field: e.field,
      } as IpcResult<{ journalEntryId: number }>
    }
    return {
      success: false,
      error:
        err instanceof Error ? err.message : 'Oväntat fel vid periodisering',
      code: 'UNEXPECTED_ERROR',
    }
  }
}

export function executeAllForPeriod(
  db: Database.Database,
  fiscalYearId: number,
  periodNumber: number,
): IpcResult<{
  executed: number
  failed: Array<{ scheduleId: number; error: string }>
}> {
  const schedules = db
    .prepare(
      `SELECT id, start_period, period_count FROM accrual_schedules
       WHERE fiscal_year_id = ? AND is_active = 1`,
    )
    .all(fiscalYearId) as Array<{
    id: number
    start_period: number
    period_count: number
  }>

  // Filter to schedules that cover this period
  const applicable = schedules.filter(
    (s) =>
      periodNumber >= s.start_period &&
      periodNumber < s.start_period + s.period_count,
  )

  const succeeded: number[] = []
  const failed: Array<{ scheduleId: number; error: string }> = []

  for (const s of applicable) {
    const result = executeAccrualForPeriod(db, s.id, periodNumber)
    if (result.success) {
      succeeded.push(s.id)
    } else {
      failed.push({ scheduleId: s.id, error: result.error })
    }
  }

  return { success: true, data: { executed: succeeded.length, failed } }
}

export function deactivateSchedule(
  db: Database.Database,
  scheduleId: number,
): IpcResult<void> {
  const result = db
    .prepare('UPDATE accrual_schedules SET is_active = 0 WHERE id = ?')
    .run(scheduleId)

  if (result.changes === 0) {
    return {
      success: false,
      error: 'Periodiseringsschema hittades inte',
      code: 'NOT_FOUND',
    }
  }

  return { success: true, data: undefined }
}

// ═══ Helpers ═══

function computePeriodAmount(
  totalOre: number,
  periodCount: number,
  periodNumber: number,
  startPeriod: number,
): number {
  const perPeriod = Math.floor(totalOre / periodCount)
  const lastPeriod = startPeriod + periodCount - 1
  if (periodNumber === lastPeriod) {
    return totalOre - perPeriod * (periodCount - 1)
  }
  return perPeriod
}
