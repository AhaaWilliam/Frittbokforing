/**
 * S58 F66-d: Bank-fee-entry-service.
 *
 * Skapar ett bokföringsverifikat för en auto-klassificerad bank-TX
 * (bank_fee / interest_income / interest_expense) och länkar det via
 * bank_reconciliation_matches (matched_entity_type='bank_fee').
 *
 * Serie-val per typ:
 *   - interest_income → A-serien
 *   - bank_fee / interest_expense → B-serien
 *
 * Ingen moms (ML 3 kap 9§). Chronology-check (M142) per serie.
 * Period-check (PERIOD_CLOSED) för användarvänligt fel.
 *
 * Anropas inom db.transaction() — kastar strukturerade fel.
 */
import type Database from 'better-sqlite3'
import log from 'electron-log'
import { checkChronology } from '../chronology-guard'
import { classifyBankFeeTx, type FeeClassification } from './bank-fee-classifier'
import type { ErrorCode, IpcResult } from '../../../shared/types'

// ═══ Types ═══

export interface CreateBankFeeEntryInput {
  bank_transaction_id: number
  classification: FeeClassification
  payment_account: string
  /** Skippa chronology-check (används vid bulk-accept där batch-nivå-check körs) */
  skipChronologyCheck?: boolean
}

export interface CreateBankFeeEntryResult {
  journal_entry_id: number
  match_id: number
}

interface BankTxRow {
  id: number
  bank_statement_id: number
  amount_ore: number
  value_date: string
  reconciliation_status: 'unmatched' | 'matched' | 'excluded'
}

interface BankStatementRow {
  company_id: number
  fiscal_year_id: number
}

// ═══ Internal TX helper ═══

