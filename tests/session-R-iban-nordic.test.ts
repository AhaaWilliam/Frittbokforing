import { describe, it, expect } from 'vitest'
import { lookupBankByIban } from '../src/main/services/bank/iban-bank-registry'

describe('Sprint R — Nordic IBAN-registry utvidgning', () => {
  describe('NO bankkoder (norska banker)', () => {
    it('DNB (1503-1510, 4200-4299)', () => {
      expect(lookupBankByIban('NO93 1506 1117 947')).toBe('DNB')
      expect(lookupBankByIban('NO93 4200 1117 947')).toBe('DNB')
      expect(lookupBankByIban('NO93 4299 1117 947')).toBe('DNB')
    })

    it('Nordea Norge (5096-5099, 6000-6099)', () => {
      expect(lookupBankByIban('NO93 5096 1117 947')).toBe('NORDEA')
      expect(lookupBankByIban('NO93 6000 1117 947')).toBe('NORDEA')
    })

    it('Handelsbanken Norge (9040-9049)', () => {
      expect(lookupBankByIban('NO93 9049 1117 947')).toBe('HANDELSBANKEN')
    })

    it('SpareBank 1 (4312-4356)', () => {
      expect(lookupBankByIban('NO93 4312 1117 947')).toBe('SPAREBANK1')
      expect(lookupBankByIban('NO93 4356 1117 947')).toBe('SPAREBANK1')
    })

    it('Danske Bank Norge', () => {
      expect(lookupBankByIban('NO93 8101 1117 947')).toBe('DANSKE')
      expect(lookupBankByIban('NO93 3100 1117 947')).toBe('DANSKE')
    })

    it('okänd NO-prefix → null', () => {
      expect(lookupBankByIban('NO93 9999 1117 947')).toBeNull()
    })
  })

  describe('DK bankkoder (danska banker)', () => {
    // DK IBAN = 2 country + 2 check + 4 bank + 10 account = 18 tecken totalt.
    it('Danske Bank (3000-3999, största bankkoderna i DK)', () => {
      expect(lookupBankByIban('DK50 3000 1234567890')).toBe('DANSKE')
      expect(lookupBankByIban('DK50 3999 1234567890')).toBe('DANSKE')
    })

    it('Nordea Danmark (2000-2299)', () => {
      expect(lookupBankByIban('DK50 2000 1234567890')).toBe('NORDEA')
      expect(lookupBankByIban('DK50 2299 1234567890')).toBe('NORDEA')
    })

    it('Jyske Bank (5000-5999)', () => {
      expect(lookupBankByIban('DK50 5000 1234567890')).toBe('JYSKE')
      expect(lookupBankByIban('DK50 5999 1234567890')).toBe('JYSKE')
    })

    it('Sydbank (6600-6699, 7600-7699)', () => {
      expect(lookupBankByIban('DK50 6600 1234567890')).toBe('SYDBANK')
      expect(lookupBankByIban('DK50 7600 1234567890')).toBe('SYDBANK')
    })

    it('Handelsbanken DK (6480-6499)', () => {
      expect(lookupBankByIban('DK50 6480 1234567890')).toBe('HANDELSBANKEN')
    })

    it('okänd DK-prefix → null', () => {
      expect(lookupBankByIban('DK50 9999 1234567890')).toBeNull()
    })
  })

  describe('land-baserad routing', () => {
    it('SE-bankkod i NO-IBAN → null (prefix används inte över landsgränser)', () => {
      // 5000 = SEB i SE men inte mappad för NO
      expect(lookupBankByIban('NO93 5000 1117 947')).toBeNull()
    })

    it('NO-bankkod i SE-IBAN → null', () => {
      // 9049 = Handelsbanken NO (4-range). 9049 är utanför alla
      // SE-bankkod-intervall (inte i 9020-9029 eller 9150-9169 osv).
      expect(lookupBankByIban('SE93 9049 0000 0000 0001')).toBeNull()
    })

    it('FI-IBAN (ej stödd) → null', () => {
      expect(lookupBankByIban('FI21 1234 5600 0007 85')).toBeNull()
    })

    it('DE-IBAN (ej stödd) → null', () => {
      expect(lookupBankByIban('DE89 3704 0044 0532 0130 00')).toBeNull()
    })

    it('EE-IBAN (ej stödd) → null', () => {
      expect(lookupBankByIban('EE38 2200 2210 2014 5685')).toBeNull()
    })
  })

  describe('tolerans (samma som SE)', () => {
    it('NO: lowercase + whitespace', () => {
      expect(lookupBankByIban('  no 93 1506 1117 947  ')).toBe('DNB')
    })

    it('DK: lowercase + whitespace', () => {
      expect(lookupBankByIban('  dk 50 5000 1234567890  ')).toBe('JYSKE')
    })
  })

  describe('determinism (M153)', () => {
    it('NO-lookup 100 iter ger samma resultat', () => {
      const input = 'NO93 1506 1117 947'
      const first = lookupBankByIban(input)
      for (let i = 0; i < 100; i++) {
        expect(lookupBankByIban(input)).toBe(first)
      }
    })

    it('DK-lookup 100 iter ger samma resultat', () => {
      const input = 'DK50 5000 1234567890'
      const first = lookupBankByIban(input)
      for (let i = 0; i < 100; i++) {
        expect(lookupBankByIban(input)).toBe(first)
      }
    })
  })
})
