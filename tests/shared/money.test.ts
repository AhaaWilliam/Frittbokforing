import { describe, it, expect } from 'vitest'
import { multiplyKrToOre, multiplyDecimalByOre } from '../../src/shared/money'

// M131 — monetär heltalsaritmetik.
// Dessa tester dödar Stryker-mutanter som tidigare överlevde (Phase 1).

describe('multiplyKrToOre — qty (decimal) × price (kr decimal) → öre', () => {
  it('heltalspris × heltalsqty → öre', () => {
    expect(multiplyKrToOre(1, 100)).toBe(10000)
    expect(multiplyKrToOre(3, 250)).toBe(75000)
  })

  it('fraktionell qty × decimalpris — F44-domän', () => {
    // 0.29 * 50 kr = 14.50 kr = 1450 öre. Native float ger 14.499...
    expect(multiplyKrToOre(0.29, 50)).toBe(1450)
    expect(multiplyKrToOre(1.5, 99.9)).toBe(14985)
    expect(multiplyKrToOre(2.5, 19.99)).toBe(4998) // 49.975 → 49.98 kr
  })

  it('noll-operander → 0', () => {
    expect(multiplyKrToOre(0, 100)).toBe(0)
    expect(multiplyKrToOre(5, 0)).toBe(0)
    expect(multiplyKrToOre(0, 0)).toBe(0)
  })

  it('monotont växande i priset (samma qty)', () => {
    expect(multiplyKrToOre(2, 10)).toBeLessThan(multiplyKrToOre(2, 11))
    expect(multiplyKrToOre(1.5, 10.5)).toBeLessThan(multiplyKrToOre(1.5, 10.51))
  })

  it('monotont växande i qty (samma pris)', () => {
    expect(multiplyKrToOre(1, 100)).toBeLessThan(multiplyKrToOre(2, 100))
    expect(multiplyKrToOre(1.5, 50.5)).toBeLessThan(multiplyKrToOre(1.51, 50.5))
  })

  it('returnerar alltid heltal', () => {
    const samples: Array<[number, number]> = [
      [0.01, 0.01],
      [1.23, 4.56],
      [99.99, 99.99],
      [0.5, 0.5],
      [2.33, 7.77],
    ]
    for (const [q, p] of samples) {
      const r = multiplyKrToOre(q, p)
      expect(Number.isInteger(r)).toBe(true)
    }
  })

  it('ekvivalens: multiplyKrToOre(q, p) === multiplyDecimalByOre(q, p*100)', () => {
    // Kommuterar med pre-normaliserad öre-version
    expect(multiplyKrToOre(1.5, 99.99)).toBe(multiplyDecimalByOre(1.5, 9999))
    expect(multiplyKrToOre(0.29, 50)).toBe(multiplyDecimalByOre(0.29, 5000))
    expect(multiplyKrToOre(3, 100)).toBe(multiplyDecimalByOre(3, 10000))
  })

  it('F44-karakterisering: helper är stabil i ≤2-decimal-domänen', () => {
    // M131 garanterar korrekthet när BÅDA operander har ≤2 decimaler
    // (Zod-refine enforcar detta i form- och IPC-schemas).
    // Karakterisering från S67b visar 0.346% fel-rate i native multiplikation,
    // 0% i helpern inom domänen.
    expect(multiplyKrToOre(0.29, 50)).toBe(1450)
    expect(multiplyKrToOre(0.1, 0.2)).toBe(2)
    expect(multiplyKrToOre(99.99, 99.99)).toBe(999800) // 9998.0001 kr → 9998.00
  })
})

describe('multiplyDecimalByOre — qty (decimal) × price (öre heltal) → öre', () => {
  it('heltalspris × heltalsqty', () => {
    expect(multiplyDecimalByOre(1, 10000)).toBe(10000)
    expect(multiplyDecimalByOre(3, 25000)).toBe(75000)
  })

  it('fraktionell qty × öre-pris', () => {
    expect(multiplyDecimalByOre(0.29, 5000)).toBe(1450)
    expect(multiplyDecimalByOre(1.5, 9990)).toBe(14985)
    expect(multiplyDecimalByOre(2.5, 1999)).toBe(4998)
  })

  it('noll-operander → 0', () => {
    expect(multiplyDecimalByOre(0, 10000)).toBe(0)
    expect(multiplyDecimalByOre(5, 0)).toBe(0)
  })

  it('monotont växande i priset', () => {
    expect(multiplyDecimalByOre(2, 1000)).toBeLessThan(
      multiplyDecimalByOre(2, 1100),
    )
  })

  it('returnerar alltid heltal', () => {
    const samples: Array<[number, number]> = [
      [0.01, 1],
      [1.23, 456],
      [99.99, 9999],
      [0.5, 50],
      [2.33, 777],
    ]
    for (const [q, p] of samples) {
      const r = multiplyDecimalByOre(q, p)
      expect(Number.isInteger(r)).toBe(true)
    }
  })

  it('identitet: multiplyDecimalByOre(1, X) === X', () => {
    expect(multiplyDecimalByOre(1, 12345)).toBe(12345)
    expect(multiplyDecimalByOre(1, 0)).toBe(0)
  })

  it('dubbling: multiplyDecimalByOre(2, X) === 2*X för heltals-X', () => {
    expect(multiplyDecimalByOre(2, 5000)).toBe(10000)
    expect(multiplyDecimalByOre(2, 12345)).toBe(24690)
  })

  it('F44-regress: multiplyDecimalByOre(0.29, 5000) === 1450 (ej 1449)', () => {
    const naive = Math.round(0.29 * 5000)
    // Native ger rätt här för just dessa värden (0.29 * 5000 = 1450 exakt),
    // men formeln i helpern säkerställer precision över HELA domänen.
    expect(naive).toBe(1450)
    expect(multiplyDecimalByOre(0.29, 5000)).toBe(1450)
  })
})
