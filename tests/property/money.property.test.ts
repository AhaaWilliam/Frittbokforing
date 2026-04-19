import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { multiplyKrToOre, multiplyDecimalByOre } from '../../src/shared/money'

/**
 * Property-based tests för M131 — heltalsaritmetik för monetär multiplikation.
 *
 * Domän: qty ∈ [0, 999999] med ≤2 decimaler, pris ∈ [0, 999999.99].
 * Zod-refine enforcar 2-decimals-invariant i form- och IPC-scheman; dessa
 * properties testar korrekthet INOM den garanterade domänen.
 */

// Generator: tal med exakt ≤2 decimaler (ingen IEEE 754-drift)
const decimal2 = (max: number) =>
  fc
    .integer({ min: 0, max: max * 100 })
    .map((n) => Math.round(n) / 100)

const qtyGen = decimal2(9999) // [0, 9999.99]
const priceKrGen = decimal2(999999) // [0, 999999.99]
const priceOreGen = fc.integer({ min: 0, max: 99999999 })

describe('multiplyKrToOre — M131 properties', () => {
  it('returnerar alltid icke-negativt heltal', () => {
    fc.assert(
      fc.property(qtyGen, priceKrGen, (q, p) => {
        const r = multiplyKrToOre(q, p)
        return Number.isInteger(r) && r >= 0
      }),
      { numRuns: 1000 },
    )
  })

  it('noll-fall: qty=0 eller price=0 → 0', () => {
    fc.assert(
      fc.property(qtyGen, priceKrGen, (q, p) => {
        expect(multiplyKrToOre(0, p)).toBe(0)
        expect(multiplyKrToOre(q, 0)).toBe(0)
      }),
      { numRuns: 500 },
    )
  })

  it('monotonicitet i priset: p1 ≤ p2 → result1 ≤ result2 (q > 0)', () => {
    fc.assert(
      fc.property(
        fc
          .tuple(decimal2(100).filter((q) => q > 0), priceKrGen, priceKrGen)
          .map(([q, a, b]) => [q, Math.min(a, b), Math.max(a, b)] as const),
        ([q, p1, p2]) => multiplyKrToOre(q, p1) <= multiplyKrToOre(q, p2),
      ),
      { numRuns: 1000 },
    )
  })

  it('monotonicitet i qty: q1 ≤ q2 → result1 ≤ result2 (p > 0)', () => {
    fc.assert(
      fc.property(
        fc
          .tuple(qtyGen, qtyGen, decimal2(100).filter((p) => p > 0))
          .map(([a, b, p]) => [Math.min(a, b), Math.max(a, b), p] as const),
        ([q1, q2, p]) => multiplyKrToOre(q1, p) <= multiplyKrToOre(q2, p),
      ),
      { numRuns: 1000 },
    )
  })

  it('ekvivalens med multiplyDecimalByOre vid pre-normalisering', () => {
    // Invariant: multiplyKrToOre(q, p) === multiplyDecimalByOre(q, Math.round(p*100))
    fc.assert(
      fc.property(qtyGen, priceKrGen, (q, p) => {
        const pOre = Math.round(p * 100)
        return multiplyKrToOre(q, p) === multiplyDecimalByOre(q, pOre)
      }),
      { numRuns: 1000 },
    )
  })

  it('kommutativitet med identitet qty=1: multiplyKrToOre(1, p) === Math.round(p*100)', () => {
    fc.assert(
      fc.property(priceKrGen, (p) => {
        return multiplyKrToOre(1, p) === Math.round(p * 100)
      }),
      { numRuns: 1000 },
    )
  })

  it('upper bound: result ≤ qty * priceKr * 100 + 1 (tolerans 1 öre)', () => {
    fc.assert(
      fc.property(qtyGen, priceKrGen, (q, p) => {
        const naive = q * p * 100
        const r = multiplyKrToOre(q, p)
        return Math.abs(r - naive) <= 1
      }),
      { numRuns: 1000 },
    )
  })
})

describe('multiplyDecimalByOre — M131 properties', () => {
  it('returnerar alltid icke-negativt heltal', () => {
    fc.assert(
      fc.property(qtyGen, priceOreGen, (q, p) => {
        const r = multiplyDecimalByOre(q, p)
        return Number.isInteger(r) && r >= 0
      }),
      { numRuns: 1000 },
    )
  })

  it('identitet: multiplyDecimalByOre(1, X) === X', () => {
    fc.assert(
      fc.property(priceOreGen, (p) => {
        return multiplyDecimalByOre(1, p) === p
      }),
      { numRuns: 1000 },
    )
  })

  it('dubbling: multiplyDecimalByOre(2, X) === 2*X', () => {
    fc.assert(
      fc.property(priceOreGen, (p) => {
        return multiplyDecimalByOre(2, p) === 2 * p
      }),
      { numRuns: 1000 },
    )
  })

  it('noll-fall', () => {
    fc.assert(
      fc.property(qtyGen, priceOreGen, (q, p) => {
        expect(multiplyDecimalByOre(0, p)).toBe(0)
        expect(multiplyDecimalByOre(q, 0)).toBe(0)
      }),
      { numRuns: 500 },
    )
  })

  it('heltals-qty × heltals-pris bevarar exakt multiplikation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 9999 }),
        priceOreGen,
        (q, p) => multiplyDecimalByOre(q, p) === q * p,
      ),
      { numRuns: 1000 },
    )
  })
})
