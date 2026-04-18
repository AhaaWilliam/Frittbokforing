/**
 * Bank match suggester — Sprint 56 F66-b.
 *
 * Deterministisk scoring-algoritm som föreslår invoice/expense-matchningar
 * för omatchade bank-transaktioner i ett bank statement.
 *
 * Regler (M153):
 * - Heltalspoäng (inga floats i score/thresholds)
 * - Deterministisk (ingen random/Date.now/performance.now)
 * - Ren funktion (samma input → samma output)
 *
 * Klassificering:
 * - HIGH: score >= 130 OCH unik topp (ingen tie)
 * - MEDIUM: score >= 80 (eller HIGH-kandidat i tie)
 * - LOW: < 80 → filtreras bort
 *
 * Tie-break (efter score DESC):
 * - Invoice: due_date ASC, sedan id ASC
 * - Expense: expense_date ASC, sedan id ASC
 *
 * Direction-guard: +TX → invoices, −TX → expenses.
 */
import type Database from 'better-sqlite3'
import log from 'electron-log'
import type { IpcResult } from '../../../shared/types'
import {
  classifyBankFeeTx,
  type FeeMethod,
  type FeeType,
} from './bank-fee-classifier'

// ═══ Types ═══

export type MatchMethod =
  | 'auto_iban'
  | 'auto_amount_ref'
  | 'auto_amount_date'
  | 'auto_amount_exact'
  | FeeMethod

export type MatchConfidence = 'HIGH' | 'MEDIUM'

/** Invoice/expense-candidat — befintlig form. */
export interface EntityMatchCandidate {
  entity_type: 'invoice' | 'expense'
  entity_id: number
  entity_number: string | null
  counterparty_name: string | null
  total_amount_ore: number
  remaining_ore: number
  entity_date: string
  due_date: string | null
  score: number
  confidence: MatchConfidence
  method: MatchMethod
  /** Runtime-only — persisteras INTE (F5). */
  reasons: string[]
}

/** S58 F66-d: fee-candidat för auto-klassificerade bank-avgifter/ränta. */
export interface FeeMatchCandidate {
  entity_type: FeeType // 'bank_fee' | 'interest_income' | 'interest_expense'
  account: '6570' | '8310' | '8410'
  series: 'A' | 'B'
  amount_ore: number
  score: number
  confidence: MatchConfidence
  method: FeeMethod
  reasons: string[]
}

export type MatchCandidate = EntityMatchCandidate | FeeMatchCandidate

export interface TxSuggestion {
  bank_transaction_id: number
  /** Max 5 candidates, sorterade på score DESC + tie-break. Kan vara tom. */
  candidates: MatchCandidate[]
}

interface BankTxRow {
  id: number
  amount_ore: number
  value_date: string
  remittance_info: string | null
  counterparty_iban: string | null
  counterparty_name: string | null
  bank_tx_domain: string | null
  bank_tx_family: string | null
  bank_tx_subfamily: string | null
}

interface InvoiceCandidateRow {
  id: number
  invoice_number: string
  invoice_date: string
  due_date: string | null
  total_amount_ore: number
  paid_amount_ore: number
  ocr_number: string | null
  counterparty_name: string | null
  counterparty_iban: string | null
}

interface ExpenseCandidateRow {
  id: number
  supplier_invoice_number: string | null
  expense_date: string
  due_date: string | null
  total_amount_ore: number
  paid_amount_ore: number
  counterparty_name: string | null
  counterparty_iban: string | null
}

// ═══ Pure helpers (M153 — deterministisk + ren) ═══

export function normalizeIban(iban: string): string {
  return iban.replace(/\s/g, '').toUpperCase()
}

export function daysBetween(a: string, b: string): number {
  // YYYY-MM-DD strings → millis. UTC-anchor undviker DST-edge.
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)
  return Math.abs(Math.round(ms / 86_400_000))
}

interface ScoringInput {
  txAmountOre: number
  txValueDate: string
  txRemittanceInfo: string | null
  txCounterpartyIban: string | null
  candRemainingOre: number
  candDate: string
  candCounterpartyIban: string | null
  candNumber: string | null
  candOcrNumber: string | null
}

