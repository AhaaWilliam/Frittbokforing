import { describe, it, expect } from 'vitest'
import {
  parseBgmax,
  BgmaxParseError,
} from '../src/main/services/bank/bgmax-parser'

/**
 * Layout-hjälpare för BGMAX-rader.
 * Faktiska BGMAX-filer har exakt 80 tecken per rad; vi padar manuellt.
 */
function tk01(date = '20250115120000', bg = '0000001234', currency = 'SEK') {
  // pos 0-1: "01", 2-15: YYYYMMDDhhmmss (14), 16-25: BG (10), 26-28: currency (3)
  return `01${date}${bg}${currency}` + ' '.repeat(80 - 29)
}

function tk05(bgReceiver = '0000001234') {
  // pos 0-1: "05", 2-11: BG (10)
  return `05${bgReceiver}` + ' '.repeat(80 - 12)
}

function tk20({
  bgReceiver = '0000001234',
  bgPayer = '0000009876',
  amountOre = 500000,
  reference = 'REF001',
  date = '20250120',
}: {
  bgReceiver?: string
  bgPayer?: string
  amountOre?: number
  reference?: string
  date?: string
} = {}) {
  const amountStr = String(amountOre).padStart(18, '0')
  const refStr = reference.padEnd(25, ' ')
  return `20${bgReceiver}${bgPayer}${amountStr}${refStr}${date}` + ' '.repeat(7)
}

function tk25(name = 'Acme AB') {
  // pos 0-1: "25", 2-21: ignored (20 chars), 22+: name
  return `25${' '.repeat(20)}${name}`.padEnd(80, ' ')
}

function tk29(message = 'Faktura 12345') {
  return `29${message}`.padEnd(80, ' ')
}

function tk70(count = 1) {
  return `70${String(count).padStart(8, '0')}`.padEnd(80, ' ')
}

