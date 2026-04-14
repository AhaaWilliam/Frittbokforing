// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InvoiceTotals } from '../../../../src/renderer/components/invoices/InvoiceTotals'
import type { InvoiceLineForm } from '../../../../src/renderer/lib/form-schemas/invoice'
import { byKr } from '../../utils/format-matchers'

function makeLine(overrides?: Partial<InvoiceLineForm>): InvoiceLineForm {
  return {
    temp_id: 'tmp_1',
    product_id: null,
    description: 'Rad',
    quantity: 1,
    unit_price_kr: 100,
    vat_code_id: 1,
    vat_rate: 0.25,
    unit: 'styck',
    account_number: '3001',
    ...overrides,
  }
}

// ── B1: Rendering ────────────────────────────────────────────────────

describe('InvoiceTotals — rendering', () => {
  it('B1.1: tom lines → visar 0 kr netto, 0 kr moms, 0 kr att betala', () => {
    render(<InvoiceTotals lines={[]} />)

    const zeroes = screen.getAllByText(byKr(0))
    // Netto, Moms, Att betala — alla 0 kr
    expect(zeroes.length).toBeGreaterThanOrEqual(3)
  })

  it('B1.2: en rad → visar per-rad netto + VAT + total', () => {
    // qty: 1, price_kr: 1250, vat_rate: 0.25
    // netto: toOre(1 * 1250) = 125000, VAT: Math.round(125000 * 0.25) = 31250
    // total: 125000 + 31250 = 156250
    const lines = [makeLine({ quantity: 1, unit_price_kr: 1250, vat_rate: 0.25 })]
    render(<InvoiceTotals lines={lines} />)

    expect(screen.getByText(byKr(125000))).toBeDefined() // Netto
    expect(screen.getByText(byKr(31250))).toBeDefined() // Moms 25%
    expect(screen.getByText(byKr(156250))).toBeDefined() // Att betala
  })

  it('B1.3: tre rader med olika momssatser → tre VAT-grupper', () => {
    const lines = [
      makeLine({ temp_id: 'a', quantity: 1, unit_price_kr: 100, vat_rate: 0.25 }),
      makeLine({ temp_id: 'b', quantity: 1, unit_price_kr: 100, vat_rate: 0.12 }),
      makeLine({ temp_id: 'c', quantity: 1, unit_price_kr: 100, vat_rate: 0.06 }),
    ]
    render(<InvoiceTotals lines={lines} />)

    // Netto: 3 × 10000 = 30000
    expect(screen.getByText(byKr(30000))).toBeDefined()
    // VAT groups: 2500, 1200, 600
    expect(screen.getByText('Moms 25%')).toBeDefined()
    expect(screen.getByText('Moms 12%')).toBeDefined()
    expect(screen.getByText('Moms 6%')).toBeDefined()
  })
})

// ── B2: Per-rad F27 ──────────────────────────────────────────────────

describe('InvoiceTotals — per-rad F27', () => {
  it('B2.1: jämn — qty: 1, price_kr: 1250, vat: 25% → netto 125000, VAT 31250', () => {
    const lines = [makeLine({ quantity: 1, unit_price_kr: 1250, vat_rate: 0.25 })]
    render(<InvoiceTotals lines={lines} />)

    expect(screen.getByText(byKr(125000))).toBeDefined()
    expect(screen.getByText(byKr(31250))).toBeDefined()
  })

  it('B2.2: decimal — qty: 2, price_kr: 123.45, vat: 25% → netto 24690, VAT 6173', () => {
    // toOre(2 * 123.45) = toOre(246.9) = Math.round(246.9 * 100) = 24690
    // VAT: Math.round(24690 * 0.25) = Math.round(6172.5) = 6173
    const lines = [makeLine({ quantity: 2, unit_price_kr: 123.45, vat_rate: 0.25 })]
    render(<InvoiceTotals lines={lines} />)

    expect(screen.getByText(byKr(24690))).toBeDefined()
    expect(screen.getByText(byKr(6173))).toBeDefined()
    // Total: 24690 + 6173 = 30863
    expect(screen.getByText(byKr(30863))).toBeDefined()
  })

  it('B2.3: edge 99 öre — qty: 1, price_kr: 0.99, vat: 25% → netto 99, VAT 25', () => {
    // toOre(1 * 0.99) = Math.round(0.99 * 100) = 99
    // VAT: Math.round(99 * 0.25) = Math.round(24.75) = 25
    const lines = [makeLine({ quantity: 1, unit_price_kr: 0.99, vat_rate: 0.25 })]
    render(<InvoiceTotals lines={lines} />)

    expect(screen.getByText(byKr(99))).toBeDefined() // Netto
    expect(screen.getByText(byKr(25))).toBeDefined() // VAT
    // Total: 99 + 25 = 124
    expect(screen.getByText(byKr(124))).toBeDefined()
  })

  it('B2.4: fraktionell qty — F44 float-trap: qty: 1.5, price_kr: 99.99 → netto 14998 (off-by-1)', () => {
    // Exakt aritmetik: 1.5 * 99.99 = 149.985 → 14998.5 → 14999 öre
    // IEEE 754: 1.5 * 99.99 = 149.98499...998 → * 100 = 14998.499... → Math.round = 14998
    // F44: toOre(qty * price_kr) has a float-precision weakness.
    // VAT: Math.round(14998 * 0.25) = Math.round(3749.5) = 3750
    const lines = [makeLine({ quantity: 1.5, unit_price_kr: 99.99, vat_rate: 0.25 })]
    render(<InvoiceTotals lines={lines} />)

    expect(screen.getByText(byKr(14998))).toBeDefined() // F44: 14998, not 14999
    expect(screen.getByText(byKr(3750))).toBeDefined() // VAT
    // Total: 14998 + 3750 = 18748
    expect(screen.getByText(byKr(18748))).toBeDefined()
  })
})

