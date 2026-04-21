/**
 * Sprint F P6 — camt.054 (Bank-to-Customer Debit/Credit Notification) parser.
 *
 * Skillnader mot camt.053 (Statement):
 *   - Rotelement: Document/BkToCstmrDbtCdtNtfctn/Ntfctn (inte /BkToCstmrStmt/Stmt)
 *   - Ingen OPBD/CLBD-balansdata (notification, inte statement)
 *   - Ntry-struktur identisk → återanvänder parseNtry
 *
 * Returtyp skiljer sig minimalt: `opening_balance_ore` och
 * `closing_balance_ore` är null (anger att fältet inte finns i källan).
 * bank-statement-service hanterar null via Path A (pseudo-statement med
 * opening=0, closing=0), se Sprint F P6 i sprint-f-prompt.md.
 *
 * Signkonvention (M152): positiva amounts = inkommande (CRDT),
 * negativa = utgående (DBIT). Samma som camt.053.
 */
import { convert } from 'xmlbuilder2'
import {
  Camt053ParseError,
  parseNtry,
  pick,
  stripNamespace,
  text,
  asArray,
  type ParsedBankTransaction,
  type XmlNode,
} from './camt053-parser'

export interface ParsedBankNotification {
  statement_number: string
  bank_account_iban: string
  statement_date: string
  /** camt.054 saknar balansdata — alltid null. */
  opening_balance_ore: null
  /** camt.054 saknar balansdata — alltid null. */
  closing_balance_ore: null
  transactions: ParsedBankTransaction[]
}

export function parseCamt054(xmlRaw: string): ParsedBankNotification {
  if (xmlRaw.length > 5_000_000) {
    throw new Camt053ParseError('VALIDATION_ERROR', 'Filen är för stor (max 5 MB).')
  }
  if (xmlRaw.includes('<!DOCTYPE') || xmlRaw.includes('<!ENTITY')) {
    throw new Camt053ParseError('VALIDATION_ERROR', 'DTD/ENTITY-deklarationer är inte tillåtna.')
  }
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
  const ntfctn = pick(doc, ['BkToCstmrDbtCdtNtfctn', 'Ntfctn']) as
    | Record<string, unknown>
    | undefined
  if (!ntfctn) {
    throw new Camt053ParseError(
      'VALIDATION_ERROR',
      'Felaktig camt.054-struktur: saknar Document/BkToCstmrDbtCdtNtfctn/Ntfctn.',
    )
  }

  // Ett notification per import (multi-notification-filer stöds inte i MVP)
  const ntfctnNode = Array.isArray(ntfctn) ? ntfctn[0] : ntfctn

  const statementNumber = text(pick(ntfctnNode, ['Id']))
  if (!statementNumber) {
    throw new Camt053ParseError(
      'VALIDATION_ERROR',
      'Saknar Ntfctn/Id.',
      'statement_number',
    )
  }

  const creDtTm = text(pick(ntfctnNode, ['CreDtTm']))
  if (!creDtTm) {
    throw new Camt053ParseError(
      'VALIDATION_ERROR',
      'Saknar Ntfctn/CreDtTm.',
      'statement_date',
    )
  }
  const statementDate = creDtTm.slice(0, 10)

  const iban = text(pick(ntfctnNode, ['Acct', 'Id', 'IBAN']))
  if (!iban) {
    throw new Camt053ParseError(
      'VALIDATION_ERROR',
      'Saknar kontots IBAN (Acct/Id/IBAN).',
      'bank_account_iban',
    )
  }

  const ccy = text(pick(ntfctnNode, ['Acct', 'Ccy']))
  if (ccy && ccy !== 'SEK') {
    throw new Camt053ParseError(
      'VALIDATION_ERROR',
      `Endast SEK stöds i nuvarande version (hittade ${ccy}).`,
      'currency',
    )
  }

  // Transaktioner (Ntry-strukturen är identisk med camt.053)
  const ntries = asArray(ntfctnNode.Ntry as unknown)
  const transactions: ParsedBankTransaction[] = []
  for (const entry of ntries) {
    const tx = parseNtry(entry as XmlNode)
    if (tx) transactions.push(tx)
  }

  return {
    statement_number: statementNumber,
    bank_account_iban: iban,
    statement_date: statementDate,
    opening_balance_ore: null,
    closing_balance_ore: null,
    transactions,
  }
}
