import { describe, it, expect } from 'vitest'
import { kronorToOre } from '../../src/renderer/lib/format'
import { kronorToOre as accrualKronorToOre } from '../../src/renderer/components/accruals/accrual-constants'
import { krToOre } from '../../src/renderer/components/budget/budget-grid-utils'

/**
 * F-TT-006 regression-test — svensk komma-notation i belopps-input.
 *
 * Tre kronor-till-öre-konverterare måste alla hantera:
 * - "99,50" → 9950 (inte 9900)
 * - "99.50" → 9950
 * - "  99,50  " → 9950 (med whitespace)
 * - "" → 0
 * - "abc" → 0 (säker fallback)
 */

describe('F-TT-006 — kronorToOre/krToOre hanterar svensk komma', () => {
  const variants = {
    format: kronorToOre,
    accrual: accrualKronorToOre,
    budget: krToOre,
  }

  for (const [name, fn] of Object.entries(variants)) {
    describe(name, () => {
      it('svensk komma: "99,50" → 9950', () => {
        expect(fn('99,50')).toBe(9950)
      })

      it('engelsk punkt: "99.50" → 9950', () => {
        expect(fn('99.50')).toBe(9950)
      })

      it('heltal: "100" → 10000', () => {
        expect(fn('100')).toBe(10000)
      })

      it('whitespace trimmas', () => {
        expect(fn('  99,50  ')).toBe(9950)
      })

      it('tom sträng → 0', () => {
        expect(fn('')).toBe(0)
      })

      it('icke-numerisk → 0', () => {
        expect(fn('abc')).toBe(0)
      })

      it('regression: tidigare tappade komma-decimaler', () => {
        // parseFloat("99,50") = 99 → gav 9900 före fix
        expect(fn('99,50')).not.toBe(9900)
      })
    })
  }
})