export function _createBankFeeEntryTx(
  db: Database.Database,
  input: CreateBankFeeEntryInput,
): CreateBankFeeEntryResult {
  if (!db.inTransaction) {
    throw new Error('_createBankFeeEntryTx must be called within a transaction')
  }

  // 1. Hämta + validera bank-TX
  const tx = db
    .prepare(
      'SELECT id, bank_statement_id, amount_ore, value_date, reconciliation_status FROM bank_transactions WHERE id = ?',
    )
    .get(input.bank_transaction_id) as BankTxRow | undefined
  if (!tx) {
    throw {
      code: 'VALIDATION_ERROR' as ErrorCode,
      error: 'Bank-transaktionen hittades inte.',
      field: 'bank_transaction_id',
    }
  }
  if (tx.reconciliation_status !== 'unmatched') {
    throw {
      code: 'VALIDATION_ERROR' as ErrorCode,
      error: 'Transaktionen är redan matchad eller exkluderad.',
      field: 'bank_transaction_id',
    }
  }

  // 2. Hämta company + fiscal-year från bank_statement
  const stmt = db
    .prepare('SELECT company_id, fiscal_year_id FROM bank_statements WHERE id = ?')
    .get(tx.bank_statement_id) as BankStatementRow | undefined
  if (!stmt) {
    throw {
      code: 'VALIDATION_ERROR' as ErrorCode,
      error: 'Bank-kontoutdraget saknas.',
    }
  }

  // 3. Period-check (användarvänlig PERIOD_CLOSED innan DB-trigger)
  const closedPeriod = db
    .prepare(
      `SELECT 1 FROM accounting_periods
       WHERE fiscal_year_id = ?
         AND ? BETWEEN start_date AND end_date
         AND is_closed = 1
       LIMIT 1`,
    )
    .get(stmt.fiscal_year_id, tx.value_date)
  if (closedPeriod) {
    throw {
      code: 'PERIOD_CLOSED' as ErrorCode,
      error: `Perioden för ${tx.value_date} är stängd.`,
      field: 'date',
    }
  }

  // 4. Chronology (M142) per serie
  const series = input.classification.series
  if (!input.skipChronologyCheck) {
    checkChronology(db, stmt.fiscal_year_id, series, tx.value_date)
  }

  // 5. Allokera verification-number
  const nextVer = db
    .prepare(
      `SELECT COALESCE(MAX(verification_number), 0) + 1 AS next_ver
       FROM journal_entries
       WHERE fiscal_year_id = ? AND verification_series = ?`,
    )
    .get(stmt.fiscal_year_id, series) as { next_ver: number }

  // 6. Verifikations-description
  const { type } = input.classification
  const description =
    type === 'bank_fee'
      ? `Bankavgift — TX #${tx.id}`
      : type === 'interest_income'
        ? `Ränteintäkt — TX #${tx.id}`
        : `Räntekostnad — TX #${tx.id}`

  // 7. Skapa journal_entry (draft → booked)
  const jeResult = db
    .prepare(
      `INSERT INTO journal_entries (
         company_id, fiscal_year_id, verification_number, verification_series,
         journal_date, description, status, source_type
       ) VALUES (?, ?, ?, ?, ?, ?, 'draft', 'auto_bank_fee')`,
    )
    .run(
      stmt.company_id,
      stmt.fiscal_year_id,
      nextVer.next_ver,
      series,
      tx.value_date,
      description,
    )
  const journalEntryId = Number(jeResult.lastInsertRowid)

  // 8. Skapa rader enligt klassificering
  const absAmount = Math.abs(tx.amount_ore)
  const insertLine = db.prepare(
    `INSERT INTO journal_entry_lines (
       journal_entry_id, line_number, account_number,
       debit_ore, credit_ore, description
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  )

  if (type === 'bank_fee') {
    // D 6570, K 1930
    insertLine.run(journalEntryId, 1, '6570', absAmount, 0, description)
    insertLine.run(journalEntryId, 2, input.payment_account, 0, absAmount, description)
  } else if (type === 'interest_income') {
    // D 1930, K 8310
    insertLine.run(journalEntryId, 1, input.payment_account, absAmount, 0, description)
    insertLine.run(journalEntryId, 2, '8310', 0, absAmount, description)
  } else {
    // interest_expense: D 8410, K 1930
    insertLine.run(journalEntryId, 1, '8410', absAmount, 0, description)
    insertLine.run(journalEntryId, 2, input.payment_account, 0, absAmount, description)
  }

  // 9. Boka verifikatet (triggers validerar balans + period)
  db.prepare(`UPDATE journal_entries SET status = 'booked' WHERE id = ?`).run(
    journalEntryId,
  )

  // 10. Skapa reconciliation-raden (matched_entity_type='bank_fee')
  const matchResult = db
    .prepare(
      `INSERT INTO bank_reconciliation_matches (
         bank_transaction_id, matched_entity_type, matched_entity_id,
         fee_journal_entry_id, match_method
       ) VALUES (?, 'bank_fee', NULL, ?, ?)`,
    )
    .run(input.bank_transaction_id, journalEntryId, input.classification.method)
  const matchId = Number(matchResult.lastInsertRowid)

  // 11. Flippa TX-status
  db.prepare(
    `UPDATE bank_transactions SET reconciliation_status = 'matched' WHERE id = ?`,
  ).run(input.bank_transaction_id)

  return { journal_entry_id: journalEntryId, match_id: matchId }
}

// ═══ Public API ═══

export interface CreateBankFeeEntryPublicInput {
  bank_transaction_id: number
  payment_account: string
  skipChronologyCheck?: boolean
}

/**
 * Skapar ett bank-fee-verifikat utifrån TX:ens egen klassificering.
 * Klassificering körs server-side (renderer kan inte styra bokföringslogik).
 *
 * Öppnar egen transaktion — används från IPC-handler och bulk-accept.
 */
export function createBankFeeEntry(
  db: Database.Database,
  input: CreateBankFeeEntryPublicInput,
): IpcResult<CreateBankFeeEntryResult> {
  try {
    const result = db.transaction(() => {
      const tx = db
        .prepare(
          `SELECT amount_ore, counterparty_name, remittance_info, bank_tx_subfamily
           FROM bank_transactions WHERE id = ?`,
        )
        .get(input.bank_transaction_id) as
        | {
            amount_ore: number
            counterparty_name: string | null
            remittance_info: string | null
            bank_tx_subfamily: string | null
          }
        | undefined
      if (!tx) {
        throw {
          code: 'VALIDATION_ERROR' as ErrorCode,
          error: 'Bank-transaktionen hittades inte.',
          field: 'bank_transaction_id',
        }
      }
      const classification = classifyBankFeeTx(tx)
      if (!classification) {
        throw {
          code: 'VALIDATION_ERROR' as ErrorCode,
          error: 'Transaktionen kan inte auto-klassificeras som bankavgift/ränta.',
          field: 'bank_transaction_id',
        }
      }
      return _createBankFeeEntryTx(db, {
        bank_transaction_id: input.bank_transaction_id,
        classification,
        payment_account: input.payment_account,
        skipChronologyCheck: input.skipChronologyCheck,
      })
    })()
    return { success: true, data: result }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err) {
      const e = err as { code: ErrorCode; error: string; field?: string }
      log.error(`[bank-fee-entry] ${e.code}: ${e.error}`)
      return { success: false, code: e.code, error: e.error, field: e.field }
    }
    const message = err instanceof Error ? err.message : 'Okänt fel'
    log.error(`[bank-fee-entry] unexpected: ${message}`)
    return { success: false, code: 'UNEXPECTED_ERROR', error: message }
  }
}
