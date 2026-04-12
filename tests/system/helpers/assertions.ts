/**
 * Shared assertion helpers for system tests.
 */
import type Database from 'better-sqlite3'
import { expect } from 'vitest'

/**
 * Assert that a journal entry is balanced: SUM(debit_ore) === SUM(credit_ore).
 */
export function assertJournalEntryBalanced(db: Database.Database, journalEntryId: number): void {
  const row = db
    .prepare(
      `SELECT SUM(debit_ore) as total_debit, SUM(credit_ore) as total_credit
       FROM journal_entry_lines WHERE journal_entry_id = ?`,
    )
    .get(journalEntryId) as { total_debit: number | null; total_credit: number | null }
  expect(row.total_debit).not.toBeNull()
  expect(row.total_credit).not.toBeNull()
  expect(row.total_debit).toBe(row.total_credit)
}

/**
 * Assert contiguous verification numbers in a given series for a fiscal year.
 * Returns the list of ver numbers for further assertions.
 */
export function assertContiguousVerNumbers(
  db: Database.Database,
  fiscalYearId: number,
  series: string,
): number[] {
  const rows = db
    .prepare(
      `SELECT verification_number FROM journal_entries
       WHERE fiscal_year_id = ? AND verification_series = ?
       ORDER BY verification_number`,
    )
    .all(fiscalYearId, series) as { verification_number: number }[]
  const nums = rows.map(r => r.verification_number)
  for (let i = 1; i < nums.length; i++) {
    expect(nums[i]).toBe(nums[i - 1] + 1)
  }
  return nums
}
