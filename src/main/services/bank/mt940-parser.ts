/**
 * MT940-parser (SWIFT-textformat).
 *
 * Sprint Q (T3.d): se docs/t3d-mt940-bgc-spec.md för specifikation.
 * Används som alternativ till camt.053 för banker som ännu inte
 * migrerat till ISO 20022. Producerar `ParsedBankStatement` för
 * integration med bank-statement-service.importBankStatement.
 *
 * Format: `:NN:`-taggade segment (SWIFT-standard). Multi-statement-
 * filer hanteras genom att parse första och logga varning för rest.
 */

import type {
  ParsedBankStatement,
  ParsedBankTransaction,
} from './camt053-parser'
import { BK_TX_CODE_MAP } from './mt940-bktxcd-mapping'

export class Mt940ParseError extends Error {
  constructor(
    public code: 'VALIDATION_ERROR' | 'PARSE_ERROR' | 'UNSUPPORTED_CURRENCY',
    message: string,
    public field?: string,
  ) {
    super(message)
    this.name = 'Mt940ParseError'
  }
}

interface ParsedTag61 {
  valueDate: string
  entryDate: string
  signMarker: 'C' | 'D' | 'RC' | 'RD'
  amountOre: number
  transactionCode: string | null
  reference: string | null
}

/**
 * Konvertera YYMMDD till YYYY-MM-DD. Antar 20xx för YY.
 */
function parseShortDate(yymmdd: string): string {
  if (!/^\d{6}$/.test(yymmdd)) {
    throw new Mt940ParseError('PARSE_ERROR', `Ogiltigt datumformat: ${yymmdd}`)
  }
  const yy = parseInt(yymmdd.slice(0, 2), 10)
  const mm = yymmdd.slice(2, 4)
  const dd = yymmdd.slice(4, 6)
  return `20${yy.toString().padStart(2, '0')}-${mm}-${dd}`
}

/**
 * Konvertera decimal-sträng med komma som separator till öre.
 * Ex: "1234,56" → 123456, "1234" → 123400.
 */
function decimalWithCommaToOre(s: string): number {
  const trimmed = s.trim()
  if (!/^-?\d+(,\d+)?$/.test(trimmed)) {
    throw new Mt940ParseError(
      'VALIDATION_ERROR',
      `Ogiltigt belopp: "${s}" (förväntar siffror med kommateckens-decimal)`,
    )
  }
  const negative = trimmed.startsWith('-')
  const abs = negative ? trimmed.slice(1) : trimmed
  const [kr, ore = '0'] = abs.split(',')
  const oreNormalized = (ore + '00').slice(0, 2)
  const n = parseInt(kr, 10) * 100 + parseInt(oreNormalized, 10)
  return negative ? -n : n
}

/**
 * Parse :60F:/:62F:-format: `CYYMMDDCCCAMOUNT`
 * Ex: "C250101SEK1234567,89".
 */
function parseBalance(raw: string): {
  amountOre: number
  date: string
  currency: string
} {
  const m = /^([CD])(\d{6})([A-Z]{3})(.+)$/.exec(raw.trim())
  if (!m) {
    throw new Mt940ParseError(
      'VALIDATION_ERROR',
      `Ogiltig balans: "${raw}"`,
      'balance',
    )
  }
  const [, sign, dateStr, currency, amountStr] = m
  const date = parseShortDate(dateStr)
  const abs = decimalWithCommaToOre(amountStr)
  const amountOre = sign === 'C' ? abs : -abs
  return { amountOre, date, currency }
}

/**
 * Parse :61:-raden. Format:
 * `VALDATEENTDATE[RC/RD/C/D]AMOUNT[TYPE][REF]//[BANKREF]\n[DETAILS]`
 *
 * Exempel: `250101 0101 D 123,45 NTRF NONREF //REF2`
 */
