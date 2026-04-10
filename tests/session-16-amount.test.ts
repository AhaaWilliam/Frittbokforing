import { describe, it, expect } from 'vitest'
import {
  oreToSie5Amount,
  debitCreditToSie5Amount,
} from '../src/main/services/sie5/amount-conversion'

describe('oreToSie5Amount', () => {
  it('0 → "0.00"', () => expect(oreToSie5Amount(0)).toBe('0.00'))
  it('100 → "1.00"', () => expect(oreToSie5Amount(100)).toBe('1.00'))
  it('10000 → "100.00"', () => expect(oreToSie5Amount(10000)).toBe('100.00'))
  it('-5050 → "-50.50"', () => expect(oreToSie5Amount(-5050)).toBe('-50.50'))
  it('1 → "0.01"', () => expect(oreToSie5Amount(1)).toBe('0.01'))
  it('-1 → "-0.01"', () => expect(oreToSie5Amount(-1)).toBe('-0.01'))
  it('123456789 → "1234567.89"', () =>
    expect(oreToSie5Amount(123456789)).toBe('1234567.89'))
  it('50 → "0.50"', () => expect(oreToSie5Amount(50)).toBe('0.50'))
  it('-99 → "-0.99"', () => expect(oreToSie5Amount(-99)).toBe('-0.99'))
})

describe('debitCreditToSie5Amount', () => {
  it('debit only → positive', () =>
    expect(debitCreditToSie5Amount(10000, 0)).toBe('100.00'))
  it('credit only → negative', () =>
    expect(debitCreditToSie5Amount(0, 10000)).toBe('-100.00'))
  it('equal → "0.00"', () =>
    expect(debitCreditToSie5Amount(5000, 5000)).toBe('0.00'))
  it('mixed → net', () =>
    expect(debitCreditToSie5Amount(15000, 5000)).toBe('100.00'))
})
