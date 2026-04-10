import { describe, it, expect } from 'vitest'
import { mapAccountType } from '../src/main/services/sie5/account-type-mapper'

describe('mapAccountType', () => {
  // Class 1: Assets
  it('1000 → asset', () => expect(mapAccountType('1000')).toBe('asset'))
  it('1510 → asset', () => expect(mapAccountType('1510')).toBe('asset'))
  it('1930 → asset', () => expect(mapAccountType('1930')).toBe('asset'))
  it('1999 → asset', () => expect(mapAccountType('1999')).toBe('asset'))

  // Class 2: Equity (20xx) vs Liability (21xx-29xx)
  it('2000 → equity', () => expect(mapAccountType('2000')).toBe('equity'))
  it('2081 → equity', () => expect(mapAccountType('2081')).toBe('equity'))
  it('2099 → equity', () => expect(mapAccountType('2099')).toBe('equity'))
  it('2100 → liability', () => expect(mapAccountType('2100')).toBe('liability'))
  it('2440 → liability', () => expect(mapAccountType('2440')).toBe('liability'))
  it('2610 → liability', () => expect(mapAccountType('2610')).toBe('liability'))
  it('2999 → liability', () => expect(mapAccountType('2999')).toBe('liability'))

  // Class 3: Income
  it('3000 → income', () => expect(mapAccountType('3000')).toBe('income'))
  it('3001 → income', () => expect(mapAccountType('3001')).toBe('income'))
  it('3999 → income', () => expect(mapAccountType('3999')).toBe('income'))

  // Class 4-7: Cost
  it('4000 → cost', () => expect(mapAccountType('4000')).toBe('cost'))
  it('4010 → cost', () => expect(mapAccountType('4010')).toBe('cost'))
  it('5010 → cost', () => expect(mapAccountType('5010')).toBe('cost'))
  it('6210 → cost', () => expect(mapAccountType('6210')).toBe('cost'))
  it('7010 → cost', () => expect(mapAccountType('7010')).toBe('cost'))
  it('7999 → cost', () => expect(mapAccountType('7999')).toBe('cost'))

  // Class 8: Financial — with overrides
  it('8000 → income', () => expect(mapAccountType('8000')).toBe('income'))
  it('8069 → income', () => expect(mapAccountType('8069')).toBe('income'))
  it('8070 → cost (disposal loss)', () =>
    expect(mapAccountType('8070')).toBe('cost'))
  it('8080 → cost (disposal loss)', () =>
    expect(mapAccountType('8080')).toBe('cost'))
  it('8089 → cost (disposal loss)', () =>
    expect(mapAccountType('8089')).toBe('cost'))
  it('8090 → income', () => expect(mapAccountType('8090')).toBe('income'))
  it('8100 → income', () => expect(mapAccountType('8100')).toBe('income'))
  it('8310 → income', () => expect(mapAccountType('8310')).toBe('income'))
  it('8399 → income', () => expect(mapAccountType('8399')).toBe('income'))
  it('8400 → cost', () => expect(mapAccountType('8400')).toBe('cost'))
  it('8410 → cost', () => expect(mapAccountType('8410')).toBe('cost'))
  it('8999 → cost', () => expect(mapAccountType('8999')).toBe('cost'))

  // 5-6 digit accounts
  it('19300 → asset (5-digit)', () =>
    expect(mapAccountType('19300')).toBe('asset'))
  it('26100 → liability (5-digit)', () =>
    expect(mapAccountType('26100')).toBe('liability'))
  it('30100 → income (5-digit)', () =>
    expect(mapAccountType('30100')).toBe('income'))
  it('193010 → asset (6-digit)', () =>
    expect(mapAccountType('193010')).toBe('asset'))

  // Invalid inputs
  it('throws on 3-digit number', () =>
    expect(() => mapAccountType('999')).toThrow())
  it('throws on letters', () => expect(() => mapAccountType('abc')).toThrow())
  it('throws on empty string', () => expect(() => mapAccountType('')).toThrow())
  it('throws on 2-digit number', () =>
    expect(() => mapAccountType('12')).toThrow())
})
