import { describe, it, expect } from 'vitest'
import { lookupBankByIban } from '../src/main/services/bank/iban-bank-registry'

describe('Sprint P — iban-bank-registry', () => {
  describe('lookupBankByIban — SE bankkoder', () => {
    it('SEB (5000-5999)', () => {
      expect(lookupBankByIban('SE35 5000 0000 0543 9825 6689')).toBe('SEB')
      expect(lookupBankByIban('SE4559990000000000000001')).toBe('SEB')
    })

    it('Swedbank (7000-7999, 8000-8999)', () => {
      expect(lookupBankByIban('SE45 7000 0000 0000 0000 0001')).toBe('SWEDBANK')
      expect(lookupBankByIban('SE45 8327 0000 0000 0000 0001')).toBe('SWEDBANK')
    })

    it('Handelsbanken (6000-6999)', () => {
      expect(lookupBankByIban('SE45 6000 0000 0000 0000 0001')).toBe(
        'HANDELSBANKEN',
      )
    })

    it('Nordea (multipla intervall)', () => {
      expect(lookupBankByIban('SE45 1100 0000 0000 0000 0001')).toBe('NORDEA')
      expect(lookupBankByIban('SE45 1500 0000 0000 0000 0001')).toBe('NORDEA')
      expect(lookupBankByIban('SE45 3100 0000 0000 0000 0001')).toBe('NORDEA')
      expect(lookupBankByIban('SE45 4000 0000 0000 0000 0001')).toBe('NORDEA')
    })

    it('Danske Bank (1200-1399, 2400-2499)', () => {
      expect(lookupBankByIban('SE45 1200 0000 0000 0000 0001')).toBe('DANSKE')
      expect(lookupBankByIban('SE45 2400 0000 0000 0000 0001')).toBe('DANSKE')
    })

    it('ICA Banken (9270-9279)', () => {
      expect(lookupBankByIban('SE45 9270 0000 0000 0000 0001')).toBe('ICA')
      expect(lookupBankByIban('SE45 9279 0000 0000 0000 0001')).toBe('ICA')
    })

    it('Länsförsäkringar (9020-9029, 3400-3409)', () => {
      expect(lookupBankByIban('SE45 9020 0000 0000 0000 0001')).toBe(
        'LANSFORSAKRINGAR',
      )
      expect(lookupBankByIban('SE45 3400 0000 0000 0000 0001')).toBe(
        'LANSFORSAKRINGAR',
      )
    })

    it('Skandiabanken (9150-9169)', () => {
      expect(lookupBankByIban('SE45 9150 0000 0000 0000 0001')).toBe('SKANDIA')
    })
  })

  describe('lookupBankByIban — null-retur', () => {
    it('returnerar null för null/undefined/tom sträng', () => {
      expect(lookupBankByIban(null)).toBeNull()
      expect(lookupBankByIban(undefined)).toBeNull()
      expect(lookupBankByIban('')).toBeNull()
    })

    it('returnerar null för utländsk IBAN (NO, DK, DE)', () => {
      expect(lookupBankByIban('NO9386011117947')).toBeNull()
      expect(lookupBankByIban('DK5000400440116243')).toBeNull()
      expect(lookupBankByIban('DE89370400440532013000')).toBeNull()
    })

    it('returnerar null för okänd SE-bankprefix', () => {
      // 9999 är utanför alla kända intervall
      expect(lookupBankByIban('SE45 9999 0000 0000 0000 0001')).toBeNull()
      // 5999 = SEB; 6000 = Handelsbanken; mellan finns inga. Men 5000-5999 täcks.
      // Testa en prefix som inte är i någon range:
      expect(lookupBankByIban('SE45 9900 0000 0000 0000 0001')).toBeNull()
    })

    it('returnerar null för IBAN kortare än 8 tecken efter normalisering', () => {
      expect(lookupBankByIban('SE45')).toBeNull()
      expect(lookupBankByIban('SE')).toBeNull()
    })
  })

  describe('lookupBankByIban — tolerans', () => {
    it('tolererar lowercase', () => {
      expect(lookupBankByIban('se35500000000543982566 89')).toBe('SEB')
    })

    it('tolererar whitespace', () => {
      expect(lookupBankByIban('SE 45 5000 0000 0000 0000 0001')).toBe('SEB')
      expect(lookupBankByIban('  SE45\t5000\t0000')).toBe('SEB')
    })

    it('tolererar blandad case + whitespace', () => {
      expect(lookupBankByIban('  Se 45 5000 0000  ')).toBe('SEB')
    })
  })

  describe('lookupBankByIban — determinism (M153)', () => {
    it('samma input ger samma output 100 iterationer', () => {
      const input = 'SE45 5000 0000 0543 9825 6689'
      const first = lookupBankByIban(input)
      for (let i = 0; i < 100; i++) {
        expect(lookupBankByIban(input)).toBe(first)
      }
    })
  })
})
