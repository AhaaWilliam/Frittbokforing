/**
 * Bank match service — Sprint 55 F66-a.
 *
 * Manuell matchning av bank-transaktion mot öppen invoice/expense.
 *
 * Regler:
 * - Direction-guard: +TX (inkommande) → endast invoice, −TX → endast expense.
 * - Ingen bank-fee-parameter (MVP): diff ≤ 50 öre = M99 öresutjämning, annat VALIDATION_ERROR.
 * - payment_date = value_date (svensk praxis, M142-konsistens).
 * - skipChronologyCheck=true till _payInvoiceTx/_payExpenseTx efter batch-level guard.
 *   (Single-match: vi validerar kronologin via _payXTx när skip=false. Match = single =
 *   guard körs via samma path som vanlig payment.)
 */
import type Database from 'better-sqlite3'
import log from 'electron-log'
import type { IpcResult, ErrorCode } from '../../../shared/types'
import { _payInvoiceTx } from '../invoice-service'
import { _payExpenseTx } from '../expense-service'
import { normalizeIban } from './bank-match-suggester'

// ═══ Types ═══

export interface MatchBankTransactionInput {
  bank_transaction_id: number
  matched_entity_type: 'invoice' | 'expense'
  matched_entity_id: number
  payment_account: string
}

export interface MatchBankTransactionResult {
  payment_id: number
  journal_entry_id: number
}

interface BankTxRow {
  id: number
  amount_ore: number
  value_date: string
  reconciliation_status: 'unmatched' | 'matched' | 'excluded'
  counterparty_iban: string | null
}

// ═══ Public API ═══

export function matchBankTransaction(
  db: Database.Database,
  input: MatchBankTransactionInput,
): IpcResult<MatchBankTransactionResult> {
  try {
    return db.transaction(() => {
      // 1. Hämta + validera bank-transaktion
      const tx = db
        .prepare(
          'SELECT id, amount_ore, value_date, reconciliation_status, counterparty_iban FROM bank_transactions WHERE id = ?',
        )
        .get(input.bank_transaction_id) as BankTxRow | undefined
      if (!tx) {
        return {
          success: false as const,
          code: 'VALIDATION_ERROR' as const,
          error: 'Bank-transaktionen hittades inte.',
          field: 'bank_transaction_id',
        }
      }
      if (tx.reconciliation_status !== 'unmatched') {
        return {
          success: false as const,
          code: 'VALIDATION_ERROR' as const,
          error: 'Transaktionen är redan matchad eller exkluderad.',
          field: 'bank_transaction_id',
        }
      }

      // 2. Direction-guard
      if (tx.amount_ore > 0 && input.matched_entity_type !== 'invoice') {
        return {
          success: false as const,
          code: 'VALIDATION_ERROR' as const,
          error: 'Inkommande betalning kan endast matchas mot en kundfaktura.',
          field: 'matched_entity_type',
        }
      }
      if (tx.amount_ore < 0 && input.matched_entity_type !== 'expense') {
        return {
          success: false as const,
          code: 'VALIDATION_ERROR' as const,
          error:
            'Utgående betalning kan endast matchas mot en leverantörsfaktura.',
          field: 'matched_entity_type',
        }
      }

      // 3. Anropa _payXTx med absolut belopp
      const absAmount = Math.abs(tx.amount_ore)
      let payment_id: number
      let journal_entry_id: number
      try {
        if (input.matched_entity_type === 'invoice') {
          const res = _payInvoiceTx(db, {
            invoice_id: input.matched_entity_id,
            amount_ore: absAmount,
            payment_date: tx.value_date,
            payment_method: 'bank_match',
            account_number: input.payment_account,
          })
          payment_id = res.payment.id
          journal_entry_id = res.journalEntryId
        } else {
          const res = _payExpenseTx(db, {
            expense_id: input.matched_entity_id,
            amount_ore: absAmount,
            payment_date: tx.value_date,
            payment_method: 'bank_match',
            account_number: input.payment_account,
          })
          payment_id = res.payment.id
          journal_entry_id = res.journalEntryId
        }
      } catch (err) {
        // _payXTx kastar strukturerade { code, error, field? } — re-throw
        // så yttre catch kan wrappa som IpcResult. Return av raw struct
        // från db.transaction-callback saknar `success`-fält, vilket
        // wrapIpcHandler.isIpcResult missar → fel-objektet skulle
        // felklassificeras som data.
        throw err
      }

      // 4. Skapa reconciliation-raden (split polymorphic FK)
      db.prepare(
        `INSERT INTO bank_reconciliation_matches (
           bank_transaction_id, matched_entity_type, matched_entity_id,
           invoice_payment_id, expense_payment_id, match_method
         ) VALUES (?, ?, ?, ?, ?, 'manual')`,
      ).run(
        input.bank_transaction_id,
        input.matched_entity_type,
        input.matched_entity_id,
        input.matched_entity_type === 'invoice' ? payment_id : null,
        input.matched_entity_type === 'expense' ? payment_id : null,
      )

      // 4b. F66-c (Sprint 57 D1): opportunistisk auto-uppdatering av
      // counterparties.bank_account när TX har IBAN och counterparty saknar det.
      // Wrappas i lokal try-catch — får ALDRIG blockera själva matchen.
      if (tx.counterparty_iban) {
        try {
          const ibanNorm = normalizeIban(tx.counterparty_iban)
          const cpRow =
            input.matched_entity_type === 'invoice'
              ? (db
                  .prepare(
                    `SELECT c.id, c.bank_account
                     FROM counterparties c
                     JOIN invoices i ON i.counterparty_id = c.id
                     WHERE i.id = ?`,
                  )
                  .get(input.matched_entity_id) as
                  | { id: number; bank_account: string | null }
                  | undefined)
              : (db
                  .prepare(
                    `SELECT c.id, c.bank_account
                     FROM counterparties c
                     JOIN expenses e ON e.counterparty_id = c.id
                     WHERE e.id = ?`,
                  )
                  .get(input.matched_entity_id) as
                  | { id: number; bank_account: string | null }
                  | undefined)

          if (cpRow && !cpRow.bank_account) {
            db.prepare(
              'UPDATE counterparties SET bank_account = ? WHERE id = ?',
            ).run(ibanNorm, cpRow.id)
          } else if (
            cpRow &&
            cpRow.bank_account &&
            normalizeIban(cpRow.bank_account) !== ibanNorm
          ) {
            log.warn(
              `F66-c: IBAN-konflikt för counterparty ${cpRow.id}: ${cpRow.bank_account} vs ${tx.counterparty_iban} — skriver inte över`,
            )
          }
        } catch (err) {
          log.warn(
            `F66-c: auto-update misslyckades för TX ${tx.id}: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }

      // 5. Flippa status
      db.prepare(
        "UPDATE bank_transactions SET reconciliation_status = 'matched' WHERE id = ?",
      ).run(input.bank_transaction_id)

      return {
        success: true as const,
        data: { payment_id, journal_entry_id },
      }
    })()
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err) {
      const se = err as { code: ErrorCode; error?: string; field?: string }
      return {
        success: false,
        code: se.code,
        error: se.error ?? 'Matchning misslyckades.',
        ...(se.field != null ? { field: se.field } : {}),
      }
    }
    if (err instanceof Error) {
      log.error('matchBankTransaction failed:', err)
      return { success: false, code: 'UNEXPECTED_ERROR', error: err.message }
    }
    log.error('matchBankTransaction failed (unknown):', err)
    return { success: false, code: 'UNEXPECTED_ERROR', error: 'Okänt fel.' }
  }
}
