/**
 * Imported entry service — read-only list of journal_entries from SIE-import
 * (I-serie, source_type='import'). Separerad vy eftersom dessa verifikat
 * inte har motsvarande rader i manual_entries (M145).
 */
import type Database from 'better-sqlite3'
import type { ImportedEntryListItem } from '../../shared/types'

export function listImportedEntries(
  db: Database.Database,
  fiscalYearId: number,
): ImportedEntryListItem[] {
  return db
    .prepare(
      `SELECT
        je.id AS journal_entry_id,
        je.verification_number,
        je.verification_series,
        je.journal_date,
        je.description,
        je.source_reference,
        COALESCE(
          (SELECT SUM(jel.debit_ore)
             FROM journal_entry_lines jel
             WHERE jel.journal_entry_id = je.id),
          0
        ) AS total_amount_ore
      FROM journal_entries je
      WHERE je.fiscal_year_id = ?
        AND je.verification_series = 'I'
        AND je.source_type = 'import'
      ORDER BY je.verification_number DESC`,
    )
    .all(fiscalYearId) as ImportedEntryListItem[]
}
