/**
 * Shared VAT test scenarios for F40 test hardening (Sprint 25).
 *
 * Used by:
 * - InvoiceTotals.test.tsx (B5 isolated VAT tests)
 * - s25-backend-vat.test.ts (V backend processLines tests)
 * - s25-vat-parity.test.ts (P renderer↔backend parity)
 *
 * Centralizing scenarios prevents drift: updating a scenario in one
 * test layer without the other is impossible when both import from here.
 */

export interface VatScenario {
  /** Short label for test name */
  label: string
  /** Quantity (may be fractional for invoices) */
  quantity: number
  /** Unit price in kronor (renderer uses _kr, backend uses _ore = price_kr * 100) */
  unitPriceKr: number
  /** VAT rate as decimal (0.25, 0.12, 0.06) */
  vatRate: number
  /** VAT code string for DB lookup ('MP1', 'MP2', 'MP3') */
  vatCode: 'MP1' | 'MP2' | 'MP3'
  /** Expected netto in öre (M131 Alt B formula) */
  expectedNettoOre: number
  /** Expected VAT in öre: Math.round(nettoOre * vatRate) */
  expectedVatOre: number
}

/**
 * M131 Alt B formula — the canonical renderer formula.
 * Duplicated here so parity tests can compute renderer-side values
 * without importing React components or jsdom.
 */
export function rendererNettoOre(quantity: number, unitPriceKr: number): number {
  return Math.round(
    (Math.round(quantity * 100) * Math.round(unitPriceKr * 100)) / 100,
  )
}

export function rendererVatOre(nettoOre: number, vatRate: number): number {
  return Math.round(nettoOre * vatRate)
}

// ── Scenarios ────────────────────────────────────────────────────────

export const VAT_SCENARIOS: VatScenario[] = [
  {
    label: '25% moms, jämnt belopp',
    quantity: 1,
    unitPriceKr: 100,
    vatRate: 0.25,
    vatCode: 'MP1',
    expectedNettoOre: 10_000,
    expectedVatOre: 2_500,
  },
  {
    label: '12% moms, jämnt belopp',
    quantity: 1,
    unitPriceKr: 100,
    vatRate: 0.12,
    vatCode: 'MP2',
    expectedNettoOre: 10_000,
    expectedVatOre: 1_200,
  },
  {
    label: '6% moms, avrundning (9999 öre × 0.06 = 599.94 → 600)',
    quantity: 1,
    unitPriceKr: 99.99,
    vatRate: 0.06,
    vatCode: 'MP3',
    expectedNettoOre: 9_999,
    expectedVatOre: 600,
  },
  {
    label: '25% moms, litet belopp avrundning (99 öre × 0.25 = 24.75 → 25)',
    quantity: 1,
    unitPriceKr: 0.99,
    vatRate: 0.25,
    vatCode: 'MP1',
    expectedNettoOre: 99,
    expectedVatOre: 25,
  },
  {
    label: '12% moms, avrundning (199 öre × 0.12 = 23.88 → 24)',
    quantity: 1,
    unitPriceKr: 1.99,
    vatRate: 0.12,
    vatCode: 'MP2',
    expectedNettoOre: 199,
    expectedVatOre: 24,
  },
  {
    label: 'F44-canary: fraktionell qty 1.5 × 99.99, 25% (M131 Alt B)',
    quantity: 1.5,
    unitPriceKr: 99.99,
    vatRate: 0.25,
    vatCode: 'MP1',
    // Math.round(Math.round(150) * Math.round(9999) / 100) = Math.round(14998.5) = 14999
    expectedNettoOre: 14_999,
    // Math.round(14999 * 0.25) = Math.round(3749.75) = 3750
    expectedVatOre: 3_750,
  },
]
