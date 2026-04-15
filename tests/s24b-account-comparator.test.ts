import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { compareAccountNumbers } from '../src/shared/account-number'

describe('compareAccountNumbers — unit', () => {
  it('4-siffrig vs 4-siffrig: numerisk ordning (1510 < 3002)', () => {
    expect(compareAccountNumbers('1510', '3002')).toBeLessThan(0)
  })

  it('5-siffrig vs 4-siffrig: numerisk ordning (30000 > 4000)', () => {
    expect(compareAccountNumbers('30000', '4000')).toBeGreaterThan(0)
  })

  it('lika konto returnerar 0', () => {
    expect(compareAccountNumbers('1930', '1930')).toBe(0)
  })

  it('lika prefix, olika suffix (1010 < 1100)', () => {
    expect(compareAccountNumbers('1010', '1100')).toBeLessThan(0)
  })

  it('omvänd ordning av första testet (3002 > 1510)', () => {
    expect(compareAccountNumbers('3002', '1510')).toBeGreaterThan(0)
  })
})

describe('compareAccountNumbers — property-tester (M98-kontrakt)', () => {
  // BAS-konton är 4–5 siffriga numeriska strängar (1000–99999).
  const validAccountNumber = fc
    .integer({ min: 1000, max: 99999 })
    .map(String)

  it('reflexivitet: cmp(a, a) === 0', () => {
    fc.assert(
      fc.property(validAccountNumber, (a) =>
        compareAccountNumbers(a, a) === 0,
      ),
    )
  })

  it('antisymmetri: sign(cmp(a,b)) === -sign(cmp(b,a))', () => {
    fc.assert(
      fc.property(validAccountNumber, validAccountNumber, (a, b) =>
        Math.sign(compareAccountNumbers(a, b)) ===
        -Math.sign(compareAccountNumbers(b, a)),
      ),
    )
  })

  it('transitivitet: cmp(a,b)<=0 && cmp(b,c)<=0 → cmp(a,c)<=0', () => {
    fc.assert(
      fc.property(
        validAccountNumber,
        validAccountNumber,
        validAccountNumber,
        (a, b, c) => {
          if (
            compareAccountNumbers(a, b) <= 0 &&
            compareAccountNumbers(b, c) <= 0
          ) {
            return compareAccountNumbers(a, c) <= 0
          }
          return true
        },
      ),
    )
  })

  it('numerisk konsistens med Number-jämförelse (M98 direkt-kontrakt)', () => {
    fc.assert(
      fc.property(validAccountNumber, validAccountNumber, (a, b) =>
        Math.sign(compareAccountNumbers(a, b)) ===
        Math.sign(Number(a) - Number(b)),
      ),
    )
  })
})