function parseTag61(raw: string): ParsedTag61 {
  const trimmed = raw.trim().split('\n')[0]
  // Strikt MT940-spec: värdedatum (6) + optional entry-date (4) + sign
  // (1-2 inkl RC/RD) + amount (decimal med komma) + 4-char transaction-
  // type-code (alfanumerisk, börjar med bokstav) + resten är referens(er).
  const m = /^(\d{6})(\d{4})?(RC|RD|C|D)([\d,]+)([A-Z][A-Z0-9]{3})?(.*)$/.exec(
    trimmed,
  )
  if (!m) {
    throw new Mt940ParseError(
      'PARSE_ERROR',
      `Kunde inte parsea :61:-rad: "${raw}"`,
    )
  }
  const [, valDateStr, entDateStr, sign, amountStr, typeCode, rest] = m
  const valueDate = parseShortDate(valDateStr)
  const entryDate = entDateStr
    ? parseShortDate(valDateStr.slice(0, 2) + entDateStr)
    : valueDate
  const signMarker = sign as 'C' | 'D' | 'RC' | 'RD'
  const absOre = decimalWithCommaToOre(amountStr)
  const isDebit = signMarker === 'D' || signMarker === 'RC'
  const amountOre = isDebit ? -absOre : absOre

  let reference: string | null = null
  const restTrimmed = (rest ?? '').trim()
  if (restTrimmed) {
    // Format: REFERENCE[//BANKREF]. Ta första delen före `//`.
    const [primaryRef] = restTrimmed.split('//')
    const candidate = primaryRef.trim()
    if (candidate && candidate !== 'NONREF') reference = candidate
  }

  return {
    valueDate,
    entryDate,
    signMarker,
    amountOre,
    transactionCode: typeCode ?? null,
    reference,
  }
}

/**
 * Parse :86:-raden efter :61:. Söker strukturerade tags /TAG/value/.
 * Om inga tags finns returneras hela strängen som remittance_info.
 */
interface ParsedTag86 {
  counterparty_name: string | null
  counterparty_iban: string | null
  remittance_info: string | null
  transaction_code_override: string | null
}

function parseTag86(raw: string): ParsedTag86 {
  const text = raw.trim()
  if (!text) {
    return {
      counterparty_name: null,
      counterparty_iban: null,
      remittance_info: null,
      transaction_code_override: null,
    }
  }

  // Strukturerad: tags av formen /TAG/value/ eller /TAG/value\n
  const hasStructuredTags = /\/[A-Z]{3,4}\//.test(text)
  if (!hasStructuredTags) {
    // Unstructured free-text
    return {
      counterparty_name: null,
      counterparty_iban: null,
      remittance_info: text,
      transaction_code_override: null,
    }
  }

  function extractTag(tag: string): string | null {
    // /TAG/value[/] fram till nästa /TAG/ eller end-of-string.
    // Trailing `/` tolereras (delimiter vs final separator).
    const re = new RegExp(`/${tag}/([^/]+?)(?=/[A-Z]{3,4}/|/?$)`, 'i')
    const m = re.exec(text)
    return m ? m[1].trim().replace(/\s+/g, ' ') || null : null
  }

  const counterparty_name = extractTag('NAME') ?? extractTag('BENM')
  const counterparty_iban = extractTag('IBAN')
  const remittance = extractTag('REMI')
  const transaction_code_override = extractTag('TRCD')

  return {
    counterparty_name,
    counterparty_iban,
    remittance_info: remittance,
    transaction_code_override,
  }
}

/**
 * Segmentera MT940-texten på :TAG:-markörer. Returnerar array av
 * { tag, body } — body kan vara multi-line fram till nästa tag.
 */
interface Segment {
  tag: string
  body: string
}

function tokenizeSegments(text: string): Segment[] {
  // Hantera både CRLF och LF
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const segments: Segment[] = []
  const lines = normalized.split('\n')
  let currentTag: string | null = null
  let currentBody: string[] = []

  for (const line of lines) {
    const tagMatch = /^:(\d{2}[A-Z]?):\s*(.*)$/.exec(line)
    if (tagMatch) {
      if (currentTag !== null) {
        segments.push({ tag: currentTag, body: currentBody.join('\n').trim() })
      }
      currentTag = tagMatch[1]
      currentBody = [tagMatch[2]]
    } else if (currentTag !== null) {
      // Continuation of current tag's body (t.ex. :86:-multiline)
      currentBody.push(line)
    }
    // Lines before first tag (block 1/2/3 SWIFT-header eller `-}`) ignoreras
  }
  if (currentTag !== null) {
    segments.push({ tag: currentTag, body: currentBody.join('\n').trim() })
  }
  return segments
}

/**
 * Huvudparser: MT940-text → ParsedBankStatement.
 */
