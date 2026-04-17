/**
 * S58 F66-e: Bank-unmatch-service.
 *
 * Reverserar en bank-reconciliation atomärt via:
 *   1. Fetch reconciliation + payment + journal_entry
 *   2. Guards: NOT_MATCHED, BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED, PERIOD_CLOSED, ENTRY_ALREADY_CORRECTED
 *   3. DELETE bank_reconciliation_matches-rad (frigör ON DELETE RESTRICT)
 *   4. För invoice/expense: DELETE payment-raden (frigör trg_no_correct_with_payments)
 *   5. createCorrectionEntry på payment/fee-journal-entry (C-serie, M140-lås)
 *   6. För invoice/expense: räkna om paid_amount_ore + status från SUM(payments) (M101)
 *   7. UPDATE bank_transactions.reconciliation_status = 'unmatched'
 *
 * Payment-raden bevaras INTE (M154) — korrigeringsverifikatet i C-serien är
 * audit-trailen. Voided-flag-mönstret förkastat eftersom det skulle kräva att
 * alla SUM(payments)-queries exkluderar voided, en genomgripande ändring.
 *
 * M140-lås per payment-verifikat: om samma TX re-matchas manuellt skapas ett
 * NYTT payment-verifikat som kan unmatchas en gång. Endast det specifika
 * payment-verifikat som redan har corrected_by_id är permanent låst.
 */
import type Database from 'better-sqlite3'
import log from 'electron-log'
import type { ErrorCode, IpcResult } from '../../../shared/types'
import { createCorrectionEntry } from '../correction-service'

export interface BankUnmatchInput {
  bank_transaction_id: number
  correction_description?: string
}

export interface BankUnmatchResult {
  correction_journal_entry_id: number
  unmatched_payment_id: number | null
  unmatched_fee_entry_id: number | null
}

interface ReconciliationRow {
  id: number
  matched_entity_type: 'invoice' | 'expense' | 'bank_fee'
  matched_entity_id: number | null
  invoice_payment_id: number | null
  expense_payment_id: number | null
  fee_journal_entry_id: number | null
}

interface PaymentRow {
  id: number
  journal_entry_id: number
  payment_batch_id: number | null
  invoice_or_expense_id: number
}

interface JournalEntryRow {
  id: number
  fiscal_year_id: number
  journal_date: string
  corrected_by_id: number | null
  description: string
}

function fetchReconciliation(
  db: Database.Database,
  bankTxId: number,
): ReconciliationRow | undefined {
  return db
    .prepare(
      `SELECT id, matched_entity_type, matched_entity_id,
              invoice_payment_id, expense_payment_id, fee_journal_entry_id
       FROM bank_reconciliation_matches WHERE bank_transaction_id = ?`,
    )
    .get(bankTxId) as ReconciliationRow | undefined
}

function fetchInvoicePayment(
  db: Database.Database,
  paymentId: number,
): PaymentRow | undefined {
  return db
    .prepare(
      `SELECT id, journal_entry_id, payment_batch_id, invoice_id AS invoice_or_expense_id
       FROM invoice_payments WHERE id = ?`,
    )
    .get(paymentId) as PaymentRow | undefined
}

function fetchExpensePayment(
  db: Database.Database,
  paymentId: number,
): PaymentRow | undefined {
  return db
    .prepare(
      `SELECT id, journal_entry_id, payment_batch_id, expense_id AS invoice_or_expense_id
       FROM expense_payments WHERE id = ?`,
    )
    .get(paymentId) as PaymentRow | undefined
}

function fetchJournalEntry(
  db: Database.Database,
  journalEntryId: number,
): JournalEntryRow | undefined {
  return db
    .prepare(
      `SELECT id, fiscal_year_id, journal_date, corrected_by_id, description
       FROM journal_entries WHERE id = ?`,
    )
    .get(journalEntryId) as JournalEntryRow | undefined
}

