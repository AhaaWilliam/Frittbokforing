import { describe, it, expect } from 'vitest'
import {
  oreToSie5Amount,
  debitCreditToSie5Amount,
} from '../../src/main/services/sie5/amount-conversion'

describe('oreToSie5Amount', () => {
  it('100 öre → "1.00"', () => {
    expect(oreToSie5Amount(100)).toBe('1.00')
  })

  it('1234 öre → "12.34"', () => {
    expect(oreToSie5Amount(1234)).toBe('12.34')
  })

  it('0 → "0.00"', () => {
    expect(oreToSie5Amount(0)).toBe('0.00')
  })

  it('1 öre → "0.01" (zero-padding)', () => {
    expect(oreToSie5Amount(1)).toBe('0.01')
  })

  it('10 öre → "0.10" (zero-padding)', () => {
    expect(oreToSie5Amount(10)).toBe('0.10')
  })

  it('negativa belopp får ASCII-minus', () => {
    expect(oreToSie5Amount(-100)).toBe('-1.00')
    expect(oreToSie5Amount(-1)).toBe('-0.01')
  })

  it('avrundar fraktionella ören (defensivt)', () => {
    expect(oreToSie5Amount(100.4)).toBe('1.00')
    expect(oreToSie5Amount(100.5)).toBe('1.01')
  })

  it('stora belopp: 1 234 567 89 öre → "12345.67"', () => {
    expect(oreToSie5Amount(1234567)).toBe('12345.67')
  })

  it('inget tusentals-mellanslag (SIE5 är decimal-string)', () => {
    expect(oreToSie5Amount(100000000)).toBe('1000000.00')
  })
})

describe('debitCreditToSie5Amount', () => {
  it('debit > 0, credit = 0 → positive', () => {
    expect(debitCreditToSie5Amount(500, 0)).toBe('5.00')
  })

  it('debit = 0, credit > 0 → negative', () => {
    expect(debitCreditToSie5Amount(0, 500)).toBe('-5.00')
  })

  it('båda nollor → "0.00"', () => {
    expect(debitCreditToSie5Amount(0, 0)).toBe('0.00')
  })

  it('balanserad rad (samma debit + credit) → "0.00"', () => {
    expect(debitCreditToSie5Amount(500, 500)).toBe('0.00')
  })

  it('debit > credit → positiv differens', () => {
    expect(debitCreditToSie5Amount(700, 200)).toBe('5.00')
  })
})