export function parseMt940(raw: string): ParsedBankStatement {
  const stripped = raw.replace(/^\uFEFF/, '').trim()
  if (!stripped) {
    throw new Mt940ParseError('PARSE_ERROR', 'Tom MT940-fil.')
  }

  // Hoppa över SWIFT-header-block 1-3 om de finns (börjar med {1:, {2:, {3:)
  // och extrahera block 4 eller hela texten om ingen header.
  let body = stripped
  const block4Match = /\{4:\s*([\s\S]*?)(?:-})/.exec(stripped)
  if (block4Match) body = block4Match[1]

  const segments = tokenizeSegments(body)

  let statementNumber: string | null = null
  let account: string | null = null
  let opening: { amountOre: number; date: string; currency: string } | null =
    null
  let closing: { amountOre: number; date: string; currency: string } | null =
    null
  const transactions: ParsedBankTransaction[] = []

  // Gruppera :61: + följande :86:-rad (om finns)
  let pendingTx: ParsedTag61 | null = null

  for (const { tag, body: segBody } of segments) {
    switch (tag) {
      case '20':
        statementNumber = segBody.trim() || null
        break
      case '25':
        account = segBody.trim()
        break
      case '28C':
        // Statement sequence number — ignoreras i MVP
        break
      case '60F':
        opening = parseBalance(segBody)
        break
      case '62F':
        closing = parseBalance(segBody)
        break
      case '64':
        // Available balance — ignoreras (vi använder 62F som closing)
        break
      case '61': {
        if (pendingTx) {
          // Tidigare :61: utan :86: → flusha utan details
          transactions.push(finalizeTx(pendingTx, null))
        }
        pendingTx = parseTag61(segBody)
        break
      }
      case '86': {
        if (pendingTx) {
          transactions.push(finalizeTx(pendingTx, parseTag86(segBody)))
          pendingTx = null
        }
        break
      }
      default:
        // Okända tags ignoreras tolerant (vissa banker lägger egna)
        break
    }
  }
  // Flush eventuell pending :61: utan :86:
  if (pendingTx) {
    transactions.push(finalizeTx(pendingTx, null))
  }

  if (!statementNumber) {
    throw new Mt940ParseError(
      'VALIDATION_ERROR',
      'Saknar obligatorisk tag :20: (statement reference).',
      'statement_number',
    )
  }
  if (!opening) {
    throw new Mt940ParseError(
      'VALIDATION_ERROR',
      'Saknar obligatorisk tag :60F: (opening balance).',
      'opening_balance_ore',
    )
  }
  if (!closing) {
    throw new Mt940ParseError(
      'VALIDATION_ERROR',
      'Saknar obligatorisk tag :62F: (closing balance).',
      'closing_balance_ore',
    )
  }
  if (opening.currency !== 'SEK' || closing.currency !== 'SEK') {
    throw new Mt940ParseError(
      'UNSUPPORTED_CURRENCY',
      `Endast SEK stöds (hittade ${opening.currency}/${closing.currency}).`,
      'currency',
    )
  }
  if (!account) {
    throw new Mt940ParseError(
      'VALIDATION_ERROR',
      'Saknar obligatorisk tag :25: (account identification).',
      'bank_account_iban',
    )
  }

  return {
    statement_number: statementNumber,
    bank_account_iban: account,
    statement_date: closing.date,
    opening_balance_ore: opening.amountOre,
    closing_balance_ore: closing.amountOre,
    transactions,
  }
}

function finalizeTx(
  tag61: ParsedTag61,
  tag86: ParsedTag86 | null,
): ParsedBankTransaction {
  const effectiveCode =
    tag86?.transaction_code_override ?? tag61.transactionCode
  const mapping = effectiveCode ? BK_TX_CODE_MAP[effectiveCode] : undefined

  return {
    booking_date: tag61.entryDate,
    value_date: tag61.valueDate,
    amount_ore: tag61.amountOre,
    transaction_reference: tag61.reference,
    remittance_info: tag86?.remittance_info ?? null,
    counterparty_iban: tag86?.counterparty_iban ?? null,
    counterparty_name: tag86?.counterparty_name ?? null,
    bank_transaction_code: effectiveCode,
    bank_tx_domain: mapping?.domain ?? null,
    bank_tx_family: mapping?.family ?? null,
    bank_tx_subfamily: mapping?.subfamily ?? null,
  }
}
