import { describe, it, expect } from 'vitest'
import {
  parseMt940,
  Mt940ParseError,
} from '../src/main/services/bank/mt940-parser'

function makeMinimal({
  openingC = '1000000,00',
  closingC = '995000,00',
  txs = '',
  currency = 'SEK',
}: {
  openingC?: string
  closingC?: string
  txs?: string
  currency?: string
} = {}): string {
  return [
    ':20:REF123',
    ':25:SE1234567890',
    ':28C:00001/00001',
    `:60F:C250101${currency}${openingC}`,
    txs,
    `:62F:C250131${currency}${closingC}`,
  ]
    .filter(Boolean)
    .join('\n')
}

describe('Sprint Q — MT940-parser', () => {
  describe('happy-path', () => {
    it('minimalt giltigt MT940 → parsed statement', () => {
      const raw = makeMinimal()
      const result = parseMt940(raw)
      expect(result.statement_number).toBe('REF123')
      expect(result.bank_account_iban).toBe('SE1234567890')
      expect(result.statement_date).toBe('2025-01-31')
      expect(result.opening_balance_ore).toBe(100000000)
      expect(result.closing_balance_ore).toBe(99500000)
      expect(result.transactions).toEqual([])
    })

    it('med SWIFT-header-block hoppas över', () => {
      const raw = `{1:F01BANKSESSXXXX1234567890}
{2:O9401200250101BANKSESSXXXX12345678902501011200N}
{4:
${makeMinimal()}
-}`
      const result = parseMt940(raw)
      expect(result.statement_number).toBe('REF123')
    })
  })

  describe('transactions — :61: + :86:', () => {
    it('enkel credit-transaktion med strukturerat :86:', () => {
      const raw = makeMinimal({
        txs: [
          ':61:2501150115C1000,00NTRFREF999//BANKREF',
          ':86:/NAME/Acme AB/',
        ].join('\n'),
      })
      const result = parseMt940(raw)
      expect(result.transactions).toHaveLength(1)
      const tx = result.transactions[0]
      expect(tx.amount_ore).toBe(100000)
      expect(tx.value_date).toBe('2025-01-15')
      expect(tx.booking_date).toBe('2025-01-15')
      expect(tx.transaction_reference).toBe('REF999')
      expect(tx.counterparty_name).toBe('Acme AB')
      expect(tx.bank_transaction_code).toBe('NTRF')
      expect(tx.bank_tx_domain).toBe('ACMT')
    })

    it('debit-transaktion med NCHG → classifier-friendly BkTxCd', () => {
      const raw = makeMinimal({
        txs: [':61:2501150115D50,00NCHGNONREF', ':86:Månadsavgift'].join('\n'),
      })
      const result = parseMt940(raw)
      const tx = result.transactions[0]
      expect(tx.amount_ore).toBe(-5000)
      expect(tx.bank_transaction_code).toBe('NCHG')
      expect(tx.bank_tx_subfamily).toBe('CHRG')
      expect(tx.remittance_info).toBe('Månadsavgift')
    })

    it('NINT → interest-mapping', () => {
      const raw = makeMinimal({
        txs: [':61:2501150115C25,50NINTRANT', ':86:Ränta sparkonto'].join('\n'),
      })
      const result = parseMt940(raw)
      expect(result.transactions[0].bank_tx_subfamily).toBe('INTR')
      expect(result.transactions[0].amount_ore).toBe(2550)
    })

    it(':86: med /IBAN/ + /REMI/ + /NAME/', () => {
      const raw = makeMinimal({
        txs: [
          ':61:2501150115D250,00NTRFREF1',
          ':86:/NAME/Leverantör AB/IBAN/SE4550000000054398256689/REMI/Faktura 12345',
        ].join('\n'),
      })
      const tx = parseMt940(raw).transactions[0]
      expect(tx.counterparty_name).toBe('Leverantör AB')
      expect(tx.counterparty_iban).toBe('SE4550000000054398256689')
      expect(tx.remittance_info).toBe('Faktura 12345')
    })

    it('ostrukturerad :86: → hela raden som remittance_info', () => {
      const raw = makeMinimal({
        txs: [
          ':61:2501150115C1000,00NTRFREF1',
          ':86:Bara fri text utan struktur',
        ].join('\n'),
      })
      const tx = parseMt940(raw).transactions[0]
      expect(tx.remittance_info).toBe('Bara fri text utan struktur')
      expect(tx.counterparty_name).toBeNull()
      expect(tx.counterparty_iban).toBeNull()
    })

    it(':61: utan efterföljande :86: → transaction utan details', () => {
      const raw = makeMinimal({
        txs: ':61:2501150115C100,00NTRFREF',
      })
      const tx = parseMt940(raw).transactions[0]
      expect(tx.amount_ore).toBe(10000)
      expect(tx.remittance_info).toBeNull()
    })

    it('RC (reversal of credit) → negativt amount', () => {
      const raw = makeMinimal({
        txs: ':61:2501150115RC500,00NMSCREF',
      })
      expect(parseMt940(raw).transactions[0].amount_ore).toBe(-50000)
    })

    it('två transaktioner i rad', () => {
      const raw = makeMinimal({
        txs: [
          ':61:2501100110C500,00NTRFR1',
          ':86:/NAME/Kund1/',
          ':61:2501150115D100,00NCHGR2',
          ':86:Avgift',
        ].join('\n'),
      })
      const txs = parseMt940(raw).transactions
      expect(txs).toHaveLength(2)
      expect(txs[0].amount_ore).toBe(50000)
      expect(txs[1].amount_ore).toBe(-10000)
    })
  })

  describe('belopp-parsning', () => {
    it('kommateckens-decimal: 1234,56 → 123456 öre', () => {
      const raw = makeMinimal({
        txs: ':61:2501150115C1234,56NTRFREF',
      })
      expect(parseMt940(raw).transactions[0].amount_ore).toBe(123456)
    })

    it('utan decimal: 1234 → 123400 öre', () => {
      const raw = makeMinimal({
        txs: ':61:2501150115C1234NTRFREF',
      })
      expect(parseMt940(raw).transactions[0].amount_ore).toBe(123400)
    })

    it('1 decimal: 1234,5 → 123450 öre', () => {
      const raw = makeMinimal({
        txs: ':61:2501150115C1234,5NTRFREF',
      })
      expect(parseMt940(raw).transactions[0].amount_ore).toBe(123450)
    })
  })

  describe('errors', () => {
    it('saknar :20: → VALIDATION_ERROR', () => {
      const raw = [
        ':25:SE1234567890',
        ':60F:C250101SEK1000,00',
        ':62F:C250131SEK1000,00',
      ].join('\n')
      expect(() => parseMt940(raw)).toThrow(Mt940ParseError)
      try {
        parseMt940(raw)
      } catch (e) {
        expect((e as Mt940ParseError).code).toBe('VALIDATION_ERROR')
        expect((e as Mt940ParseError).field).toBe('statement_number')
      }
    })

    it('saknar :60F: → VALIDATION_ERROR', () => {
      const raw = [':20:REF', ':25:SE12', ':62F:C250131SEK100,00'].join('\n')
      try {
        parseMt940(raw)
        expect.fail('should throw')
      } catch (e) {
        expect((e as Mt940ParseError).field).toBe('opening_balance_ore')
      }
    })

    it('saknar :62F: → VALIDATION_ERROR', () => {
      const raw = [':20:REF', ':25:SE12', ':60F:C250101SEK100,00'].join('\n')
      try {
        parseMt940(raw)
        expect.fail('should throw')
      } catch (e) {
        expect((e as Mt940ParseError).field).toBe('closing_balance_ore')
      }
    })

    it('non-SEK valuta → UNSUPPORTED_CURRENCY', () => {
      const raw = makeMinimal({ currency: 'EUR' })
      try {
        parseMt940(raw)
        expect.fail('should throw')
      } catch (e) {
        expect((e as Mt940ParseError).code).toBe('UNSUPPORTED_CURRENCY')
      }
    })

    it('tom fil → PARSE_ERROR', () => {
      try {
        parseMt940('')
        expect.fail('should throw')
      } catch (e) {
        expect((e as Mt940ParseError).code).toBe('PARSE_ERROR')
      }
    })

    it('trasigt :61:-format → PARSE_ERROR', () => {
      const raw = makeMinimal({ txs: ':61:GARBAGE' })
      expect(() => parseMt940(raw)).toThrow(Mt940ParseError)
    })

    it('trasigt datumformat → PARSE_ERROR', () => {
      const raw = [
        ':20:REF',
        ':25:SE12',
        ':60F:CBADSTARTSEK100,00',
        ':62F:C250131SEK100,00',
      ].join('\n')
      expect(() => parseMt940(raw)).toThrow(Mt940ParseError)
    })
  })

  describe('BkTxCd-mapping', () => {
    it('okänd transaction-type → bank_transaction_code kvar, BkTxCd null', () => {
      const raw = makeMinimal({
        txs: ':61:2501150115C100,00XYZZREF',
      })
      const tx = parseMt940(raw).transactions[0]
      expect(tx.bank_transaction_code).toBe('XYZZ')
      expect(tx.bank_tx_domain).toBeNull()
      expect(tx.bank_tx_family).toBeNull()
      expect(tx.bank_tx_subfamily).toBeNull()
    })

    it('/TRCD/ i :86: överrider :61:-kod', () => {
      const raw = makeMinimal({
        txs: [':61:2501150115D50,00NMSCREF', ':86:/TRCD/NCHG/NAME/Bank/'].join(
          '\n',
        ),
      })
      const tx = parseMt940(raw).transactions[0]
      expect(tx.bank_transaction_code).toBe('NCHG')
      expect(tx.bank_tx_subfamily).toBe('CHRG')
    })
  })

  describe('tolerans', () => {
    it('CRLF radbrytningar', () => {
      const raw = makeMinimal().replace(/\n/g, '\r\n')
      expect(parseMt940(raw).statement_number).toBe('REF123')
    })

    it('BOM i början', () => {
      const raw = '\uFEFF' + makeMinimal()
      expect(parseMt940(raw).statement_number).toBe('REF123')
    })

    it('okänd tag ignoreras tolerant', () => {
      const raw = [
        ':20:REF',
        ':25:SE12',
        ':60F:C250101SEK100,00',
        ':99:UnknownTagContent',
        ':62F:C250131SEK100,00',
      ].join('\n')
      const result = parseMt940(raw)
      expect(result.statement_number).toBe('REF')
    })
  })
})
