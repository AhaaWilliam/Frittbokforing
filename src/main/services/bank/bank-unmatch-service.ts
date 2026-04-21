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

export interface BankUnmatchBatchInput {
  batch_id: number
}

export interface BankUnmatchBatchResult {
  batch_id: number
  batch_type: 'invoice' | 'expense'
  unmatched_payment_count: number
  correction_journal_entry_ids: readonly number[]
  bank_fee_correction_entry_id: number | null
}

interface BatchRow {
  id: number
  fiscal_year_id: number
  batch_type: 'invoice' | 'expense'
  bank_fee_journal_entry_id: number | null
  status: 'completed' | 'partial' | 'cancelled'
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

      if (
        rec.matched_entity_type === 'invoice' ||
        rec.matched_entity_type === 'expense'
      ) {
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

  // Guard: batch-payment — enskild unmatch blockeras, använd unmatchBankBatch.
  if (payment.payment_batch_id !== null) {
    throw {
      code: 'BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED' as ErrorCode,
      error:
        'Batch-betalningar kan inte unmatchas per rad. Ångra hela batchen istället.',
    }
  }

  const correctionId = _unmatchPaymentCore(db, {
    payment,
    isInvoice,
    bankTxId: input.bank_transaction_id,
    recId: rec.id,
  })

  return {
    correction_journal_entry_id: correctionId,
    unmatched_payment_id: paymentId,
    unmatched_fee_entry_id: null,
  }
}

/**
 * Delat mönster: DELETE reconciliation + DELETE payment + createCorrectionEntry +
 * recompute paid_amount_ore + flippa bank_tx-status.
 *
 * Runs period-closed + entry-already-corrected guards. Does NOT run batch-guard —
 * callaren är ansvarig för det (enskild unmatch blockerar, batch-unmatch släpper
 * igenom).
 */
function _unmatchPaymentCore(
  db: Database.Database,
  opts: {
    payment: PaymentRow
    isInvoice: boolean
    bankTxId: number | null
    recId: number | null
  },
): number {
  const { payment, isInvoice, bankTxId, recId } = opts

  const je = fetchJournalEntry(db, payment.journal_entry_id)
  if (!je) {
    throw {
      code: 'NOT_MATCHED' as ErrorCode,
      error: 'Bokföringsverifikatet hittades inte.',
    }
  }
  if (!checkPeriodOpen(db, je.fiscal_year_id, je.journal_date)) {
    throw {
      code: 'PERIOD_CLOSED' as ErrorCode,
      error: `Perioden för ${je.journal_date} är stängd.`,
    }
  }
  if (je.corrected_by_id !== null) {
    throw {
      code: 'ENTRY_ALREADY_CORRECTED' as ErrorCode,
      error: 'Verifikatet är redan korrigerat.',
    }
  }

  if (recId !== null) {
    db.prepare('DELETE FROM bank_reconciliation_matches WHERE id = ?').run(
      recId,
    )
  }

  const deleteSql = isInvoice
    ? 'DELETE FROM invoice_payments WHERE id = ?'
    : 'DELETE FROM expense_payments WHERE id = ?'
  db.prepare(deleteSql).run(payment.id)

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

  // Recompute paid_amount_ore + status (M101)
  const entityTable = isInvoice ? 'invoices' : 'expenses'
  const paymentTable = isInvoice ? 'invoice_payments' : 'expense_payments'
  const fkCol = isInvoice ? 'invoice_id' : 'expense_id'
  const newStatus = `CASE
    WHEN COALESCE((SELECT SUM(amount_ore) FROM ${paymentTable} WHERE ${fkCol} = :id), 0) <= 0 THEN 'unpaid'
    WHEN COALESCE((SELECT SUM(amount_ore) FROM ${paymentTable} WHERE ${fkCol} = :id), 0) < total_amount_ore THEN 'partial'
    ELSE 'paid' END`
  db.prepare(
    // dynamic-update exempt — polymorf entitets-tabell per M146 (binärt val {invoices|expenses}, ingen user-input)
    `UPDATE ${entityTable} SET
       paid_amount_ore = COALESCE((SELECT SUM(amount_ore) FROM ${paymentTable} WHERE ${fkCol} = :id), 0),
       status = ${newStatus}
     WHERE id = :id`,
  ).run({ id: payment.invoice_or_expense_id })

  if (bankTxId !== null) {
    db.prepare(
      `UPDATE bank_transactions SET reconciliation_status = 'unmatched' WHERE id = ?`,
    ).run(bankTxId)
  }

  return corrResult.data.correction_entry_id
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

/**
 * Sprint F P2 — batch-unmatch (M154 + M146 polymorfism).
 *
 * Reverserar en hel payment_batch atomärt:
 *   1. Fetch batch → dispatch per batch_type
 *   2. För varje payment i batchen: _unmatchPaymentCore (samma kärna som
 *      enskild unmatch, utan batch-guard)
 *   3. Om batchen har bank_fee_journal_entry_id: createCorrectionEntry
 *      på det (batch-level per M126)
 *   4. UPDATE payment_batches.status = 'cancelled'
 *
 * Atomicitet: hela operationen i db.transaction() — partial-failure rullar
 * tillbaka allt.
 *
 * Chronology (M142): alla N+1 C-serie-korrigeringar får samma datum (idag
 * via todayLocalFromNow i correction-service). Icke-minskande datum inom
 * samma dag är tillåtet per M142.
 *
 * pain.001-exportfilen för batchen påverkas INTE — den är redan skickad.
 * UI-lagret ansvarar för att informera användaren.
 */
export function unmatchBankBatch(
  db: Database.Database,
  input: BankUnmatchBatchInput,
): IpcResult<BankUnmatchBatchResult> {
  try {
    const result = db.transaction((): BankUnmatchBatchResult => {
      const batch = db
        .prepare(
          `SELECT id, fiscal_year_id, batch_type, bank_fee_journal_entry_id, status
           FROM payment_batches WHERE id = ?`,
        )
        .get(input.batch_id) as BatchRow | undefined

      if (!batch) {
        throw {
          code: 'NOT_FOUND' as ErrorCode,
          error: 'Betalningsbatchen hittades inte.',
        }
      }

      if (batch.status === 'cancelled') {
        throw {
          code: 'VALIDATION_ERROR' as ErrorCode,
          error: 'Batchen är redan ångrad.',
        }
      }

      const isInvoice = batch.batch_type === 'invoice'

      // Fetch all payments in batch (M146 polymorfism)
      const paymentTable = isInvoice ? 'invoice_payments' : 'expense_payments'
      const fkCol = isInvoice ? 'invoice_id' : 'expense_id'
      const paymentRows = db
        .prepare(
          `SELECT id, journal_entry_id, payment_batch_id,
                  ${fkCol} AS invoice_or_expense_id
           FROM ${paymentTable} WHERE payment_batch_id = ?
           ORDER BY id`,
        )
        .all(input.batch_id) as PaymentRow[]

      if (paymentRows.length === 0) {
        throw {
          code: 'VALIDATION_ERROR' as ErrorCode,
          error: 'Batchen har inga payments att ångra.',
        }
      }

      const correctionIds: number[] = []
      const findRec = db.prepare(
        `SELECT id, bank_transaction_id FROM bank_reconciliation_matches
         WHERE ${isInvoice ? 'invoice_payment_id' : 'expense_payment_id'} = ?`,
      )

      for (const payment of paymentRows) {
        const rec = findRec.get(payment.id) as
          | { id: number; bank_transaction_id: number }
          | undefined
        const correctionId = _unmatchPaymentCore(db, {
          payment,
          isInvoice,
          bankTxId: rec?.bank_transaction_id ?? null,
          recId: rec?.id ?? null,
        })
        correctionIds.push(correctionId)
      }

      // Korrigera bank-fee-verifikatet (M126 batch-level)
      let bankFeeCorrectionId: number | null = null
      if (batch.bank_fee_journal_entry_id !== null) {
        const feeJe = fetchJournalEntry(db, batch.bank_fee_journal_entry_id)
        if (!feeJe) {
          throw {
            code: 'VALIDATION_ERROR' as ErrorCode,
            error: 'Bank-fee-verifikatet hittades inte.',
          }
        }
        if (!checkPeriodOpen(db, feeJe.fiscal_year_id, feeJe.journal_date)) {
          throw {
            code: 'PERIOD_CLOSED' as ErrorCode,
            error: `Perioden för ${feeJe.journal_date} är stängd.`,
          }
        }
        if (feeJe.corrected_by_id !== null) {
          throw {
            code: 'ENTRY_ALREADY_CORRECTED' as ErrorCode,
            error: 'Bank-fee-verifikatet är redan korrigerat.',
          }
        }
        const corr = createCorrectionEntry(db, {
          journal_entry_id: feeJe.id,
          fiscal_year_id: feeJe.fiscal_year_id,
        })
        if (!corr.success) {
          throw {
            code: corr.code,
            error: corr.error,
            field: corr.field,
          }
        }
        bankFeeCorrectionId = corr.data.correction_entry_id
      }

      db.prepare(
        `UPDATE payment_batches SET status = 'cancelled' WHERE id = ?`,
      ).run(input.batch_id)

      return {
        batch_id: input.batch_id,
        batch_type: batch.batch_type,
        unmatched_payment_count: paymentRows.length,
        correction_journal_entry_ids: correctionIds,
        bank_fee_correction_entry_id: bankFeeCorrectionId,
      }
    })()
    return { success: true, data: result }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err) {
      const e = err as { code: ErrorCode; error: string; field?: string }
      log.error(`[bank-unmatch-batch] ${e.code}: ${e.error}`)
      return { success: false, code: e.code, error: e.error, field: e.field }
    }
    const message = err instanceof Error ? err.message : 'Okänt fel'
    log.error(`[bank-unmatch-batch] unexpected: ${message}`)
    return { success: false, code: 'UNEXPECTED_ERROR', error: message }
  }
}
