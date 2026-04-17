/**
 * S58 F66-d: Bank-fee-klassificering (M153-deterministisk).
 *
 * Klassificerar en bank-transaktion som bank_fee / interest_income /
 * interest_expense baserat på:
 *  1. BkTxCd-whitelist (CHRG / INTR) → primär signal, score +100
 *  2. Counterparty-bank-heuristik (+30) + text-heuristik (+40) → sekundär
 *
 * Deterministisk: inga Date.now, Math.random, externa state-källor.
 * Heltalspoäng. Scanneras av scripts/check-m153.mjs.
 *
 * Serie-val per typ (Beslut A4, sprintA-prompt):
 *  - interest_income → A-serien (intäkt, speglar kundfaktura)
 *  - bank_fee / interest_expense → B-serien (kostnad, speglar leverantörsfaktura)
 *
 * Returnerar null om TX inte är klassificerbar → låter suggester försöka
 * match mot invoice/expense.
 */

import {
  MAX_FEE_HEURISTIC_ORE,
  FEE_SCORE_HIGH,
  FEE_SCORE_MEDIUM,
} from '../../../shared/constants'

export type FeeType = 'bank_fee' | 'interest_income' | 'interest_expense'

export type FeeMethod =
  | 'auto_fee'
  | 'auto_interest_income'
  | 'auto_interest_expense'

export interface BankTxInput {
  amount_ore: number
  counterparty_name: string | null
  remittance_info: string | null
  bank_tx_subfamily: string | null
}

export interface FeeClassification {
  type: FeeType
  account: '6570' | '8310' | '8410'
  series: 'A' | 'B'
  score: number
  confidence: 'HIGH' | 'MEDIUM'
  reasons: string[]
  method: FeeMethod
}

const BANK_NAME_RE =
  /^(bank|seb|swedbank|handelsbanken|nordea|danske|icabank|lf|länsförsäkringar)/i
// Svensk sammansättning: "Månadsavgift" innehåller "avgift" utan word-boundary.
// Substring-match är medvetet — falska positiva filtreras via beloppsgräns och confidence-tröskel.
const FEE_TEXT_RE = /(avgift|fee|charge|kostnad|serviceavgift)/i
const INTEREST_TEXT_RE = /(ränta|interest)/i

function classifyByBkTxCd(tx: BankTxInput): FeeClassification | null {
  const sub = tx.bank_tx_subfamily
  if (sub === 'CHRG') {
    return {
      type: 'bank_fee',
      account: '6570',
      series: 'B',
      score: FEE_SCORE_HIGH,
      confidence: 'HIGH',
      reasons: ['BkTxCd SubFmlyCd=CHRG'],
      method: 'auto_fee',
    }
  }
  if (sub === 'INTR') {
    if (tx.amount_ore > 0) {
      return {
        type: 'interest_income',
        account: '8310',
        series: 'A',
        score: FEE_SCORE_HIGH,
        confidence: 'HIGH',
        reasons: ['BkTxCd SubFmlyCd=INTR, positivt belopp'],
        method: 'auto_interest_income',
      }
    }
    if (tx.amount_ore < 0) {
      return {
        type: 'interest_expense',
        account: '8410',
        series: 'B',
        score: FEE_SCORE_HIGH,
        confidence: 'HIGH',
        reasons: ['BkTxCd SubFmlyCd=INTR, negativt belopp'],
        method: 'auto_interest_expense',
      }
    }
  }
  return null
}

function classifyByHeuristic(tx: BankTxInput): FeeClassification | null {
  // Heuristik bara för TX under MAX_FEE_HEURISTIC_ORE
  if (Math.abs(tx.amount_ore) > MAX_FEE_HEURISTIC_ORE) return null

  const bankHit = tx.counterparty_name
    ? BANK_NAME_RE.test(tx.counterparty_name)
    : false
  const feeHit = tx.remittance_info
    ? FEE_TEXT_RE.test(tx.remittance_info)
    : false
  const interestHit = tx.remittance_info
    ? INTEREST_TEXT_RE.test(tx.remittance_info)
    : false

  const reasons: string[] = []
  let score = 0
  if (bankHit) {
    score += 30
    reasons.push('Counterparty matchar bank-mönster')
  }

  if (interestHit) {
    score += 40
    reasons.push('Text matchar ränta')
    if (score < FEE_SCORE_MEDIUM) return null
    const confidence: 'HIGH' | 'MEDIUM' =
      score >= FEE_SCORE_HIGH ? 'HIGH' : 'MEDIUM'
    if (tx.amount_ore > 0) {
      return {
        type: 'interest_income',
        account: '8310',
        series: 'A',
        score,
        confidence,
        reasons,
        method: 'auto_interest_income',
      }
    }
    if (tx.amount_ore < 0) {
      return {
        type: 'interest_expense',
        account: '8410',
        series: 'B',
        score,
        confidence,
        reasons,
        method: 'auto_interest_expense',
      }
    }
  }

  if (feeHit) {
    score += 40
    reasons.push('Text matchar avgift')
    if (score < FEE_SCORE_MEDIUM) return null
    const confidence: 'HIGH' | 'MEDIUM' =
      score >= FEE_SCORE_HIGH ? 'HIGH' : 'MEDIUM'
    return {
      type: 'bank_fee',
      account: '6570',
      series: 'B',
      score,
      confidence,
      reasons,
      method: 'auto_fee',
    }
  }

  return null
}

/**
 * Klassificera en bank-transaktion. Returnerar null om TX inte matchar
 * fee/interest-mönster — då låter suggestern invoice/expense-matchning ta över.
 *
 * Determinism: ingen användning av Date.now, Math.random eller externa
 * state-källor. Regex är statiska (module-level). Samma input → samma output.
 */
export function classifyBankFeeTx(tx: BankTxInput): FeeClassification | null {
  // Primär: BkTxCd-whitelist (bypassar beloppsgränsen)
  const byCode = classifyByBkTxCd(tx)
  if (byCode) return byCode

  // Sekundär: heuristik (counterparty + text), med beloppsgräns
  return classifyByHeuristic(tx)
}
