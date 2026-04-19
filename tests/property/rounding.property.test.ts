import { describe, it } from 'vitest'
import fc from 'fast-check'

/**
 * Property-based tester för öresutjämning (M99).
 *
 * Regel: `Math.abs(diff) <= ROUNDING_THRESHOLD && remaining > 0` triggar
 * öresutjämning, där `diff = input.amount - remaining`.
 * ROUNDING_THRESHOLD = 50 öre.
 *
 * Dessa properties testar villkoret som en ren funktion utan att behöva
 * gå via payInvoice/payExpense (som kräver DB).
 */

const ROUNDING_THRESHOLD = 50

function shouldRound(inputAmount: number, remaining: number): boolean {
  const diff = inputAmount - remaining
  return Math.abs(diff) <= ROUNDING_THRESHOLD && remaining > 0
}

// Kontraktet: om shouldRound returnerar true, ska öresutjämning bokföras
// och tecken baseras på diff.
function roundingSign(
  inputAmount: number,
  remaining: number,
): 'debit' | 'credit' | null {
  if (!shouldRound(inputAmount, remaining)) return null
  const diff = inputAmount - remaining
  // diff > 0 → användaren betalade mer → kredit på 3740
  // diff < 0 → användaren betalade mindre → debet på 3740
  if (diff === 0) return null
  return diff > 0 ? 'credit' : 'debit'
}

describe('öresutjämning — M99 property invarianter', () => {
  const amountGen = fc.integer({ min: 1, max: 100_000_000 })

  it('inga negativa amounts eller remaining i kontraktet', () => {
    // input till shouldRound förutsätter positiva heltal (öre)
    fc.assert(
      fc.property(amountGen, amountGen, (a, r) => {
        const res = shouldRound(a, r)
        return typeof res === 'boolean'
      }),
      { numRuns: 500 },
    )
  })

  it('diff utanför ±50 öre → ingen öresutjämning', () => {
    fc.assert(
      fc.property(
        amountGen,
        fc.integer({ min: 51, max: 10_000 }),
        fc.boolean(),
        (remaining, delta, isOver) => {
          const input = isOver ? remaining + delta : remaining - delta
          // input kan bli negativt i second case — guard:
          fc.pre(input > 0)
          return shouldRound(input, remaining) === false
        },
      ),
      { numRuns: 1000 },
    )
  })

  it('diff inom ±50 öre och remaining > 0 → öresutjämning', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 10_000_000 }), // remaining > 50 säkert
        fc.integer({ min: 1, max: 50 }),
        fc.boolean(),
        (remaining, delta, isOver) => {
          const input = isOver ? remaining + delta : remaining - delta
          return shouldRound(input, remaining) === true
        },
      ),
      { numRuns: 1000 },
    )
  })

  it('remaining === 0 → aldrig öresutjämning', () => {
    fc.assert(
      fc.property(amountGen, (a) => shouldRound(a, 0) === false),
      { numRuns: 500 },
    )
  })

  it('exakt match (diff === 0) → ingen 3740-rad (sign är null)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        (r) => roundingSign(r, r) === null,
      ),
      { numRuns: 500 },
    )
  })

  it('överbetalning (diff > 0) inom threshold → credit på 3740', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 10_000_000 }),
        fc.integer({ min: 1, max: 50 }),
        (remaining, over) => {
          return roundingSign(remaining + over, remaining) === 'credit'
        },
      ),
      { numRuns: 500 },
    )
  })

  it('underbetalning (diff < 0) inom threshold → debet på 3740', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 10_000_000 }),
        fc.integer({ min: 1, max: 50 }),
        (remaining, under) => {
          return roundingSign(remaining - under, remaining) === 'debit'
        },
      ),
      { numRuns: 500 },
    )
  })

  it('threshold exact-boundary: diff === ±50 → öresutjämning (inklusive)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 10_000_000 }), (r) => {
        return (
          shouldRound(r + 50, r) === true && shouldRound(r - 50, r) === true
        )
      }),
      { numRuns: 500 },
    )
  })

  it('threshold just över: diff === ±51 → INGEN öresutjämning', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 10_000_000 }), (r) => {
        return (
          shouldRound(r + 51, r) === false && shouldRound(r - 51, r) === false
        )
      }),
      { numRuns: 500 },
    )
  })
})