function checkPeriodOpen(
  db: Database.Database,
  fiscalYearId: number,
  date: string,
): boolean {
  const closed = db
    .prepare(
      `SELECT 1 FROM accounting_periods
       WHERE fiscal_year_id = ?
         AND ? BETWEEN start_date AND end_date
         AND is_closed = 1
       LIMIT 1`,
    )
    .get(fiscalYearId, date)
  return !closed
}

export function unmatchBankTransaction(
  db: Database.Database,
  input: BankUnmatchInput,
): IpcResult<BankUnmatchResult> {
  try {
    const result = db.transaction(() => {
      const rec = fetchReconciliation(db, input.bank_transaction_id)
      if (!rec) {
        throw {
          code: 'NOT_MATCHED' as ErrorCode,
          error: 'Transaktionen är inte matchad.',
        }
      }

      if (rec.matched_entity_type === 'invoice' || rec.matched_entity_type === 'expense') {
        return unmatchEntityTx(db, input, rec)
      }
      return unmatchFeeTx(db, input, rec)
    })()
    return { success: true, data: result }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err) {
      const e = err as { code: ErrorCode; error: string; field?: string }
      log.error(`[bank-unmatch] ${e.code}: ${e.error}`)
      return { success: false, code: e.code, error: e.error, field: e.field }
    }
    const message = err instanceof Error ? err.message : 'Okänt fel'
    log.error(`[bank-unmatch] unexpected: ${message}`)
    return { success: false, code: 'UNEXPECTED_ERROR', error: message }
  }
}

function unmatchEntityTx(
  db: Database.Database,
  input: BankUnmatchInput,
  rec: ReconciliationRow,
): BankUnmatchResult {
  const isInvoice = rec.matched_entity_type === 'invoice'
  const paymentId = isInvoice ? rec.invoice_payment_id : rec.expense_payment_id
  if (paymentId === null) {
    throw {
      code: 'NOT_MATCHED' as ErrorCode,
      error: 'Reconciliation-raden saknar payment-referens.',
    }
  }

  const payment = isInvoice
    ? fetchInvoicePayment(db, paymentId)
    : fetchExpensePayment(db, paymentId)
  if (!payment) {
    throw {
      code: 'NOT_MATCHED' as ErrorCode,
      error: 'Payment-raden hittades inte.',
    }
  }

  // Guard: batch-payment
  if (payment.payment_batch_id !== null) {
    throw {
      code: 'BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED' as ErrorCode,
      error: 'Batch-betalningar kan inte unmatchas per rad.',
    }
  }

  const je = fetchJournalEntry(db, payment.journal_entry_id)
  if (!je) {
    throw {
      code: 'NOT_MATCHED' as ErrorCode,
      error: 'Bokföringsverifikatet hittades inte.',
    }
  }

  // Guard: stängd period på ursprungsdatumet
  if (!checkPeriodOpen(db, je.fiscal_year_id, je.journal_date)) {
    throw {
      code: 'PERIOD_CLOSED' as ErrorCode,
      error: `Perioden för ${je.journal_date} är stängd.`,
    }
  }

  // Guard: redan korrigerad
  if (je.corrected_by_id !== null) {
    throw {
      code: 'ENTRY_ALREADY_CORRECTED' as ErrorCode,
      error: 'Verifikatet är redan korrigerat.',
    }
  }

  // Step 3: DELETE reconciliation (frigör FK RESTRICT mot payment)
  db.prepare('DELETE FROM bank_reconciliation_matches WHERE id = ?').run(rec.id)

  // Step 4: DELETE payment-raden (frigör correction-service guard #4 + trg_no_correct_with_payments)
  const deleteSql = isInvoice
    ? 'DELETE FROM invoice_payments WHERE id = ?'
    : 'DELETE FROM expense_payments WHERE id = ?'
  db.prepare(deleteSql).run(paymentId)

  // Step 5: createCorrectionEntry på payment-journal-entry
  const corrResult = createCorrectionEntry(db, {
    journal_entry_id: je.id,
    fiscal_year_id: je.fiscal_year_id,
  })
  if (!corrResult.success) {
    // Propagera som strukturerat fel — outer transaction rullas tillbaka
    throw {
      code: corrResult.code,
      error: corrResult.error,
      field: corrResult.field,
    }
  }

  // Step 6: räkna om paid_amount_ore + status från SUM(payments) (M101)
  const entityTable = isInvoice ? 'invoices' : 'expenses'
  const paymentTable = isInvoice ? 'invoice_payments' : 'expense_payments'
  const fkCol = isInvoice ? 'invoice_id' : 'expense_id'
  const newStatus = isInvoice
    ? "CASE WHEN COALESCE((SELECT SUM(amount_ore) FROM invoice_payments WHERE invoice_id = :id), 0) <= 0 THEN 'unpaid' WHEN COALESCE((SELECT SUM(amount_ore) FROM invoice_payments WHERE invoice_id = :id), 0) < total_amount_ore THEN 'partial' ELSE 'paid' END"
    : "CASE WHEN COALESCE((SELECT SUM(amount_ore) FROM expense_payments WHERE expense_id = :id), 0) <= 0 THEN 'unpaid' WHEN COALESCE((SELECT SUM(amount_ore) FROM expense_payments WHERE expense_id = :id), 0) < total_amount_ore THEN 'partial' ELSE 'paid' END"
  db.prepare(
    `UPDATE ${entityTable} SET
       paid_amount_ore = COALESCE((SELECT SUM(amount_ore) FROM ${paymentTable} WHERE ${fkCol} = :id), 0),
       status = ${newStatus}
     WHERE id = :id`,
  ).run({ id: payment.invoice_or_expense_id })

  // Step 7: flippa TX-status
  db.prepare(
    `UPDATE bank_transactions SET reconciliation_status = 'unmatched' WHERE id = ?`,
  ).run(input.bank_transaction_id)

  return {
    correction_journal_entry_id: corrResult.data.correction_entry_id,
    unmatched_payment_id: paymentId,
    unmatched_fee_entry_id: null,
  }
}