export function computeScore(s: ScoringInput): {
  score: number
  reasons: string[]
  method: MatchMethod
} {
  let score = 0
  const reasons: string[] = []
  const absAmount = Math.abs(s.txAmountOre)
  const diff = Math.abs(absAmount - s.candRemainingOre)

  // Belopps-signal (max en)
  let hasAmountExact = false
  if (diff === 0) {
    score += 100
    reasons.push('Belopp exakt match')
    hasAmountExact = true
  } else if (diff <= 50 && s.candRemainingOre > 0) {
    score += 60
    reasons.push('Belopp inom 50 öre')
  }

  // Datum-signal (max en)
  const days = daysBetween(s.txValueDate, s.candDate)
  let hasDateExact = false
  if (days === 0) {
    score += 30
    reasons.push('Samma datum')
    hasDateExact = true
  } else if (days <= 3) {
    score += 25
    reasons.push(`Datum inom 3 dagar (${days})`)
  } else if (days <= 7) {
    score += 15
    reasons.push(`Datum inom 7 dagar (${days})`)
  } else if (days <= 30) {
    score += 5
    reasons.push(`Datum inom 30 dagar (${days})`)
  }

  // IBAN-match
  let hasIban = false
  if (
    s.txCounterpartyIban &&
    s.candCounterpartyIban &&
    normalizeIban(s.txCounterpartyIban) ===
      normalizeIban(s.candCounterpartyIban)
  ) {
    score += 50
    reasons.push('IBAN match')
    hasIban = true
  }

  // Ref-match (invoice_number ELLER ocr_number)
  let hasRef = false
  if (s.txRemittanceInfo) {
    if (s.candNumber && s.txRemittanceInfo.includes(s.candNumber)) {
      score += 40
      reasons.push('Referens i meddelande')
      hasRef = true
    } else if (
      s.candOcrNumber &&
      s.txRemittanceInfo.includes(s.candOcrNumber)
    ) {
      score += 40
      reasons.push('OCR i meddelande')
      hasRef = true
    }
  }

  // Method (starkaste signalen)
  let method: MatchMethod
  if (hasIban) method = 'auto_iban'
  else if (hasRef) method = 'auto_amount_ref'
  else if (hasDateExact && hasAmountExact) method = 'auto_amount_date'
  else method = 'auto_amount_exact'

  return { score, reasons, method }
}

/**
 * Sortera + klassa candidates. Klassificering sker FÖRE tie-breaking (K5):
 * om flera candidates har samma top-score → alla blir MEDIUM.
 * Returnerar max 5, sorterade på score DESC + tie-break, med confidence-fält.
 */
type EntityCandidateNoConfidence = Omit<EntityMatchCandidate, 'confidence'>

function tieBreakKey(c: MatchCandidate | EntityCandidateNoConfidence): string {
  if (c.entity_type === 'invoice' || c.entity_type === 'expense') {
    const dateA =
      c.entity_type === 'invoice' ? (c.due_date ?? '') : c.entity_date
    return `${dateA}:${c.entity_id}`
  }
  const fee = c as FeeMatchCandidate
  return `fee:${fee.entity_type}:${fee.account}:${fee.amount_ore}`
}

/**
 * Klassa entity-candidates (invoice/expense) + lägg till färdig-klassade
 * fee-candidates. Entity-confidence beräknas här (K5-logik), fee-confidence
 * är förbestämd av classifier.
 */
export function classifyCandidates(
  entityCandidates: EntityCandidateNoConfidence[],
  feeCandidates: FeeMatchCandidate[] = [],
): MatchCandidate[] {
  const hasEntities = entityCandidates.length > 0
  const entityTop = hasEntities
    ? Math.max(...entityCandidates.map((c) => c.score))
    : 0
  const entityTopTieCount = entityCandidates.filter(
    (c) => c.score === entityTop,
  ).length
  const entityUniqueTop = entityTopTieCount === 1

  const classed: MatchCandidate[] = []
  for (const c of entityCandidates) {
    let confidence: MatchConfidence | null
    if (c.score >= 130 && entityUniqueTop && c.score === entityTop)
      confidence = 'HIGH'
    else if (c.score >= 80) confidence = 'MEDIUM'
    else confidence = null
    if (confidence !== null) classed.push({ ...c, confidence })
  }
  for (const f of feeCandidates) classed.push(f)

  // Gemensam ranking (fee + entity) på score DESC + deterministisk tie-break
  classed.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return tieBreakKey(a).localeCompare(tieBreakKey(b))
  })

  return classed.slice(0, 5)
}

// ═══ Public API ═══

