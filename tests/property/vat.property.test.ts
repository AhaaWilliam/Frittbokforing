import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { multiplyKrToOre } from '../../src/shared/money'

/**
 * Property-based tester för VAT-beräkning (M129, M131, M135).
 *
 * Formeln i både renderer (InvoiceTotals/ExpenseTotals) och backend
 * (invoice-service.processLines) är:
 *
 *   line_total_ore = multiplyKrToOre(qty, price_kr)    // eller motsv. öre-form
 *   vat_ore        = Math.round(line_total_ore * rate)
 *   total          = Σ line_total + Σ vat
 *
 * Properties verifierar egenskaper som håller för alla giltiga input.
 */

const decimal2 = (max: number) =>
  fc.integer({ min: 0, max: max * 100 }).map((n) => Math.round(n) / 100)

const qtyGen = decimal2(100)
const priceKrGen = decimal2(10000)

// Svenska momssatser: 0, 6, 12, 25 %
const vatRateGen = fc.constantFrom(0, 0.06, 0.12, 0.25)

interface Line {
  quantity: number
  unit_price_kr: number
  vat_rate: number
}
const lineGen = fc.record<Line>({
  quantity: qtyGen,
  unit_price_kr: priceKrGen,
  vat_rate: vatRateGen,
})

function computeLine(line: Line) {
  const nettoOre = multiplyKrToOre(line.quantity, line.unit_price_kr)
  const vatOre = Math.round(nettoOre * line.vat_rate)
  return { nettoOre, vatOre }
}

function computeTotals(lines: Line[]) {
  const per = lines.map(computeLine)
  const totalNetto = per.reduce((s, l) => s + l.nettoOre, 0)
  const totalVat = per.reduce((s, l) => s + l.vatOre, 0)
  return { per, totalNetto, totalVat, totalAtt: totalNetto + totalVat }
}

describe('VAT per line — invarianter', () => {
  it('0%-rad → vat_ore alltid 0', () => {
    fc.assert(
      fc.property(
        fc.record<Line>({
          quantity: qtyGen,
          unit_price_kr: priceKrGen,
          vat_rate: fc.constant(0),
        }),
        (l) => computeLine(l).vatOre === 0,
      ),
      { numRuns: 1000 },
    )
  })

  it('vat_ore ≤ netto_ore (rate ≤ 100%)', () => {
    fc.assert(
      fc.property(lineGen, (l) => {
        const { nettoOre, vatOre } = computeLine(l)
        return vatOre <= nettoOre
      }),
      { numRuns: 1000 },
    )
  })

  it('vat_ore är alltid heltal ≥ 0', () => {
    fc.assert(
      fc.property(lineGen, (l) => {
        const { vatOre } = computeLine(l)
        return Number.isInteger(vatOre) && vatOre >= 0
      }),
      { numRuns: 1000 },
    )
  })

  it('monotoni i rate: högre rate → högre eller lika moms (samma rad)', () => {
    fc.assert(
      fc.property(qtyGen, priceKrGen, (q, p) => {
        const n = multiplyKrToOre(q, p)
        const v0 = Math.round(n * 0)
        const v6 = Math.round(n * 0.06)
        const v12 = Math.round(n * 0.12)
        const v25 = Math.round(n * 0.25)
        return v0 <= v6 && v6 <= v12 && v12 <= v25
      }),
      { numRuns: 1000 },
    )
  })
})

describe('VAT aggregate — invarianter', () => {
  it('totalNetto = Σ per-rad netto', () => {
    fc.assert(
      fc.property(fc.array(lineGen, { minLength: 0, maxLength: 50 }), (ls) => {
        const { per, totalNetto } = computeTotals(ls)
        const sum = per.reduce((s, p) => s + p.nettoOre, 0)
        return totalNetto === sum
      }),
      { numRuns: 500 },
    )
  })

  it('totalAtt = totalNetto + totalVat (exakt, inga öresutjämningar i preview)', () => {
    fc.assert(
      fc.property(fc.array(lineGen, { minLength: 0, maxLength: 50 }), (ls) => {
        const { totalNetto, totalVat, totalAtt } = computeTotals(ls)
        return totalAtt === totalNetto + totalVat
      }),
      { numRuns: 500 },
    )
  })

  it('tom array → alla totaler 0', () => {
    const { totalNetto, totalVat, totalAtt } = computeTotals([])
    expect(totalNetto).toBe(0)
    expect(totalVat).toBe(0)
    expect(totalAtt).toBe(0)
  })

  it('splitting invariant: 1 rad qty=2 ≈ 2 rader qty=1 (inom 1 öre per rad pga rounding)', () => {
    // Om vi delar upp en rad i två identiska, ska totalen avvika max 1 öre
    // (avrundningsfel kan skilja pga per-rad-avrundning, M129)
    fc.assert(
      fc.property(priceKrGen, vatRateGen, (p, r) => {
        const oneLine = [{ quantity: 2, unit_price_kr: p, vat_rate: r }]
        const twoLines = [
          { quantity: 1, unit_price_kr: p, vat_rate: r },
          { quantity: 1, unit_price_kr: p, vat_rate: r },
        ]
        const a = computeTotals(oneLine).totalAtt
        const b = computeTotals(twoLines).totalAtt
        return Math.abs(a - b) <= 1
      }),
      { numRuns: 500 },
    )
  })
})
