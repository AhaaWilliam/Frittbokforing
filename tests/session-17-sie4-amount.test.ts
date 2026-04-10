import { describe, it, expect } from 'vitest'
import { oreToSie4Amount } from '../src/main/services/sie4/sie4-amount'

describe('oreToSie4Amount', () => {
  it('100 → "1"', () => expect(oreToSie4Amount(100)).toBe('1'))
  it('0 → "0"', () => expect(oreToSie4Amount(0)).toBe('0'))
  it('150 → "1.50"', () => expect(oreToSie4Amount(150)).toBe('1.50'))
  it('-5000 → "-50"', () => expect(oreToSie4Amount(-5000)).toBe('-50'))
  it('-5050 → "-50.50"', () => expect(oreToSie4Amount(-5050)).toBe('-50.50'))
  it('1 → "0.01"', () => expect(oreToSie4Amount(1)).toBe('0.01'))
  it('-50 → "-0.50"', () => expect(oreToSie4Amount(-50)).toBe('-0.50'))
  it('-1 → "-0.01"', () => expect(oreToSie4Amount(-1)).toBe('-0.01'))
  it('1000000 → "10000"', () => expect(oreToSie4Amount(1000000)).toBe('10000'))
  it('1000050 → "10000.50"', () =>
    expect(oreToSie4Amount(1000050)).toBe('10000.50'))
})