// ── B3: Ackumulerad F27 ──────────────────────────────────────────────

describe('InvoiceTotals — ackumulerad F27', () => {
  it('B3.1: 3 × (qty: 1, price_kr: 0.99, vat: 25%) → VAT = 75, ej 74', () => {
    // Per-rad: toOre(0.99) = 99, VAT = Math.round(99 * 0.25) = Math.round(24.75) = 25
    // Ackumulerad: 25 + 25 + 25 = 75, inte Math.round(3 * 24.75) = Math.round(74.25) = 74
    // Verifierar summering efter avrundning per rad.
    const lines = [
      makeLine({ temp_id: 'a', quantity: 1, unit_price_kr: 0.99, vat_rate: 0.25 }),
      makeLine({ temp_id: 'b', quantity: 1, unit_price_kr: 0.99, vat_rate: 0.25 }),
      makeLine({ temp_id: 'c', quantity: 1, unit_price_kr: 0.99, vat_rate: 0.25 }),
    ]
    render(<InvoiceTotals lines={lines} />)

    // Netto: 3 × 99 = 297
    expect(screen.getByText(byKr(297))).toBeDefined()
    // VAT: 3 × 25 = 75 (not 74)
    expect(screen.getByText(byKr(75))).toBeDefined()
    // Total: 297 + 75 = 372
    expect(screen.getByText(byKr(372))).toBeDefined()
  })

  it('B3.2: stora belopp — 3 × 1 000 000 öre → ingen overflow', () => {
    // qty: 1, price_kr: 10000 → netto: 1000000
    // VAT: 1000000 * 0.25 = 250000
    const lines = [
      makeLine({ temp_id: 'a', quantity: 1, unit_price_kr: 10000, vat_rate: 0.25 }),
      makeLine({ temp_id: 'b', quantity: 1, unit_price_kr: 10000, vat_rate: 0.25 }),
      makeLine({ temp_id: 'c', quantity: 1, unit_price_kr: 10000, vat_rate: 0.25 }),
    ]
    render(<InvoiceTotals lines={lines} />)

    // Netto: 3 × 1000000 = 3000000
    expect(screen.getByText(byKr(3000000))).toBeDefined()
    // VAT: 3 × 250000 = 750000
    expect(screen.getByText(byKr(750000))).toBeDefined()
    // Total: 3750000
    expect(screen.getByText(byKr(3750000))).toBeDefined()
  })
})

// ── B4: Grupperad VAT ────────────────────────────────────────────────

describe('InvoiceTotals — grupperad VAT', () => {
  it('B4.1: tre momssatser (25%, 12%, 6%) → tre separata grupper', () => {
    const lines = [
      makeLine({ temp_id: 'a', quantity: 1, unit_price_kr: 200, vat_rate: 0.25 }),
      makeLine({ temp_id: 'b', quantity: 1, unit_price_kr: 200, vat_rate: 0.12 }),
      makeLine({ temp_id: 'c', quantity: 1, unit_price_kr: 200, vat_rate: 0.06 }),
    ]
    render(<InvoiceTotals lines={lines} />)

    // VAT groups: 20000*0.25=5000, 20000*0.12=2400, 20000*0.06=1200
    expect(screen.getByText('Moms 25%')).toBeDefined()
    expect(screen.getByText(byKr(5000))).toBeDefined()
    expect(screen.getByText('Moms 12%')).toBeDefined()
    expect(screen.getByText(byKr(2400))).toBeDefined()
    expect(screen.getByText('Moms 6%')).toBeDefined()
    expect(screen.getByText(byKr(1200))).toBeDefined()
  })

  it('B4.2: mix 25% + 0% → 0%-grupp visas inte, bara 25%-grupp', () => {
    const lines = [
      makeLine({ temp_id: 'a', quantity: 1, unit_price_kr: 100, vat_rate: 0.25 }),
      makeLine({ temp_id: 'b', quantity: 1, unit_price_kr: 100, vat_rate: 0.25 }),
      makeLine({ temp_id: 'c', quantity: 1, unit_price_kr: 100, vat_rate: 0 }),
    ]
    render(<InvoiceTotals lines={lines} />)

    // 0%-rader exkluderas från vatByRate (if vatRate > 0)
    // Bara 25%-grupp: 2 × 10000 * 0.25 = 5000
    expect(screen.getByText('Moms 25%')).toBeDefined()
    expect(screen.getByText(byKr(5000))).toBeDefined()
    // "Moms 0%" ska INTE finnas
    expect(screen.queryByText('Moms 0%')).toBeNull()
    // "Moms" standalone (totalVat===0 case) ska inte finnas heller (totalVat = 5000 > 0)
    // Netto: 30000, total VAT: 5000 (0%-rad bidrar 0), total: 35000
    expect(screen.getByText(byKr(30000))).toBeDefined()
    expect(screen.getByText(byKr(35000))).toBeDefined()
  })
})
