import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  computeScore,
  classifyCandidates,
  normalizeIban,
  daysBetween,
} from '../../src/main/services/bank/bank-match-suggester'
import type { EntityMatchCandidate } from '../../src/main/services/bank/bank-match-suggester'

/**
 * Property-based tester för bank-match-suggester.ts (M153).
 *
 * M153: scoring-funktioner ska vara:
 * 1. Heltalspoäng (inga floats i score/thresholds)
 * 2. Deterministiska (ingen random/Date.now/performance.now)
 * 3. Rena (samma input → samma output)
 */

// ─── Generatorer ─────────────────────────────────────────────────────────────

const dateGen = fc.integer({ min: 1, max: 365 }).map((d) => {
  const dt = new Date(2026, 0, 1)
  dt.setDate(dt.getDate() + d - 1)
  return dt.toISOString().substring(0, 10)
})

const oreGen = fc.integer({ min: 1, max: 1_000_000_000 })

// ScoringInput utan IBAN/ref (baseline)
const baseInputGen = fc.record({
  txAmountOre: oreGen,
  txValueDate: dateGen,
  txRemittanceInfo: fc.constant(null) as fc.Arbitrary<string | null>,
  txCounterpartyIban: fc.constant(null) as fc.Arbitrary<string | null>,
  candRemainingOre: oreGen,
  candDate: dateGen,
  candCounterpartyIban: fc.constant(null) as fc.Arbitrary<string | null>,
  candNumber: fc.constant(null) as fc.Arbitrary<string | null>,
  candOcrNumber: fc.constant(null) as fc.Arbitrary<string | null>,
})

// ─── M153: heltalspoäng ───────────────────────────────────────────────────────

describe('computeScore — M153 heltalspoäng', () => {
  it('score är alltid icke-negativt heltal', () => {
    fc.assert(
      fc.property(baseInputGen, (input) => {
        const { score } = computeScore(input)
        return Number.isInteger(score) && score >= 0
      }),
      { numRuns: 1000 },
    )
  })

  it('score är alltid icke-negativt heltal med alla signaler aktiva', () => {
    fc.assert(
      fc.property(
        oreGen,
        dateGen,
        fc.string({ minLength: 5, maxLength: 20 }),
        (amount, date, ref) => {
          const input = {
            txAmountOre: amount,
            txValueDate: date,
            txRemittanceInfo: ref,
            txCounterpartyIban: null,
            candRemainingOre: amount, // exakt belopp → +100
            candDate: date, // exakt datum → +30
            candCounterpartyIban: null,
            candNumber: ref, // ref-match → +40
            candOcrNumber: null,
          }
          const { score } = computeScore(input)
          return Number.isInteger(score) && score >= 0
        },
      ),
      { numRuns: 500 },
    )
  })
})

// ─── M153: determinism ────────────────────────────────────────────────────────

describe('computeScore — M153 determinism', () => {
  it('samma input ger samma score vid upprepade anrop', () => {
    fc.assert(
      fc.property(baseInputGen, (input) => {
        const r1 = computeScore(input)
        const r2 = computeScore(input)
        return r1.score === r2.score && r1.method === r2.method
      }),
      { numRuns: 1000 },
    )
  })

  it('identiska ScoringInput-objekt (djup kopia) ger identisk output', () => {
    fc.assert(
      fc.property(baseInputGen, (input) => {
        const copy = { ...input }
        const r1 = computeScore(input)
        const r2 = computeScore(copy)
        return r1.score === r2.score && r1.method === r2.method
      }),
      { numRuns: 500 },
    )
  })
})

// ─── Score-komponenter: exakta additivt-värden ────────────────────────────────

