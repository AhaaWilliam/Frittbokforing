/**
 * Bank statement service — Sprint 55 F66-a.
 *
 * Import av camt.053 kontoutdrag + listning/hämtning av statements och transaktioner.
 *
 * Invarianter:
 * - UNIQUE (company_id, import_file_hash) — multi-tenant-safe
 * - opening + SUM(transactions) = closing (exakt — ingen tolerans i MVP)
 * - statement_date måste ligga inom öppet fiscal_year
 * - signed amount_ore (M152) — bank-extern rådata
 */
import type Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import type { IpcResult } from '../../../shared/types'
import {
  parseCamt053,
  Camt053ParseError,
  type ParsedBankStatement,
} from './camt053-parser'
import { parseCamt054 } from './camt054-parser'
import log from 'electron-log'

// ═══ Types ═══

export type BankStatementFormat = 'camt.053' | 'camt.054'

export interface ImportBankStatementInput {
  company_id: number
  fiscal_year_id: number
  xml_content: string
  /** Default: 'camt.053' (backward-compat med existerande call sites). */
  format?: BankStatementFormat
}

export interface ImportBankStatementResult {
  statement_id: number
  transaction_count: number
}

export interface BankStatementSummary {
  id: number
  company_id: number
  fiscal_year_id: number
  statement_number: string
  bank_account_iban: string
  statement_date: string
  opening_balance_ore: number
  closing_balance_ore: number
  transaction_count: number
  matched_count: number
  imported_at: string
}

export interface BankTransactionRow {
  id: number
  bank_statement_id: number
  booking_date: string
  value_date: string
  amount_ore: number
  transaction_reference: string | null
  remittance_info: string | null
  counterparty_iban: string | null
  counterparty_name: string | null
  bank_transaction_code: string | null
  reconciliation_status: 'unmatched' | 'matched' | 'excluded'
  /** S58 F66-e: payment_batch_id från kopplad payment-rad om matchen är en batch-betalning. UI döljer/disabler Ångra i detta fall. */
  payment_batch_id: number | null
  /** Sprint F P2: batch_type från payment_batches när payment_batch_id är satt. */
  payment_batch_type: 'invoice' | 'expense' | null
  /** Sprint F P2: antal payments i batchen (för confirm-dialog-text). */
  payment_batch_size: number | null
}

export interface BankStatementDetail {
  statement: BankStatementSummary
  transactions: BankTransactionRow[]
}

// ═══ Helpers ═══