function unmatchFeeTx(
  db: Database.Database,
  input: BankUnmatchInput,
  rec: ReconciliationRow,
): BankUnmatchResult {
  const feeEntryId = rec.fee_journal_entry_id
  if (feeEntryId === null) {
    throw {
      code: 'NOT_MATCHED' as ErrorCode,
      error: 'Reconciliation-raden saknar fee-referens.',
    }
  }

  const je = fetchJournalEntry(db, feeEntryId)
  if (!je) {
    throw {
      code: 'NOT_MATCHED' as ErrorCode,
      error: 'Bokföringsverifikatet hittades inte.',
    }
  }

  // Guard: stängd period
  if (!checkPeriodOpen(db, je.fiscal_year_id, je.journal_date)) {
    throw {
      code: 'PERIOD_CLOSED' as ErrorCode,
      error: `Perioden för ${je.journal_date} är stängd.`,
    }
  }

  // Guard: redan korrigerad
  if (je.corrected_by_id !== null) {
    throw {
      code: 'ENTRY_ALREADY_CORRECTED' as ErrorCode,
      error: 'Verifikatet är redan korrigerat.',
    }
  }

  // Step 3: DELETE reconciliation
  db.prepare('DELETE FROM bank_reconciliation_matches WHERE id = ?').run(rec.id)

  // Step 5: createCorrectionEntry (fee har inga dependent payments → guard #4 passerar)
  const corrResult = createCorrectionEntry(db, {
    journal_entry_id: je.id,
    fiscal_year_id: je.fiscal_year_id,
  })
  if (!corrResult.success) {
    throw {
      code: corrResult.code,
      error: corrResult.error,
      field: corrResult.field,
    }
  }

  // Step 7: flippa TX-status
  db.prepare(
    `UPDATE bank_transactions SET reconciliation_status = 'unmatched' WHERE id = ?`,
  ).run(input.bank_transaction_id)

  return {
    correction_journal_entry_id: corrResult.data.correction_entry_id,
    unmatched_payment_id: null,
    unmatched_fee_entry_id: feeEntryId,
  }
}