describe('Sprint Q — BGMAX-parser', () => {
  describe('happy-path', () => {
    it('minimal BGMAX med en betalning', () => {
      const raw = [tk01(), tk05(), tk20(), tk25(), tk29(), tk70()].join('\n')
      const result = parseBgmax(raw)
      expect(result.statement_date).toBe('2025-01-15')
      expect(result.opening_balance_ore).toBe(0)
      expect(result.closing_balance_ore).toBe(0)
      expect(result.transactions).toHaveLength(1)

      const tx = result.transactions[0]
      expect(tx.amount_ore).toBe(500000)
      expect(tx.transaction_reference).toBe('REF001')
      expect(tx.counterparty_name).toBe('Acme AB')
      expect(tx.remittance_info).toBe('Faktura 12345')
      expect(tx.value_date).toBe('2025-01-20')
    })

    it('pseudo-IBAN: SE00BGMAX-prefix + BG-nummer', () => {
      const raw = [
        tk01(undefined, '0000001234'),
        tk05('0000005678'),
        tk70(0),
      ].join('\n')
      const result = parseBgmax(raw)
      expect(result.bank_account_iban).toBe('SE00BGMAX0000005678')
    })

    it('flera betalningar grupperade med namn/meddelande', () => {
      const raw = [
        tk01(),
        tk05(),
        tk20({ amountOre: 100000, reference: 'R1' }),
        tk25('Kund 1'),
        tk20({ amountOre: 200000, reference: 'R2' }),
        tk25('Kund 2'),
        tk29('Medd 2'),
        tk70(2),
      ].join('\n')
      const result = parseBgmax(raw)
      expect(result.transactions).toHaveLength(2)
      expect(result.transactions[0].amount_ore).toBe(100000)
      expect(result.transactions[0].counterparty_name).toBe('Kund 1')
      expect(result.transactions[0].remittance_info).toBeNull()
      expect(result.transactions[1].amount_ore).toBe(200000)
      expect(result.transactions[1].counterparty_name).toBe('Kund 2')
      expect(result.transactions[1].remittance_info).toBe('Medd 2')
    })

    it('statement_number innehåller datum + BG', () => {
      const raw = [tk01('20250301120000'), tk05('0000007777'), tk70(0)].join(
        '\n',
      )
      const result = parseBgmax(raw)
      expect(result.statement_number).toBe('BGMAX-2025-03-01-0000007777')
    })
  })

  describe('encoding och tolerans', () => {
    it('CRLF radbrytningar', () => {
      const raw = [tk01(), tk05(), tk70()].join('\r\n')
      expect(parseBgmax(raw).transactions).toEqual([])
    })

    it('BOM i början', () => {
      const raw = '\uFEFF' + [tk01(), tk05(), tk70()].join('\n')
      expect(() => parseBgmax(raw)).not.toThrow()
    })

    it('Latin-1 åäö i namn (redan dekoderat)', () => {
      const raw = [
        tk01(),
        tk05(),
        tk20(),
        tk25('Ärbart Åke Öst'),
        tk70(1),
      ].join('\n')
      const result = parseBgmax(raw)
      expect(result.transactions[0].counterparty_name).toBe('Ärbart Åke Öst')
    })

    it('okänd TK (22 diverse) ignoreras tolerant', () => {
      const raw = [
        tk01(),
        tk05(),
        tk20(),
        '22' + ' '.repeat(78), // okänd TK
        tk25(),
        tk70(1),
      ].join('\n')
      expect(() => parseBgmax(raw)).not.toThrow()
    })

    it('TK=25 före TK=20 ignoreras (orphan)', () => {
      const raw = [
        tk01(),
        tk05(),
        tk25('Ingen Tx'),
        tk20({ reference: 'R1' }),
        tk70(1),
      ].join('\n')
      const result = parseBgmax(raw)
      expect(result.transactions[0].counterparty_name).toBeNull()
    })
  })

  describe('amount-parsning', () => {
    it('belopp i öre som heltal', () => {
      const raw = [tk01(), tk05(), tk20({ amountOre: 123456 }), tk70()].join(
        '\n',
      )
      expect(parseBgmax(raw).transactions[0].amount_ore).toBe(123456)
    })

    it('stora belopp (miljoner)', () => {
      const raw = [tk01(), tk05(), tk20({ amountOre: 999999999 }), tk70()].join(
        '\n',
      )
      expect(parseBgmax(raw).transactions[0].amount_ore).toBe(999999999)
    })
  })

  describe('errors', () => {
    it('tom fil → PARSE_ERROR', () => {
      try {
        parseBgmax('')
        expect.fail('should throw')
      } catch (e) {
        expect((e as BgmaxParseError).code).toBe('PARSE_ERROR')
      }
    })

    it('saknar TK=01 → VALIDATION_ERROR', () => {
      const raw = [tk05(), tk70()].join('\n')
      try {
        parseBgmax(raw)
        expect.fail('should throw')
      } catch (e) {
        expect((e as BgmaxParseError).field).toBe('statement_number')
      }
    })

    it('saknar TK=05 → VALIDATION_ERROR', () => {
      const raw = [tk01(), tk70()].join('\n')
      try {
        parseBgmax(raw)
        expect.fail('should throw')
      } catch (e) {
        expect((e as BgmaxParseError).field).toBe('bank_account_iban')
      }
    })

    it('non-SEK currency → UNSUPPORTED_CURRENCY', () => {
      const raw = [tk01(undefined, undefined, 'EUR'), tk05(), tk70()].join('\n')
      try {
        parseBgmax(raw)
        expect.fail('should throw')
      } catch (e) {
        expect((e as BgmaxParseError).code).toBe('UNSUPPORTED_CURRENCY')
      }
    })

    it('TK=20 med trasigt belopp → PARSE_ERROR', () => {
      const broken = `20${' '.repeat(20)}${'A'.repeat(18)}${' '.repeat(25)}20250120${' '.repeat(7)}`
      const raw = [tk01(), tk05(), broken, tk70()].join('\n')
      expect(() => parseBgmax(raw)).toThrow(BgmaxParseError)
    })

    it('TK=20 med trasigt datum → PARSE_ERROR', () => {
      const broken = `20${' '.repeat(20)}${'0'.repeat(18)}${' '.repeat(25)}BADDATEC${' '.repeat(7)}`
      const raw = [tk01(), tk05(), broken, tk70()].join('\n')
      expect(() => parseBgmax(raw)).toThrow(BgmaxParseError)
    })
  })
})
