import { convert } from 'xmlbuilder2'

// ═══ Types ═══

export interface ParsedBankTransaction {
  booking_date: string
  value_date: string
  amount_ore: number
  transaction_reference: string | null
  remittance_info: string | null
  counterparty_iban: string | null
  counterparty_name: string | null
  bank_transaction_code: string | null
  /** ISO 20022 BkTxCd-Domn.Cd (t.ex. 'PMNT', 'ACMT') */
  bank_tx_domain: string | null
  /** ISO 20022 BkTxCd-Domn.Fmly.Cd (t.ex. 'RCDT', 'ICDT') */
  bank_tx_family: string | null
  /** ISO 20022 BkTxCd-Domn.Fmly.SubFmlyCd (t.ex. 'CHRG', 'INTR') */
  bank_tx_subfamily: string | null
}

export interface ParsedBankStatement {
  statement_number: string
  bank_account_iban: string
  statement_date: string
  opening_balance_ore: number
  closing_balance_ore: number
  transactions: ParsedBankTransaction[]
}

export class Camt053ParseError extends Error {
  constructor(
    public code: 'VALIDATION_ERROR' | 'PARSE_ERROR',
    message: string,
    public field?: string,
  ) {
    super(message)
    this.name = 'Camt053ParseError'
  }
}

// ═══ Helpers (delade med camt054-parser per Sprint F P6) ═══

export type XmlNode = Record<string, unknown> | string | undefined

export function stripNamespace(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(stripNamespace)
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const cleanKey = k.includes(':') ? k.split(':').pop()! : k
      out[cleanKey] = stripNamespace(v)
    }
    return out
  }
  return obj
}

export function pick(node: XmlNode, path: string[]): XmlNode {
  let cur: unknown = node
  for (const p of path) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur as XmlNode
}

export function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return []
  return Array.isArray(v) ? v : [v]
}

export function text(node: XmlNode): string | null {
  if (node === undefined || node === null) return null
  if (typeof node === 'string') return node.trim()
  if (typeof node === 'object') {
    const hash = (node as Record<string, unknown>)['#']
    if (typeof hash === 'string') return hash.trim()
  }
  return null
}

export function decimalToOre(s: string): number {
  // Accepterar "1234.56", "1234", "1234.5"
  const trimmed = s.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Camt053ParseError('VALIDATION_ERROR', `Ogiltigt belopp: "${s}"`)
  }
  const negative = trimmed.startsWith('-')
  const abs = negative ? trimmed.slice(1) : trimmed
  const [kr, ore = '0'] = abs.split('.')
  if (kr.length > 13) {
    throw new Camt053ParseError(
      'VALIDATION_ERROR',
      `Belopp för stort: "${s}" (max 13 heltalssiffror)`,
    )
  }
  const oreNormalized = (ore + '00').slice(0, 2)
  const n = parseInt(kr, 10) * 100 + parseInt(oreNormalized, 10)
  return negative ? -n : n
}

// ═══ Main parser ═══

