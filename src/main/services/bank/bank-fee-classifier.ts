/**
 * S58 F66-d: Bank-fee-klassificering (M153-deterministisk).
 *
 * Klassificerar en bank-transaktion som bank_fee / interest_income /
 * interest_expense baserat på:
 *  1. BkTxCd-mapping (DB-tabell bank_tx_code_mappings per Sprint F P4) →
 *     primär signal, score +100. Seed: PMNT/CCRD/CHRG → bank_fee,
 *     PMNT/CCRD/INTR → interest (income/expense härleds från beloppstecken).
 *  2. Counterparty-bank-heuristik (+30) + text-heuristik (+40) → sekundär
 *
 * Deterministisk: inga Date.now, Math.random, externa state-källor.
 * Mappningar läses från DB men cachas per db-instans — cache invalideras
 * explicit via invalidateClassifierCache(db) när en mapping ändras.
 * Heltalspoäng. Scanneras av scripts/check-m153.mjs.
 *
 * Serie-val per typ (Beslut A4, sprintA-prompt):
 *  - interest_income → A-serien (intäkt, speglar kundfaktura)
 *  - bank_fee / interest_expense → B-serien (kostnad, speglar leverantörsfaktura)
 *
 * Returnerar null om TX inte är klassificerbar → låter suggester försöka
 * match mot invoice/expense.
 */

import type Database from 'better-sqlite3'
import {
  MAX_FEE_HEURISTIC_ORE,
  FEE_SCORE_HIGH,
  FEE_SCORE_MEDIUM,
} from '../../../shared/constants'
import { lookupBankByIban } from './iban-bank-registry'

export type FeeType = 'bank_fee' | 'interest_income' | 'interest_expense'

export type FeeMethod =
  | 'auto_fee'
  | 'auto_interest_income'
  | 'auto_interest_expense'

export type MappingClassification = 'bank_fee' | 'interest' | 'ignore'

export interface BankTxInput {
  amount_ore: number
  counterparty_name: string | null
  counterparty_iban: string | null
  remittance_info: string | null
  bank_tx_domain: string | null
  bank_tx_family: string | null
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

interface MappingRow {
  domain: string
  family: string
  subfamily: string
  classification: MappingClassification
  account_number: string | null
}

type MappingKey = string // `${domain}|${family}|${subfamily}`
type MappingCache = Map<MappingKey, MappingRow>

// Cache per db-instans (WeakMap så GC'd db:er inte läcker)
const cachePerDb = new WeakMap<Database.Database, MappingCache>()

function mappingKey(
  domain: string,
  family: string,
  subfamily: string,
): MappingKey {
  return `${domain}|${family}|${subfamily}`
}

function loadMappings(db: Database.Database): MappingCache {
  const existing = cachePerDb.get(db)
  if (existing) return existing
  const rows = db
    .prepare(
      `SELECT domain, family, subfamily, classification, account_number
       FROM bank_tx_code_mappings`,
    )
    .all() as MappingRow[]
  const map: MappingCache = new Map()
  for (const r of rows) {
    map.set(mappingKey(r.domain, r.family, r.subfamily), r)
  }
  cachePerDb.set(db, map)
  return map
}

/**
 * Invalidera mapping-cachen för db-instansen. Anropas av IPC-handlers för
 * upsert/delete så nästa klassificering läser fresh data. M153: cache-
 * invalidering är deterministisk — samma db-state + samma input ger samma
 * output efter invalidation.
 */
export function invalidateClassifierCache(db: Database.Database): void {
  cachePerDb.delete(db)
}

const BANK_NAME_RE =
  /^(bank|seb|swedbank|handelsbanken|nordea|danske|icabank|lf|länsförsäkringar)/i
// Svensk sammansättning: "Månadsavgift" innehåller "avgift" utan word-boundary.
// Substring-match är medvetet — falska positiva filtreras via beloppsgräns och confidence-tröskel.
const FEE_TEXT_RE = /(avgift|fee|charge|kostnad|serviceavgift)/i
const INTEREST_TEXT_RE = /(ränta|interest)/i

function classifyByBkTxCd(
  db: Database.Database,
  tx: BankTxInput,
): FeeClassification | null {
  if (!tx.bank_tx_domain || !tx.bank_tx_family || !tx.bank_tx_subfamily) {
    return null
  }
  const mappings = loadMappings(db)
  const mapping = mappings.get(
    mappingKey(tx.bank_tx_domain, tx.bank_tx_family, tx.bank_tx_subfamily),
  )
  if (!mapping || mapping.classification === 'ignore') return null

  const codeRef = `${tx.bank_tx_domain}/${tx.bank_tx_family}/${tx.bank_tx_subfamily}`

  if (mapping.classification === 'bank_fee') {
    return {
      type: 'bank_fee',
      account: '6570',
      series: 'B',
      score: FEE_SCORE_HIGH,
      confidence: 'HIGH',
      reasons: [`BkTxCd ${codeRef}`],
      method: 'auto_fee',
    }
  }

  // classification === 'interest' — income/expense härleds från belopp
  if (tx.amount_ore > 0) {
    return {
      type: 'interest_income',
      account: '8310',
      series: 'A',
      score: FEE_SCORE_HIGH,
      confidence: 'HIGH',
      reasons: [`BkTxCd ${codeRef}, positivt belopp`],
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
      reasons: [`BkTxCd ${codeRef}, negativt belopp`],
      method: 'auto_interest_expense',
    }
  }
  return null
}

function classifyByHeuristic(tx: BankTxInput): FeeClassification | null {
  // Heuristik bara för TX under MAX_FEE_HEURISTIC_ORE
  if (Math.abs(tx.amount_ore) > MAX_FEE_HEURISTIC_ORE) return null

  const bankByName = tx.counterparty_name
    ? BANK_NAME_RE.test(tx.counterparty_name)
    : false
  const bankByIban = lookupBankByIban(tx.counterparty_iban) !== null
  const bankHit = bankByName || bankByIban
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
    reasons.push(
      bankByIban
        ? 'IBAN-prefix matchar svensk bank'
        : 'Counterparty matchar bank-mönster',
    )
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
 * state-källor. Regex är statiska (module-level). Mapping-cachen per
 * db-instans invalideras explicit vid mutation via
 * invalidateClassifierCache(db).
 */
export function classifyBankFeeTx(
  db: Database.Database,
  tx: BankTxInput,
): FeeClassification | null {
  // Primär: BkTxCd-mapping från DB (bypassar beloppsgränsen)
  const byCode = classifyByBkTxCd(db, tx)
  if (byCode) return byCode

  // Sekundär: heuristik (counterparty + text), med beloppsgräns
  return classifyByHeuristic(tx)
}
