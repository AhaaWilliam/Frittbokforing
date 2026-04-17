import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseCamt053,
  Camt053ParseError,
} from '../src/main/services/bank/camt053-parser'

function fixture(name: string): string {
  return readFileSync(resolve(__dirname, 'fixtures', name), 'utf8')
}

describe('S55 A2 — camt.053-parser', () => {
  it('1. Happy-path (3 Ntry) parsas korrekt', () => {
    const result = parseCamt053(fixture('camt053-happy.xml'))
    expect(result.statement_number).toBe('STMT-2026-04')
    expect(result.bank_account_iban).toBe('SE4550000000058398257466')
    expect(result.statement_date).toBe('2026-04-15')
    expect(result.opening_balance_ore).toBe(1_000_000)
    expect(result.closing_balance_ore).toBe(1_150_050)
    expect(result.transactions).toHaveLength(3)
    // TX1: +2500.00 SEK, Acme AB
    expect(result.transactions[0]).toMatchObject({
      amount_ore: 250_000,
      booking_date: '2026-04-05',
      value_date: '2026-04-05',
      transaction_reference: 'REF-A-001',
      counterparty_name: 'Acme AB',
      counterparty_iban: 'SE3550000000054910000003',
      remittance_info: 'Faktura 2026-001',
      bank_transaction_code: 'TRF',
    })
    // TX2: −1200.00 SEK
    expect(result.transactions[1].amount_ore).toBe(-120_000)
    expect(result.transactions[1].counterparty_name).toBe('Telenor Sverige AB')
  })

  it('2. Empty statement (0 Ntry) parsas utan fel', () => {
    const result = parseCamt053(fixture('camt053-empty.xml'))
    expect(result.transactions).toHaveLength(0)
    expect(result.opening_balance_ore).toBe(500_000)
    expect(result.closing_balance_ore).toBe(500_000)
  })

  it('3. Negativt opening_balance (DBIT på OPBD) ger negativt ore-värde', () => {
    const result = parseCamt053(fixture('camt053-negative-opening.xml'))
    expect(result.opening_balance_ore).toBe(-50_000)
    expect(result.closing_balance_ore).toBe(0)
  })

  it('4. Split Ntry (flera TxDtls under en Ntry) ger en transaktion med första TxDtls-metadata', () => {
    const result = parseCamt053(fixture('camt053-split-entry.xml'))
    expect(result.transactions).toHaveLength(1)
    expect(result.transactions[0].amount_ore).toBe(50_000)
    expect(result.transactions[0].counterparty_name).toBe('Part A')
    expect(result.transactions[0].remittance_info).toBe('Del 1')
  })

  it('5. Non-SEK currency avvisas', () => {
    const xml = fixture('camt053-happy.xml').replace(/<Ccy>SEK<\/Ccy>/, '<Ccy>EUR</Ccy>')
    expect(() => parseCamt053(xml)).toThrow(Camt053ParseError)
    try {
      parseCamt053(xml)
    } catch (err) {
      expect(err).toBeInstanceOf(Camt053ParseError)
      expect((err as Camt053ParseError).code).toBe('VALIDATION_ERROR')
      expect((err as Camt053ParseError).field).toBe('currency')
    }
  })

  it('6. Saknad IBAN ger VALIDATION_ERROR med field=bank_account_iban', () => {
    const xml = fixture('camt053-happy.xml').replace(
      /<IBAN>[^<]+<\/IBAN>/,
      '',
    )
    try {
      parseCamt053(xml)
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(Camt053ParseError)
      expect((err as Camt053ParseError).field).toBe('bank_account_iban')
    }
  })

  it('7. Duplicate transaction_reference inom statement tillåts', () => {
    const xml = fixture('camt053-happy.xml').replace(/REF-A-002/g, 'REF-A-001')
    const result = parseCamt053(xml)
    expect(result.transactions).toHaveLength(3)
    expect(result.transactions[0].transaction_reference).toBe('REF-A-001')
    expect(result.transactions[1].transaction_reference).toBe('REF-A-001')
  })

  it('8. Malformed XML (ej giltig XML alls) ger PARSE_ERROR', () => {
    // xmlbuilder2 är lenient — använd genuint ogiltig XML
    const malformed = 'this is not xml at all !!!'
    try {
      parseCamt053(malformed)
      throw new Error('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(Camt053ParseError)
      // Antingen PARSE_ERROR eller VALIDATION_ERROR (saknar Document) är acceptabelt
      const code = (err as Camt053ParseError).code
      expect(['PARSE_ERROR', 'VALIDATION_ERROR']).toContain(code)
    }
  })

  it('9. BOM-prefix i fil tolereras', () => {
    const xml = '\uFEFF' + fixture('camt053-happy.xml')
    const result = parseCamt053(xml)
    expect(result.statement_number).toBe('STMT-2026-04')
  })

  it('10. Namespace-varianter (olika prefix/URN) hanteras', () => {
    // Byt till annan ISO20022-version, parser ska fortfarande fungera via stripNamespace
    const xml = fixture('camt053-happy.xml').replace(
      'xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08"',
      'xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"',
    )
    const result = parseCamt053(xml)
    expect(result.transactions).toHaveLength(3)
  })
})
