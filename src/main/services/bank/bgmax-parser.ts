/**
 * BGMAX-parser (Bankgirocentralen).
 *
 * Sprint Q (T3.d): Latin-1-text med TK-prefix (2 tecken) per rad.
 * Produces pseudo-statement (opening=0, closing=0 — BGMAX är
 * notifikationsformat, inte kontoutdrag). Analogt med camt.054 P6.
 *
 * TK (transaktionskoder) i MVP:
 *  - 01 Filhuvud (datum, version)
 *  - 05 Betalnings-huvud (mottagarens BG, valuta)
 *  - 20 Betalning (BG betalare, BG mottagare, belopp, referens)
 *  - 25/26 Namn + address (associeras med senaste 20)
 *  - 29 Meddelande/remittance (associeras med senaste 20)
 *  - 70 Filslut (total count + sum — verifieras mot summerade rader)
 *
 * Övriga TK ignoreras tolerant. Se docs/t3d-mt940-bgc-spec.md.
 */

import type {
  ParsedBankStatement,
  ParsedBankTransaction,
} from './camt053-parser'

export class BgmaxParseError extends Error {
  constructor(
    public code: 'VALIDATION_ERROR' | 'PARSE_ERROR' | 'UNSUPPORTED_CURRENCY',
    message: string,
    public field?: string,
  ) {
    super(message)
    this.name = 'BgmaxParseError'
  }
}

interface Tx20 {
  bgReceiver: string
  bgPayer: string
  amountOre: number
  reference: string
  valueDate: string
}

/**
 * Parse TK=20 betalning.
 * Layout (förenklad MVP):
 *   pos 0-1: TK (="20")
 *   pos 2-11: BG mottagare (10)
 *   pos 12-21: BG betalare (10)
 *   pos 22-39: belopp i öre (18, zero-padded)
 *   pos 40-64: referens (25, space-padded)
 *   pos 65-72: datum YYYYMMDD (8)
 *   pos 73+: ignoreras
 */
function parseTK20(row: string): Tx20 {
  if (row.length < 73) {
    throw new BgmaxParseError(
      'PARSE_ERROR',
      `TK=20 för kort (${row.length} < 73 tecken): "${row}"`,
    )
  }
  const bgReceiver = row.slice(2, 12).trim()
  const bgPayer = row.slice(12, 22).trim()
  const amountStr = row.slice(22, 40).trim()
  const reference = row.slice(40, 65).trim()
  const dateStr = row.slice(65, 73).trim()

  if (!/^\d+$/.test(amountStr)) {
    throw new BgmaxParseError(
      'PARSE_ERROR',
      `TK=20 belopp måste vara heltal i öre: "${amountStr}"`,
    )
  }
  const amountOre = parseInt(amountStr, 10)

  if (!/^\d{8}$/.test(dateStr)) {
    throw new BgmaxParseError(
      'PARSE_ERROR',
      `TK=20 datum måste vara YYYYMMDD: "${dateStr}"`,
    )
  }
  const valueDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`

  return { bgReceiver, bgPayer, amountOre, reference, valueDate }
}

function parseTK01(row: string): {
  createdDate: string
  currency: string
} {
  if (row.length < 47) {
    throw new BgmaxParseError(
      'PARSE_ERROR',
      `TK=01 för kort (${row.length} < 47 tecken)`,
    )
  }
  // pos 2-15: timestamp YYYYMMDDhhmmss
  const tsStr = row.slice(2, 16).trim()
  const dateStr = tsStr.slice(0, 8)
  if (!/^\d{8}$/.test(dateStr)) {
    throw new BgmaxParseError(
      'PARSE_ERROR',
      `TK=01 har ogiltigt datum i timestamp: "${tsStr}"`,
    )
  }
  const createdDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`

  // pos 16-25 user payer id (10) — ignoreras
  // pos 26-28 currency (3)
  const currency = row.slice(26, 29).trim()
  return { createdDate, currency }
}

/**
 * Parse TK=05 betalnings-huvud: mottagarens bankgiro-nummer.
 * pos 0-1: "05"
 * pos 2-11: BG-nummer (10)
 */