export function suggestMatchesForStatement(
  db: Database.Database,
  statementId: number,
): IpcResult<TxSuggestion[]> {
  try {
    const stmt = db
      .prepare(
        'SELECT id, company_id, fiscal_year_id FROM bank_statements WHERE id = ?',
      )
      .get(statementId) as
      | { id: number; company_id: number; fiscal_year_id: number }
      | undefined
    if (!stmt) {
      return {
        success: false,
        code: 'VALIDATION_ERROR',
        error: 'Bank statement hittades inte.',
        field: 'statement_id',
      }
    }

    const txs = db
      .prepare(
        `SELECT id, amount_ore, value_date, remittance_info, counterparty_iban,
                counterparty_name, bank_tx_domain, bank_tx_family, bank_tx_subfamily
         FROM bank_transactions
         WHERE bank_statement_id = ? AND reconciliation_status = 'unmatched'`,
      )
      .all(statementId) as BankTxRow[]

    if (txs.length === 0) {
      return { success: true, data: [] }
    }

    // Hämta öppna invoices + expenses en gång (inom samma FY)
    const openInvoices = db
      .prepare(
        `SELECT i.id, i.invoice_number, i.invoice_date, i.due_date,
                i.total_amount_ore, i.paid_amount_ore, i.ocr_number,
                c.name AS counterparty_name, c.bank_account AS counterparty_iban
         FROM invoices i
         LEFT JOIN counterparties c ON c.id = i.counterparty_id
         WHERE i.fiscal_year_id = ?
           AND i.status IN ('unpaid', 'partial')
           AND i.invoice_type = 'customer_invoice'`,
      )
      .all(stmt.fiscal_year_id) as InvoiceCandidateRow[]

    const openExpenses = db
      .prepare(
        `SELECT e.id, e.supplier_invoice_number, e.expense_date, e.due_date,
                e.total_amount_ore, e.paid_amount_ore,
                c.name AS counterparty_name, c.bank_account AS counterparty_iban
         FROM expenses e
         LEFT JOIN counterparties c ON c.id = e.counterparty_id
         WHERE e.fiscal_year_id = ?
           AND e.status IN ('unpaid', 'partial')
           AND e.expense_type = 'normal'`,
      )
      .all(stmt.fiscal_year_id) as ExpenseCandidateRow[]

    const suggestions: TxSuggestion[] = txs.map((tx) => {
      const entityCandidates: EntityCandidateNoConfidence[] = []

      // S58 F66-d: fee-klassificering FÖRE invoice/expense-loop
      const feeClass = classifyBankFeeTx(db, {
        amount_ore: tx.amount_ore,
        counterparty_name: tx.counterparty_name,
        remittance_info: tx.remittance_info,
        bank_tx_domain: tx.bank_tx_domain,
        bank_tx_family: tx.bank_tx_family,
        bank_tx_subfamily: tx.bank_tx_subfamily,
      })
      const feeCandidates: FeeMatchCandidate[] = feeClass
        ? [
            {
              entity_type: feeClass.type,
              account: feeClass.account,
              series: feeClass.series,
              amount_ore: Math.abs(tx.amount_ore),
              score: feeClass.score,
              confidence: feeClass.confidence,
              method: feeClass.method,
              reasons: feeClass.reasons,
            },
          ]
        : []

      if (tx.amount_ore > 0) {
        // Invoice direction
        for (const inv of openInvoices) {
          const remaining = inv.total_amount_ore - inv.paid_amount_ore
          if (remaining <= 0) continue
          const { score, reasons, method } = computeScore({
            txAmountOre: tx.amount_ore,
            txValueDate: tx.value_date,
            txRemittanceInfo: tx.remittance_info,
            txCounterpartyIban: tx.counterparty_iban,
            candRemainingOre: remaining,
            candDate: inv.invoice_date,
            candCounterpartyIban: inv.counterparty_iban,
            candNumber: inv.invoice_number,
            candOcrNumber: inv.ocr_number,
          })
          if (score >= 80) {
            entityCandidates.push({
              entity_type: 'invoice',
              entity_id: inv.id,
              entity_number: inv.invoice_number,
              counterparty_name: inv.counterparty_name,
              total_amount_ore: inv.total_amount_ore,
              remaining_ore: remaining,
              entity_date: inv.invoice_date,
              due_date: inv.due_date,
              score,
              method,
              reasons,
            })
          }
        }
      } else if (tx.amount_ore < 0) {
        for (const exp of openExpenses) {
          const remaining = exp.total_amount_ore - exp.paid_amount_ore
          if (remaining <= 0) continue
          const { score, reasons, method } = computeScore({
            txAmountOre: tx.amount_ore,
            txValueDate: tx.value_date,
            txRemittanceInfo: tx.remittance_info,
            txCounterpartyIban: tx.counterparty_iban,
            candRemainingOre: remaining,
            candDate: exp.expense_date,
            candCounterpartyIban: exp.counterparty_iban,
            candNumber: exp.supplier_invoice_number,
            candOcrNumber: null,
          })
          if (score >= 80) {
            entityCandidates.push({
              entity_type: 'expense',
              entity_id: exp.id,
              entity_number: exp.supplier_invoice_number,
              counterparty_name: exp.counterparty_name,
              total_amount_ore: exp.total_amount_ore,
              remaining_ore: remaining,
              entity_date: exp.expense_date,
              due_date: exp.due_date,
              score,
              method,
              reasons,
            })
          }
        }
      }

      return {
        bank_transaction_id: tx.id,
        candidates: classifyCandidates(entityCandidates, feeCandidates),
      }
    })

    return { success: true, data: suggestions }
  } catch (err) {
    if (err instanceof Error) {
      log.error('suggestMatchesForStatement failed:', err)
      return { success: false, code: 'UNEXPECTED_ERROR', error: err.message }
    }
    log.error('suggestMatchesForStatement failed (unknown):', err)
    return { success: false, code: 'UNEXPECTED_ERROR', error: 'Okänt fel.' }
  }
}
