import { describe, it } from 'vitest'
import fc from 'fast-check'
import { multiplyDecimalByOre } from '../../src/shared/money'

/**
 * Property-based tester för invoice-service.ts (M131/M137).
 *
 * processLines och buildJournalLines innehåller kritisk beloppsaritmetik.
 * Dessa tester verifierar de rena beräknings-invarianterna utan DB-beroende.
 *
 * M131: heltalsaritmetik — `Math.round((Math.round(qty * 100) * priceOre) / 100)`
 * M137: sign-flip — belopp positiva i DB, D/K byts i journal-byggaren
 */

// ─── Generatorer ─────────────────────────────────────────────────────────────

// Fakturerad quantity: REAL med ≤2 decimaler (M130)
const decimal2 = (max: number) =>
  fc.integer({ min: 1, max: max * 100 }).map((n) => Math.round(n) / 100)

const qtyGen = decimal2(9999) // [0.01, 9999.99]
const priceOreGen = fc.integer({ min: 1, max: 99_999_999 }) // 1 öre – 999 999.99 kr
// Svenska momssatser (lagrade som 0, 6, 12, 25 i DB)
const vatRateGen = fc.constantFrom(0, 6, 12, 25)

// ─── Ren kalkyl (speglar processLines exakt) ─────────────────────────────────

function calcLineTotal(qty: number, unitPriceOre: number): number {
  return Math.round((Math.round(qty * 100) * unitPriceOre) / 100)
}

function calcLineVat(lineTotalOre: number, vatRatePercent: number): number {
  return Math.round(lineTotalOre * (vatRatePercent / 100))
}

// Sammansatt rad
interface Line {
  qty: number
  unitPriceOre: number
  vatRatePercent: number
}

const lineGen = fc.record<Line>({
  qty: qtyGen,
  unitPriceOre: priceOreGen,
  vatRatePercent: vatRateGen,
})

function calcTotals(lines: Line[]) {
  let totalAmount = 0
  let vatAmount = 0
  for (const l of lines) {
    const lineTotal = calcLineTotal(l.qty, l.unitPriceOre)
    const lineVat = calcLineVat(lineTotal, l.vatRatePercent)
    totalAmount += lineTotal
    vatAmount += lineVat
  }
  return { totalAmount, vatAmount }
}

// ─── M131: heltalsaritmetik ───────────────────────────────────────────────────

describe('processLines — M131 heltalsaritmetik', () => {
  it('lineTotal är alltid icke-negativt heltal', () => {
    fc.assert(
      fc.property(qtyGen, priceOreGen, (qty, price) => {
        const result = calcLineTotal(qty, price)
        return Number.isInteger(result) && result >= 0
      }),
      { numRuns: 1000 },
    )
  })

  it('lineVat är alltid icke-negativt heltal', () => {
    fc.assert(
      fc.property(lineGen, (l) => {
        const lineTotal = calcLineTotal(l.qty, l.unitPriceOre)
        const lineVat = calcLineVat(lineTotal, l.vatRatePercent)
        return Number.isInteger(lineVat) && lineVat >= 0
      }),
      { numRuns: 1000 },
    )
  })

  it('0% moms → lineVat === 0', () => {
    fc.assert(
      fc.property(qtyGen, priceOreGen, (qty, price) => {
        const lineTotal = calcLineTotal(qty, price)
        return calcLineVat(lineTotal, 0) === 0
      }),
      { numRuns: 500 },
    )
  })

  it('formel identisk med multiplyDecimalByOre (M131 single source of truth)', () => {
    fc.assert(
      fc.property(qtyGen, priceOreGen, (qty, price) => {
        return calcLineTotal(qty, price) === multiplyDecimalByOre(qty, price)
      }),
      { numRuns: 1000 },
    )
  })

  it('lineVat ≤ lineTotal (rate ≤ 100%)', () => {
    fc.assert(
      fc.property(lineGen, (l) => {
        const lineTotal = calcLineTotal(l.qty, l.unitPriceOre)
        const lineVat = calcLineVat(lineTotal, l.vatRatePercent)
        return lineVat <= lineTotal
      }),
      { numRuns: 1000 },
    )
  })

  it('totalAmount = Σ lineTotals (ackumuleringsordning)', () => {
    fc.assert(
      fc.property(fc.array(lineGen, { minLength: 1, maxLength: 20 }), (lines) => {
        const { totalAmount } = calcTotals(lines)
        const expected = lines.reduce(
          (s, l) => s + calcLineTotal(l.qty, l.unitPriceOre),
          0,
        )
        return totalAmount === expected
      }),
      { numRuns: 500 },
    )
  })

  it('vatAmount = Σ per-rad vat (ackumuleringsordning)', () => {
    fc.assert(
      fc.property(fc.array(lineGen, { minLength: 1, maxLength: 20 }), (lines) => {
        const { vatAmount } = calcTotals(lines)
        const expected = lines.reduce((s, l) => {
          const lineTotal = calcLineTotal(l.qty, l.unitPriceOre)
          return s + calcLineVat(lineTotal, l.vatRatePercent)
        }, 0)
        return vatAmount === expected
      }),
      { numRuns: 500 },
    )
  })

  it('monotonicitet: högre pris → högre eller lika lineTotal (qty konstant)', () => {
    fc.assert(
      fc.property(
        qtyGen,
        priceOreGen,
        priceOreGen,
        (qty, p1, p2) => {
          const lo = Math.min(p1, p2)
          const hi = Math.max(p1, p2)
          return calcLineTotal(qty, lo) <= calcLineTotal(qty, hi)
        },
      ),
      { numRuns: 500 },
    )
  })
})

