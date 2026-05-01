import { describe, it, expect } from 'vitest'
import {
  normalizeBankgiro,
  validateBankgiroChecksum,
} from '../../src/shared/bankgiro-validation'

describe('normalizeBankgiro', () => {
  it('strippar bindestreck', () => {
    expect(normalizeBankgiro('123-4567')).toBe('1234567')
  })

  it('redan normaliserad oförändrad', () => {
    expect(normalizeBankgiro('1234567')).toBe('1234567')
  })

  it('flera bindestreck (defensivt)', () => {
    expect(normalizeBankgiro('1-2-3-4-5-6-7')).toBe('1234567')
  })
})

describe('validateBankgiroChecksum (Luhn)', () => {
  it('giltigt 7-siffrigt BG → true', () => {
    // Luhn-validerat: 1234566 (digits 6654321 reversed; sum 30 mod 10 = 0)
    expect(validateBankgiroChecksum('1234566')).toBe(true)
  })

  it('giltigt med bindestreck', () => {
    expect(validateBankgiroChecksum('123-4566')).toBe(true)
  })

  it('felaktig sista siffra → false', () => {
    expect(validateBankgiroChecksum('1234567')).toBe(false)
  })

  it('för kort (< 7) → false', () => {
    expect(validateBankgiroChecksum('123456')).toBe(false)
  })

  it('för långt (> 8) → false', () => {
    expect(validateBankgiroChecksum('123456789')).toBe(false)
  })

  it('icke-numeriska tecken → false', () => {
    expect(validateBankgiroChecksum('123abc7')).toBe(false)
  })

  it('tom sträng → false', () => {
    expect(validateBankgiroChecksum('')).toBe(false)
  })
})