describe('computeScore — score-komponenter', () => {
  it('exakt belopp (diff=0) adderar exakt 100 jämfört med ingen belopps-match', () => {
    fc.assert(
      fc.property(
        oreGen,
        dateGen,
        fc.integer({ min: 51, max: 10_000 }), // mismatch > 50 → ingen belopps-signal
        (amount, date, delta) => {
          const exact = computeScore({
            txAmountOre: amount,
            txValueDate: date,
            txRemittanceInfo: null,
            txCounterpartyIban: null,
            candRemainingOre: amount, // exakt match
            candDate: date,
            candCounterpartyIban: null,
            candNumber: null,
            candOcrNumber: null,
          })
          const miss = computeScore({
            txAmountOre: amount,
            txValueDate: date,
            txRemittanceInfo: null,
            txCounterpartyIban: null,
            candRemainingOre: amount + delta, // ingen belopps-match (>50 öre diff)
            candDate: date,
            candCounterpartyIban: null,
            candNumber: null,
            candOcrNumber: null,
          })
          return exact.score === miss.score + 100
        },
      ),
      { numRuns: 500 },
    )
  })

  it('exakt datum adderar exakt 30 jämfört med datum 60 dagar bort (ingen datumpoäng)', () => {
    fc.assert(
      fc.property(oreGen, dateGen, (amount, _date) => {
        // Beräkna ett datum >30 dagar bort för att säkerställa 0 datumpoäng
        const farDate = '2026-12-31'
        const nearDate = '2026-01-01'
        // Använd kända datum utanför 30-dagarsintervallet
        const exact = computeScore({
          txAmountOre: amount + 1000, // diff > 50 → ingen belopps-signal
          txValueDate: nearDate,
          txRemittanceInfo: null,
          txCounterpartyIban: null,
          candRemainingOre: amount,
          candDate: nearDate, // exakt datum
          candCounterpartyIban: null,
          candNumber: null,
          candOcrNumber: null,
        })
        const far = computeScore({
          txAmountOre: amount + 1000,
          txValueDate: nearDate,
          txRemittanceInfo: null,
          txCounterpartyIban: null,
          candRemainingOre: amount,
          candDate: farDate, // > 30 dagar bort → 0 datumpoäng
          candCounterpartyIban: null,
          candNumber: null,
          candOcrNumber: null,
        })
        return exact.score === far.score + 30
      }),
      { numRuns: 300 },
    )
  })

  it('IBAN-match adderar exakt 50 när IBAN matchar vs ingen IBAN', () => {
    const IBAN = 'SE4550000000058398257466'
    fc.assert(
      fc.property(
        oreGen,
        dateGen,
        fc.integer({ min: 51, max: 10_000 }),
        (amount, date, delta) => {
          const withIban = computeScore({
            txAmountOre: amount,
            txValueDate: date,
            txRemittanceInfo: null,
            txCounterpartyIban: IBAN,
            candRemainingOre: amount + delta, // ingen belopps-match
            candDate: date,
            candCounterpartyIban: IBAN, // IBAN-match
            candNumber: null,
            candOcrNumber: null,
          })
          const noIban = computeScore({
            txAmountOre: amount,
            txValueDate: date,
            txRemittanceInfo: null,
            txCounterpartyIban: null, // ingen IBAN
            candRemainingOre: amount + delta,
            candDate: date,
            candCounterpartyIban: IBAN,
            candNumber: null,
            candOcrNumber: null,
          })
          return withIban.score === noIban.score + 50
        },
      ),
      { numRuns: 300 },
    )
  })

  it('score utan några signaler = 0', () => {
    fc.assert(
      fc.property(
        oreGen,
        fc.integer({ min: 51, max: 10_000 }),
        (amount, delta) => {
          const { score } = computeScore({
            txAmountOre: amount,
            txValueDate: '2026-01-01',
            txRemittanceInfo: null,
            txCounterpartyIban: null,
            candRemainingOre: amount + delta, // ingen belopps-match
            candDate: '2026-12-31', // > 30 dagar → 0 datumpoäng
            candCounterpartyIban: null,
            candNumber: null,
            candOcrNumber: null,
          })
          return score === 0
        },
      ),
      { numRuns: 300 },
    )
  })
})

// ─── Method-prioritering ──────────────────────────────────────────────────────

describe('computeScore — method-prioritering', () => {
  it('IBAN-match → method = auto_iban (oavsett andra signaler)', () => {
    const IBAN = 'SE4550000000058398257466'
    fc.assert(
      fc.property(oreGen, dateGen, (amount, date) => {
        const { method } = computeScore({
          txAmountOre: amount,
          txValueDate: date,
          txRemittanceInfo: 'INV-001',
          txCounterpartyIban: IBAN,
          candRemainingOre: amount, // exakt belopp
          candDate: date, // exakt datum
          candCounterpartyIban: IBAN,
          candNumber: 'INV-001',
          candOcrNumber: null,
        })
        return method === 'auto_iban'
      }),
      { numRuns: 300 },
    )
  })

  it('ingen IBAN + ref-match → method = auto_amount_ref', () => {
    fc.assert(
      fc.property(oreGen, dateGen, (amount, date) => {
        const { method } = computeScore({
          txAmountOre: amount,
          txValueDate: date,
          txRemittanceInfo: 'INV-42',
          txCounterpartyIban: null,
          candRemainingOre: amount,
          candDate: date,
          candCounterpartyIban: null,
          candNumber: 'INV-42',
          candOcrNumber: null,
        })
        return method === 'auto_amount_ref'
      }),
      { numRuns: 300 },
    )
  })

  it('exakt belopp + exakt datum utan IBAN/ref → method = auto_amount_date', () => {
    fc.assert(
      fc.property(
        oreGen,
        dateGen,
        fc.integer({ min: 101, max: 10_000 }),
        (amount, date, delta) => {
          // Säkerställ att remittanceInfo INTE matchar candNumber
          const { method } = computeScore({
            txAmountOre: amount,
            txValueDate: date,
            txRemittanceInfo: null,
            txCounterpartyIban: null,
            candRemainingOre: amount, // exakt
            candDate: date, // exakt
            candCounterpartyIban: null,
            candNumber: `unrelated-${delta}`,
            candOcrNumber: null,
          })
          return method === 'auto_amount_date'
        },
      ),
      { numRuns: 300 },
    )
  })
})

