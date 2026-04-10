import { describe, it, expect } from 'vitest'
import { mapSie4AccountType } from '../src/main/services/sie4/sie4-account-type-mapper'

describe('mapSie4AccountType', () => {
  // Class 1: T (Tillgång)
  it('1000 → T', () => expect(mapSie4AccountType('1000')).toBe('T'))
  it('1510 → T', () => expect(mapSie4AccountType('1510')).toBe('T'))
  it('1930 → T', () => expect(mapSie4AccountType('1930')).toBe('T'))

  // Class 2: S (Skuld) — includes equity!
  it('2081 → S (EK = S i SIE4)', () =>
    expect(mapSie4AccountType('2081')).toBe('S'))
  it('2099 → S', () => expect(mapSie4AccountType('2099')).toBe('S'))
  it('2440 → S', () => expect(mapSie4AccountType('2440')).toBe('S'))
  it('2610 → S', () => expect(mapSie4AccountType('2610')).toBe('S'))

  // Class 3: I (Intäkt)
  it('3001 → I', () => expect(mapSie4AccountType('3001')).toBe('I'))
  it('3999 → I', () => expect(mapSie4AccountType('3999')).toBe('I'))

  // Class 4-7: K (Kostnad)
  it('4010 → K', () => expect(mapSie4AccountType('4010')).toBe('K'))
  it('5010 → K', () => expect(mapSie4AccountType('5010')).toBe('K'))
  it('7010 → K', () => expect(mapSie4AccountType('7010')).toBe('K'))

  // Class 8: Mixed
  it('8310 → I (ränteintäkt)', () =>
    expect(mapSie4AccountType('8310')).toBe('I'))
  it('8070 → K (avyttring)', () => expect(mapSie4AccountType('8070')).toBe('K'))
  it('8410 → K (räntekostnad)', () =>
    expect(mapSie4AccountType('8410')).toBe('K'))

  // 5-digit
  it('19300 → T (5-digit)', () => expect(mapSie4AccountType('19300')).toBe('T'))

  // Invalid
  it('throws on 3-digit', () =>
    expect(() => mapSie4AccountType('999')).toThrow())
  it('throws on empty', () => expect(() => mapSie4AccountType('')).toThrow())
  it('throws on letters', () =>
    expect(() => mapSie4AccountType('abc')).toThrow())
})