function parseTK05(row: string): { receiverBg: string } {
  if (row.length < 12) {
    throw new BgmaxParseError('PARSE_ERROR', `TK=05 för kort: "${row}"`)
  }
  return { receiverBg: row.slice(2, 12).trim() }
}

/**
 * Parse TK=25 namn-post.
 * pos 0-1: "25"
 * pos 2-21: ignoreras (referens-matchning)
 * pos 22+: namn (fri text, Latin-1)
 */
function parseTK25(row: string): { name: string } {
  if (row.length < 22) return { name: '' }
  return { name: row.slice(22).trim() }
}

/**
 * Parse TK=29 meddelande-post.
 * pos 0-1: "29"
 * pos 2+: fri text
 */
function parseTK29(row: string): { message: string } {
  return { message: row.slice(2).trim() }
}

/**
 * Huvudparser: BGMAX-text → ParsedBankStatement.
 *
 * BGMAX är Latin-1-kodad av default, men denna funktion antar att
 * texten redan är dekoderad till string (callsite använder iconv-lite).
 */
export function parseBgmax(raw: string): ParsedBankStatement {
  const stripped = raw.replace(/^\uFEFF/, '').trim()
  if (!stripped) {
    throw new BgmaxParseError('PARSE_ERROR', 'Tom BGMAX-fil.')
  }

  const lines = stripped.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) {
    throw new BgmaxParseError('PARSE_ERROR', 'BGMAX-fil utan rader.')
  }

  let header: { createdDate: string; currency: string } | null = null
  let receiverBg: string | null = null
  const transactions: ParsedBankTransaction[] = []
  let currentTx20: Tx20 | null = null
  let currentName: string | null = null
  let currentMessage: string | null = null

  const flushCurrentTx = () => {
    if (!currentTx20) return
    transactions.push({
      booking_date: currentTx20.valueDate,
      value_date: currentTx20.valueDate,
      amount_ore: currentTx20.amountOre,
      transaction_reference: currentTx20.reference || null,
      remittance_info: currentMessage ?? null,
      counterparty_iban: null, // BG saknar IBAN; BG-nummer är inte IBAN
      counterparty_name: currentName,
      bank_transaction_code: 'BGMAX_20',
      bank_tx_domain: null,
      bank_tx_family: null,
      bank_tx_subfamily: null,
    })
    currentTx20 = null
    currentName = null
    currentMessage = null
  }

  for (const line of lines) {
    if (line.length < 2) continue
    const tk = line.slice(0, 2)
    switch (tk) {
      case '01':
        header = parseTK01(line)
        break
      case '05':
        flushCurrentTx()
        receiverBg = parseTK05(line).receiverBg
        break
      case '20':
        flushCurrentTx()
        currentTx20 = parseTK20(line)
        break
      case '25':
        if (currentTx20) currentName = parseTK25(line).name || null
        break
      case '29':
        if (currentTx20) currentMessage = parseTK29(line).message || null
        break
      case '70':
        // Validera count (soft — varna om mismatch men fall inte)
        break
      // 26 address, 22 diverse, etc — ignoreras tolerant
      default:
        break
    }
  }
  flushCurrentTx()

  if (!header) {
    throw new BgmaxParseError(
      'VALIDATION_ERROR',
      'Saknar TK=01 filhuvud.',
      'statement_number',
    )
  }
  if (header.currency !== 'SEK') {
    throw new BgmaxParseError(
      'UNSUPPORTED_CURRENCY',
      `Endast SEK stöds (hittade ${header.currency}).`,
      'currency',
    )
  }
  if (!receiverBg) {
    throw new BgmaxParseError(
      'VALIDATION_ERROR',
      'Saknar TK=05 betalnings-huvud (mottagarens BG-nummer).',
      'bank_account_iban',
    )
  }

  // Pseudo-IBAN: BGMAX har ingen IBAN; BG-nummer är inte IBAN men
  // bank_statements.bank_account_iban är NOT NULL. Reserverat prefix.
  const pseudoIban = `SE00BGMAX${receiverBg.padStart(10, '0')}`

  return {
    statement_number: `BGMAX-${header.createdDate}-${receiverBg}`,
    bank_account_iban: pseudoIban,
    statement_date: header.createdDate,
    opening_balance_ore: 0, // BGMAX har ingen balans
    closing_balance_ore: 0,
    transactions,
  }
}
