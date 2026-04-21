import type Database from 'better-sqlite3'
import { getCompanyIdForFiscalYear } from '../../utils/active-context'

const BANK_FEE_ACCOUNT = '6570'

export interface BatchBankFeeInput {
  fiscalYearId: number
  /** 'A' (invoice) eller 'B' (expense) — hårdkodat val, ingen user-input. */
  series: 'A' | 'B'
  /** Total fee-belopp i öre. Hela beloppet bokförs (M126, ingen proportionering). */
  bankFeeOre: number
  /** Bank-konto-nummer för K-sidan. */
  bankAccountNumber: string
  /** ISO-datum YYYY-MM-DD. */
  paymentDate: string
  /** Batch-id som denna fee hör till (källa-spårning). */
  batchId: number
}

/**
 * Skapar bank-fee-verifikat för en bulk-betalning (M114, M126).
 *
 * Postar hela fee-beloppet på 6570 (debet) mot bank-kontot (kredit).
 * Används av payInvoicesBulk (A-serie) och payExpensesBulk (B-serie).
 * Enda tillåtna callsites: bulk-wrappers efter att batch-raden skrivits
 * med succeeded.length >= 1.
 *
 * Måste köras inne i yttre `db.transaction()`.
 */
export function createBatchBankFeeJournalEntry(
  db: Database.Database,
  input: BatchBankFeeInput,
): number {
  const {
    fiscalYearId,
    series,
    bankFeeOre,
    bankAccountNumber,
    paymentDate,
    batchId,
  } = input

  const nextVer = db
    .prepare(
      `SELECT COALESCE(MAX(verification_number), 0) + 1 AS next_ver
       FROM journal_entries
       WHERE fiscal_year_id = ? AND verification_series = ?`,
    )
    .get(fiscalYearId, series) as { next_ver: number }

  const description = `Bankavgift bulk-betalning ${paymentDate}`
  const companyId = getCompanyIdForFiscalYear(db, fiscalYearId)

  const entryResult = db
    .prepare(
      `INSERT INTO journal_entries (
        company_id, fiscal_year_id, verification_number, verification_series,
        journal_date, description, status, source_type, source_reference
      ) VALUES (?, ?, ?, ?, ?, ?, 'draft', 'auto_bank_fee', ?)`,
    )
    .run(
      companyId,
      fiscalYearId,
      nextVer.next_ver,
      series,
      paymentDate,
      description,
      `batch:${batchId}`,
    )
  const journalEntryId = Number(entryResult.lastInsertRowid)

  const insertLine = db.prepare(
    `INSERT INTO journal_entry_lines (
      journal_entry_id, line_number, account_number,
      debit_ore, credit_ore, description
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  )
  insertLine.run(
    journalEntryId,
    1,
    BANK_FEE_ACCOUNT,
    bankFeeOre,
    0,
    description,
  )
  insertLine.run(
    journalEntryId,
    2,
    bankAccountNumber,
    0,
    bankFeeOre,
    description,
  )

  db.prepare(
    "UPDATE journal_entries SET status = 'booked' WHERE id = ?",
  ).run(journalEntryId)

  db.prepare(
    'UPDATE payment_batches SET bank_fee_journal_entry_id = ? WHERE id = ?',
  ).run(journalEntryId, batchId)

  return journalEntryId
}