// ─── M137: sign-flip — belopp positiva i DB, D/K omvända för kreditnotor ─────

/**
 * Speglar buildJournalLines-logiken:
 *   debit_ore: isCreditNote ? 0 : amount
 *   credit_ore: isCreditNote ? amount : 0
 */
function buildLine(
  amount: number,
  isCreditNote: boolean,
): { debit_ore: number; credit_ore: number } {
  return {
    debit_ore: isCreditNote ? 0 : amount,
    credit_ore: isCreditNote ? amount : 0,
  }
}

const amountOreGen = fc.integer({ min: 1, max: 100_000_000 })

describe('buildJournalLines — M137 sign-flip-doktrin', () => {
  it('kundfaktura: debit > 0, credit = 0 för positivt belopp', () => {
    fc.assert(
      fc.property(amountOreGen, (amount) => {
        const { debit_ore, credit_ore } = buildLine(amount, false)
        return debit_ore === amount && credit_ore === 0
      }),
      { numRuns: 500 },
    )
  })

  it('kreditfaktura: debit = 0, credit > 0 för positivt belopp', () => {
    fc.assert(
      fc.property(amountOreGen, (amount) => {
        const { debit_ore, credit_ore } = buildLine(amount, true)
        return debit_ore === 0 && credit_ore === amount
      }),
      { numRuns: 500 },
    )
  })

  it('belopp är alltid positivt — sign appliceras enbart via D/K-val', () => {
    fc.assert(
      fc.property(amountOreGen, fc.boolean(), (amount, isCreditNote) => {
        const { debit_ore, credit_ore } = buildLine(amount, isCreditNote)
        return debit_ore >= 0 && credit_ore >= 0
      }),
      { numRuns: 500 },
    )
  })

  it('kreditnota är exakt spegelvänd mot kundfaktura (D/K swap)', () => {
    fc.assert(
      fc.property(amountOreGen, (amount) => {
        const inv = buildLine(amount, false)
        const cred = buildLine(amount, true)
        return inv.debit_ore === cred.credit_ore && inv.credit_ore === cred.debit_ore
      }),
      { numRuns: 500 },
    )
  })

  it('balans: Σdebit = Σcredit för N rader med samma belopp (symmetri)', () => {
    // Om alla rader har lika belopp och hälften är kundfaktura och hälften kreditnota,
    // så balanserar total debit och total credit (används som sanity-check på mönstret).
    fc.assert(
      fc.property(
        fc.array(amountOreGen, { minLength: 1, maxLength: 10 }),
        fc.boolean(),
        (amounts, isCreditNote) => {
          // En sida (1510) + en intäktsrad per belopp → summa D = summa K
          const receivable = buildLine(amounts.reduce((s, a) => s + a, 0), isCreditNote)
          const revenues = amounts.map((a) => buildLine(a, !isCreditNote))
          const totalDebit =
            receivable.debit_ore + revenues.reduce((s, r) => s + r.debit_ore, 0)
          const totalCredit =
            receivable.credit_ore + revenues.reduce((s, r) => s + r.credit_ore, 0)
          return totalDebit === totalCredit
        },
      ),
      { numRuns: 500 },
    )
  })
})
