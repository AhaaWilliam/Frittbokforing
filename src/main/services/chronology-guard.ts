import type Database from 'better-sqlite3'

/**
 * Validates that entryDate is >= the latest booked journal_date
 * in the given verification series within the fiscal year.
 * Same-day is allowed (strict less-than comparison).
 *
 * MUST be called within db.transaction() — throws if not.
 *
 * Throws structured { code: 'VALIDATION_ERROR', error, field } on violation.
 */
export function checkChronology(
  db: Database.Database,
  fiscalYearId: number,
  series: string,
  entryDate: string,
): void {
  if (!db.inTransaction) {
    throw new Error('checkChronology must be called within a transaction')
  }

  const lastEntry = db
    .prepare(
      `SELECT journal_date FROM journal_entries
       WHERE fiscal_year_id = ? AND verification_series = ?
       ORDER BY verification_number DESC LIMIT 1`,
    )
    .get(fiscalYearId, series) as { journal_date: string } | undefined

  if (lastEntry && entryDate < lastEntry.journal_date) {
    throw {
      code: 'VALIDATION_ERROR' as const,
      error: `Datum ${entryDate} är före senaste bokförda datum ${lastEntry.journal_date} i ${series}-serien.`,
      field: 'date',
    }
  }
}