function hashContent(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

interface FiscalYearRow {
  id: number
  company_id: number
  start_date: string
  end_date: string
  is_closed: number
}

// ═══ Public API ═══

export function importBankStatement(
  db: Database.Database,
  input: ImportBankStatementInput,
): IpcResult<ImportBankStatementResult> {
  const format: BankStatementFormat = input.format ?? 'camt.053'
  try {
    // Parse. camt.054 saknar balansdata — Path A (Sprint F P6) fyller in
    // opening=0, closing=0 för pseudo-statement. Se bank_statements-raden
    // som skapas längre ned.
    let parsed: ParsedBankStatement
    try {
      if (format === 'camt.053') {
        parsed = parseCamt053(input.xml_content)
      } else {
        const notification = parseCamt054(input.xml_content)
        // camt.054 saknar balanssummor per ISO 20022-spec. Pseudo-statement
        // med opening=0, closing=0 är en semantisk kompromiss för att
        // undvika att göra balans-kolumnerna nullable. source_format sätts
        // explicit till 'camt.054' (migration 043 utökade CHECK till
        // ('camt.053','camt.054')). Se Sprint F P6 / sprint-f-prompt.md.
        parsed = {
          statement_number: notification.statement_number,
          bank_account_iban: notification.bank_account_iban,
          statement_date: notification.statement_date,
          opening_balance_ore: 0,
          closing_balance_ore: 0,
          transactions: notification.transactions,
        }
      }
    } catch (err) {
      if (err instanceof Camt053ParseError) {
        return {
          success: false,
          code: 'VALIDATION_ERROR',
          error: err.message,
          field: err.field,
        }
      }
      throw err
    }

    // Hash
    const fileHash = hashContent(input.xml_content)

    return db.transaction(() => {
      // Hitta + validera FY
      const fy = db
        .prepare(
          'SELECT id, company_id, start_date, end_date, is_closed FROM fiscal_years WHERE id = ?',
        )
        .get(input.fiscal_year_id) as FiscalYearRow | undefined
      if (!fy) {
        return {
          success: false as const,
          code: 'VALIDATION_ERROR' as const,
          error: 'Räkenskapsåret hittades inte.',
          field: 'fiscal_year_id',
        }
      }
      if (fy.company_id !== input.company_id) {
        return {
          success: false as const,
          code: 'VALIDATION_ERROR' as const,
          error: 'Räkenskapsåret tillhör inte angivet företag.',
          field: 'fiscal_year_id',
        }
      }
      if (
        parsed.statement_date < fy.start_date ||
        parsed.statement_date > fy.end_date
      ) {
        return {
          success: false as const,
          code: 'VALIDATION_ERROR' as const,
          error: `Statement-datum ${parsed.statement_date} ligger utanför räkenskapsårets intervall (${fy.start_date} – ${fy.end_date}).`,
          field: 'statement_date',
        }
      }

      // Opening + SUM = closing — gäller bara camt.053 (statement).
      // camt.054 saknar balansdata (Path A pseudo-statement).
      if (format === 'camt.053') {
        const sum = parsed.transactions.reduce(
          (acc, tx) => acc + tx.amount_ore,
          0,
        )
        if (parsed.opening_balance_ore + sum !== parsed.closing_balance_ore) {
          return {
            success: false as const,
            code: 'VALIDATION_ERROR' as const,
            error:
              'Bankfilen är korrupt eller trunkerad — öppnings- och slutsaldo matchar inte summan av transaktioner.',
          }
        }
      }

      // Dublett (UNIQUE company_id + import_file_hash)
      const existing = db
        .prepare(
          'SELECT id FROM bank_statements WHERE company_id = ? AND import_file_hash = ?',
        )
        .get(input.company_id, fileHash) as { id: number } | undefined
      if (existing) {
        return {
          success: false as const,
          code: 'VALIDATION_ERROR' as const,
          error: 'Denna bankfil har redan importerats.',
        }
      }

      // Insert statement. source_format='camt.054' tillåtet sedan migration 043
      // (Sprint F P6) utökade CHECK till ('camt.053', 'camt.054').
      const stmtResult = db
        .prepare(
          `INSERT INTO bank_statements (
             company_id, fiscal_year_id, statement_number, bank_account_iban,
             statement_date, opening_balance_ore, closing_balance_ore,
             source_format, import_file_hash
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.company_id,
          input.fiscal_year_id,
          parsed.statement_number,
          parsed.bank_account_iban,
          parsed.statement_date,
          parsed.opening_balance_ore,
          parsed.closing_balance_ore,
          format,
          fileHash,
        )
      const statementId = Number(stmtResult.lastInsertRowid)

      // Insert transactions
      const txInsert = db.prepare(
        `INSERT INTO bank_transactions (
           bank_statement_id, booking_date, value_date, amount_ore,
           transaction_reference, remittance_info, counterparty_iban,
           counterparty_name, bank_transaction_code,
           bank_tx_domain, bank_tx_family, bank_tx_subfamily
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const tx of parsed.transactions) {
        txInsert.run(
          statementId,
          tx.booking_date,
          tx.value_date,
          tx.amount_ore,
          tx.transaction_reference,
          tx.remittance_info,
          tx.counterparty_iban,
          tx.counterparty_name,
          tx.bank_transaction_code,
          tx.bank_tx_domain,
          tx.bank_tx_family,
          tx.bank_tx_subfamily,
        )
      }

      return {
        success: true as const,
        data: {
          statement_id: statementId,
          transaction_count: parsed.transactions.length,
        },
      }
    })()
  } catch (err) {
    // Sprint E T1.a — Latent / WONTFIX: importBankStatement returnerar alla
    // inre fel som kompletta IpcResult-objekt från sin transaction, så denna
    // gren är oreachable idag. Om en framtida callpath börjar kasta
    // strukturerat {code,error} från transactionen, applicera F7f-paritet
    // (se bank-match-service.ts) och lägg till regressionstest.
    if (err && typeof err === 'object' && 'code' in err) {
      return err as IpcResult<ImportBankStatementResult>
    }
    if (err instanceof Error) {
      log.error('importBankStatement failed:', err)
      return { success: false, code: 'UNEXPECTED_ERROR', error: err.message }
    }
    log.error('importBankStatement failed (unknown):', err)
    return { success: false, code: 'UNEXPECTED_ERROR', error: 'Okänt fel.' }
  }
}

export function listBankStatements(
  db: Database.Database,
  fiscalYearId: number,
): BankStatementSummary[] {
  return db
    .prepare(
      `SELECT bs.id, bs.company_id, bs.fiscal_year_id, bs.statement_number,
              bs.bank_account_iban, bs.statement_date,
              bs.opening_balance_ore, bs.closing_balance_ore, bs.imported_at,
              (SELECT COUNT(*) FROM bank_transactions WHERE bank_statement_id = bs.id) AS transaction_count,
              (SELECT COUNT(*) FROM bank_transactions
                 WHERE bank_statement_id = bs.id AND reconciliation_status = 'matched') AS matched_count
         FROM bank_statements bs
        WHERE bs.fiscal_year_id = ?
        ORDER BY bs.statement_date DESC, bs.id DESC`,
    )
    .all(fiscalYearId) as BankStatementSummary[]
}

export function getBankStatement(
  db: Database.Database,
  statementId: number,
): BankStatementDetail | null {
  const stmt = db
    .prepare(
      `SELECT bs.id, bs.company_id, bs.fiscal_year_id, bs.statement_number,
              bs.bank_account_iban, bs.statement_date,
              bs.opening_balance_ore, bs.closing_balance_ore, bs.imported_at,
              (SELECT COUNT(*) FROM bank_transactions WHERE bank_statement_id = bs.id) AS transaction_count,
              (SELECT COUNT(*) FROM bank_transactions
                 WHERE bank_statement_id = bs.id AND reconciliation_status = 'matched') AS matched_count
         FROM bank_statements bs
        WHERE bs.id = ?`,
    )
    .get(statementId) as BankStatementSummary | undefined
  if (!stmt) return null

  const transactions = db
    .prepare(
      `SELECT bt.id, bt.bank_statement_id, bt.booking_date, bt.value_date, bt.amount_ore,
              bt.transaction_reference, bt.remittance_info, bt.counterparty_iban,
              bt.counterparty_name, bt.bank_transaction_code, bt.reconciliation_status,
              COALESCE(ip.payment_batch_id, ep.payment_batch_id) AS payment_batch_id,
              pb.batch_type AS payment_batch_type,
              CASE WHEN pb.id IS NULL THEN NULL ELSE (
                SELECT COUNT(*) FROM invoice_payments WHERE payment_batch_id = pb.id
              ) + (
                SELECT COUNT(*) FROM expense_payments WHERE payment_batch_id = pb.id
              ) END AS payment_batch_size
         FROM bank_transactions bt
         LEFT JOIN bank_reconciliation_matches brm ON brm.bank_transaction_id = bt.id
         LEFT JOIN invoice_payments ip ON ip.id = brm.invoice_payment_id
         LEFT JOIN expense_payments ep ON ep.id = brm.expense_payment_id
         LEFT JOIN payment_batches pb ON pb.id = COALESCE(ip.payment_batch_id, ep.payment_batch_id)
        WHERE bt.bank_statement_id = ?
        ORDER BY bt.value_date, bt.id`,
    )
    .all(statementId) as BankTransactionRow[]

  return { statement: stmt, transactions }
}