export function parseCamt053(xmlRaw: string): ParsedBankStatement {
  // Strip BOM
  const xml = xmlRaw.replace(/^\uFEFF/, '').trim()
  if (!xml) {
    throw new Camt053ParseError('PARSE_ERROR', 'Tom XML-fil.')
  }

  let parsed: unknown
  try {
    parsed = convert(xml, { format: 'object' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Camt053ParseError('PARSE_ERROR', `Kunde inte parsea XML: ${msg}`)
  }

  const cleaned = stripNamespace(parsed) as Record<string, unknown>
  const doc = cleaned.Document as Record<string, unknown> | undefined
  const stmt = pick(doc, ['BkToCstmrStmt', 'Stmt']) as
    | Record<string, unknown>
    | undefined
  if (!stmt) {
    throw new Camt053ParseError(
      'VALIDATION_ERROR',
      'Felaktig camt.053-struktur: saknar Document/BkToCstmrStmt/Stmt.',
    )
  }

  // Ett statement per import (vi stöder inte multi-statement-filer i MVP)
  const stmtNode = Array.isArray(stmt) ? stmt[0] : stmt

  // Statement-id
  const statementNumber = text(pick(stmtNode, ['Id']))
  if (!statementNumber) {
    throw new Camt053ParseError(
      'VALIDATION_ERROR',
      'Saknar Stmt/Id.',
      'statement_number',
    )
  }

  // Statement-datum (CreDtTm)
  const creDtTm = text(pick(stmtNode, ['CreDtTm']))
  if (!creDtTm) {
    throw new Camt053ParseError(
      'VALIDATION_ERROR',
      'Saknar Stmt/CreDtTm.',
      'statement_date',
    )
  }
  const statementDate = creDtTm.slice(0, 10)

  // Konto-IBAN
  const iban = text(pick(stmtNode, ['Acct', 'Id', 'IBAN']))
  if (!iban) {
    throw new Camt053ParseError(
      'VALIDATION_ERROR',
      'Saknar kontots IBAN (Acct/Id/IBAN).',
      'bank_account_iban',
    )
  }

  // Valuta — bara SEK i MVP
  const ccy = text(pick(stmtNode, ['Acct', 'Ccy']))
  if (ccy && ccy !== 'SEK') {
    throw new Camt053ParseError(
      'VALIDATION_ERROR',
      `Endast SEK stöds i nuvarande version (hittade ${ccy}).`,
      'currency',
    )
  }

  // Saldi (OPBD + CLBD)
  const bals = asArray(stmtNode.Bal as unknown)
  let opening: number | null = null
  let closing: number | null = null
  for (const bal of bals) {
    const code = text(pick(bal as XmlNode, ['Tp', 'CdOrPrtry', 'Cd']))
    const amountStr = text(pick(bal as XmlNode, ['Amt']))
    const sign = text(pick(bal as XmlNode, ['CdtDbtInd']))
    if (!amountStr || !sign) continue
    const abs = decimalToOre(amountStr)
    const signed = sign === 'CRDT' ? abs : -abs
    if (code === 'OPBD') opening = signed
    else if (code === 'CLBD') closing = signed
    // Ignorera ITBD (interim), PRCD (previous) etc.
  }
  if (opening === null) {
    throw new Camt053ParseError(
      'VALIDATION_ERROR',
      'Saknar öppningssaldo (OPBD).',
      'opening_balance_ore',
    )
  }
  if (closing === null) {
    throw new Camt053ParseError(
      'VALIDATION_ERROR',
      'Saknar slutsaldo (CLBD).',
      'closing_balance_ore',
    )
  }

  // Transaktioner
  const ntries = asArray(stmtNode.Ntry as unknown)
  const transactions: ParsedBankTransaction[] = []
  for (const entry of ntries) {
    const tx = parseNtry(entry as XmlNode)
    if (tx) transactions.push(tx)
  }

  return {
    statement_number: statementNumber,
    bank_account_iban: iban,
    statement_date: statementDate,
    opening_balance_ore: opening,
    closing_balance_ore: closing,
    transactions,
  }
}

export function parseNtry(entry: XmlNode): ParsedBankTransaction | null {
  if (!entry || typeof entry !== 'object') return null

  const amountStr = text(pick(entry, ['Amt']))
  const sign = text(pick(entry, ['CdtDbtInd']))
  if (!amountStr || !sign) {
    throw new Camt053ParseError(
      'VALIDATION_ERROR',
      'Transaktion saknar Amt eller CdtDbtInd.',
    )
  }
  const absOre = decimalToOre(amountStr)
  const amountOre = sign === 'CRDT' ? absOre : -absOre

  const bookingDate = text(pick(entry, ['BookgDt', 'Dt']))
  const valueDate = text(pick(entry, ['ValDt', 'Dt']))
  if (!bookingDate || !valueDate) {
    throw new Camt053ParseError(
      'VALIDATION_ERROR',
      'Transaktion saknar BookgDt eller ValDt.',
    )
  }

  const txRef = text(pick(entry, ['AcctSvcrRef']))
  const txCode =
    text(pick(entry, ['BkTxCd', 'Prtry', 'Cd'])) ??
    text(pick(entry, ['BkTxCd', 'Domn', 'Cd']))

  // ISO 20022 BkTxCd strukturerad hierarki (Domn/Fmly/SubFmlyCd)
  const bankTxDomain = text(pick(entry, ['BkTxCd', 'Domn', 'Cd']))
  const bankTxFamily = text(pick(entry, ['BkTxCd', 'Domn', 'Fmly', 'Cd']))
  const bankTxSubfamily = text(
    pick(entry, ['BkTxCd', 'Domn', 'Fmly', 'SubFmlyCd']),
  )

  // NtryDtls/TxDtls kan vara array (split transactions) — vi tar första
  const txDtls = (() => {
    const first = pick(entry, ['NtryDtls', 'TxDtls'])
    return Array.isArray(first) ? (first[0] as XmlNode) : (first as XmlNode)
  })()

  const counterpartyName =
    text(pick(txDtls, ['RltdPties', 'Dbtr', 'Nm'])) ??
    text(pick(txDtls, ['RltdPties', 'Cdtr', 'Nm']))

  const counterpartyIban =
    text(pick(txDtls, ['RltdPties', 'DbtrAcct', 'Id', 'IBAN'])) ??
    text(pick(txDtls, ['RltdPties', 'CdtrAcct', 'Id', 'IBAN']))

  // RmtInf/Ustrd kan vara array — joina
  const ustrd = pick(txDtls, ['RmtInf', 'Ustrd'])
  const remittanceInfo = Array.isArray(ustrd)
    ? ustrd
        .map(text)
        .filter((s): s is string => s !== null)
        .join(' ')
        .trim() || null
    : text(ustrd)

  return {
    booking_date: bookingDate,
    value_date: valueDate,
    amount_ore: amountOre,
    transaction_reference: txRef,
    remittance_info: remittanceInfo,
    counterparty_iban: counterpartyIban,
    counterparty_name: counterpartyName,
    bank_transaction_code: txCode,
    bank_tx_domain: bankTxDomain,
    bank_tx_family: bankTxFamily,
    bank_tx_subfamily: bankTxSubfamily,
  }
}