// ─── classifyCandidates — K5-klassificering ───────────────────────────────────

type EntityCandidateNoConfidence = Omit<EntityMatchCandidate, 'confidence'>

function makeCandidate(
  id: number,
  score: number,
  date: string = '2026-03-01',
): EntityCandidateNoConfidence {
  return {
    entity_type: 'invoice',
    entity_id: id,
    entity_number: `INV-${id}`,
    counterparty_name: 'Kund AB',
    total_amount_ore: 100_00,
    remaining_ore: 100_00,
    entity_date: date,
    due_date: date,
    score,
    method: 'auto_amount_exact',
    reasons: [],
  }
}

describe('classifyCandidates — K5-klassificering', () => {
  it('returnerar max 5 kandidater', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.integer({ min: 1, max: 200 }).map((s) => makeCandidate(s, s)),
          { minLength: 6, maxLength: 20 },
        ),
        (candidates) => {
          const result = classifyCandidates(candidates)
          return result.length <= 5
        },
      ),
      { numRuns: 500 },
    )
  })

  it('HIGH kräver score ≥ 130 OCH unik toppkandidatur', () => {
    // Enda kandidat med score 130 → HIGH
    const single = classifyCandidates([makeCandidate(1, 130)])
    expect(single[0]).toMatchObject({ confidence: 'HIGH' })

    // Tie: två med score 130 → båda MEDIUM
    const tie = classifyCandidates([
      makeCandidate(1, 130),
      makeCandidate(2, 130),
    ])
    for (const c of tie) {
      expect(c).toMatchObject({ confidence: 'MEDIUM' })
    }
  })

  it('score < 80 → filtreras bort', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.integer({ min: 0, max: 79 }).map((s) => makeCandidate(s, s)),
          {
            minLength: 1,
            maxLength: 10,
          },
        ),
        (candidates) => {
          const result = classifyCandidates(candidates)
          return result.length === 0
        },
      ),
      { numRuns: 300 },
    )
  })

  it('80 ≤ score < 130 → MEDIUM', () => {
    fc.assert(
      fc.property(fc.integer({ min: 80, max: 129 }), (score) => {
        const result = classifyCandidates([makeCandidate(1, score)])
        return result.length === 1 && result[0].confidence === 'MEDIUM'
      }),
      { numRuns: 200 },
    )
  })

  it('sorteras på score DESC (högst score hamnar först)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.integer({ min: 80, max: 200 }).map((s) => makeCandidate(s, s)),
          {
            minLength: 2,
            maxLength: 10,
          },
        ),
        (candidates) => {
          const result = classifyCandidates(candidates)
          for (let i = 1; i < result.length; i++) {
            if (result[i - 1].score < result[i].score) return false
          }
          return true
        },
      ),
      { numRuns: 500 },
    )
  })

  it('tom kandidatlista → tom output', () => {
    expect(classifyCandidates([])).toEqual([])
  })
})

// ─── Hjälpfunktioner ──────────────────────────────────────────────────────────

describe('normalizeIban — M153 ren funktion', () => {
  it('tar bort blanksteg och konverterar till versaler', () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 4, maxLength: 34 })
          .map((s) => s.replace(/[^\w]/g, 'X')),
        (iban) => {
          const result = normalizeIban(iban)
          return !result.includes(' ') && result === result.toUpperCase()
        },
      ),
      { numRuns: 500 },
    )
  })

  it('idempotent: normalizeIban(normalizeIban(x)) === normalizeIban(x)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 4, maxLength: 34 }),
        (iban) => normalizeIban(normalizeIban(iban)) === normalizeIban(iban),
      ),
      { numRuns: 500 },
    )
  })
})

describe('daysBetween — M153 deterministisk', () => {
  it('returnerar alltid icke-negativt heltal', () => {
    fc.assert(
      fc.property(dateGen, dateGen, (a, b) => {
        const d = daysBetween(a, b)
        return Number.isInteger(d) && d >= 0
      }),
      { numRuns: 1000 },
    )
  })

  it('symmetri: daysBetween(a,b) === daysBetween(b,a)', () => {
    fc.assert(
      fc.property(dateGen, dateGen, (a, b) => {
        return daysBetween(a, b) === daysBetween(b, a)
      }),
      { numRuns: 1000 },
    )
  })

  it('samma datum → 0 dagar', () => {
    fc.assert(
      fc.property(dateGen, (d) => daysBetween(d, d) === 0),
      { numRuns: 500 },
    )
  })

  it('deterministisk: upprepade anrop ger samma resultat', () => {
    fc.assert(
      fc.property(dateGen, dateGen, (a, b) => {
        return daysBetween(a, b) === daysBetween(a, b)
      }),
      { numRuns: 500 },
    )
  })
})
