// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExpenseTotals } from '../../../../src/renderer/components/expenses/ExpenseTotals'
import { InvoiceTotals } from '../../../../src/renderer/components/invoices/InvoiceTotals'
import type { ExpenseLineForm } from '../../../../src/renderer/lib/form-schemas/expense'
import type { InvoiceLineForm } from '../../../../src/renderer/lib/form-schemas/invoice'
import { byKr } from '../../utils/format-matchers'

// ── Helpers ──────────────────────────────────────────────────────────

function makeLine(overrides?: Partial<ExpenseLineForm>): ExpenseLineForm {
  return {
    temp_id: 'tmp_1',
    description: 'Rad',
    account_number: '5410',
    quantity: 1,
    unit_price_kr: 100,
    vat_code_id: 1,
    vat_rate: 0.25,
    ...overrides,
  }
}

/** Convert ExpenseLineForm to InvoiceLineForm for paritetstester */
function toInvoiceLine(line: ExpenseLineForm): InvoiceLineForm {
  return {
    ...line,
    product_id: null,
    unit: 'styck',
    account_number: '3001',
  }
}

// ── B1: Rendering ────────────────────────────────────────────────────

describe('ExpenseTotals — rendering', () => {
  it('B1.1: tom lines → visar 0 kr netto, 0 kr moms, 0 kr totalt', () => {
    render(<ExpenseTotals lines={[]} />)

    const zeroes = screen.getAllByText(byKr(0))
    // Netto, Moms, Totalt — alla 0 kr
    expect(zeroes.length).toBeGreaterThanOrEqual(3)
  })

  it('B1.2: en rad → korrekt per-rad + total', () => {
    // qty: 1, price_kr: 1250, vat_rate: 0.25
    // netto: toOre(1 * 1250) = 125000, VAT: Math.round(125000 * 0.25) = 31250
    // total: 125000 + 31250 = 156250
    const lines = [makeLine({ quantity: 1, unit_price_kr: 1250, vat_rate: 0.25 })]
    render(<ExpenseTotals lines={lines} />)

    expect(screen.getByText(byKr(125000))).toBeDefined() // Netto
    expect(screen.getByText(byKr(31250))).toBeDefined()  // Moms
    expect(screen.getByText(byKr(156250))).toBeDefined() // Totalt
  })

  it('B1.3: tre rader → summerat korrekt', () => {
    const lines = [
      makeLine({ temp_id: 'a', quantity: 1, unit_price_kr: 100, vat_rate: 0.25 }),
      makeLine({ temp_id: 'b', quantity: 1, unit_price_kr: 200, vat_rate: 0.12 }),
      makeLine({ temp_id: 'c', quantity: 1, unit_price_kr: 300, vat_rate: 0.06 }),
    ]
    render(<ExpenseTotals lines={lines} />)

    // Netto: 10000 + 20000 + 30000 = 60000
    expect(screen.getByText(byKr(60000))).toBeDefined()
    // VAT: 2500 + 2400 + 1800 = 6700
    expect(screen.getByText(byKr(6700))).toBeDefined()
    // Total: 60000 + 6700 = 66700
    expect(screen.getByText(byKr(66700))).toBeDefined()
  })
})

// ── B2: Per-rad F27 ──────────────────────────────────────────────────

describe('ExpenseTotals — per-rad F27', () => {
  it('B2.1: jämn — qty: 1, price_kr: 1250, vat: 25% → netto 125000, VAT 31250', () => {
    const lines = [makeLine({ quantity: 1, unit_price_kr: 1250, vat_rate: 0.25 })]
    render(<ExpenseTotals lines={lines} />)

    expect(screen.getByText(byKr(125000))).toBeDefined()
    expect(screen.getByText(byKr(31250))).toBeDefined()
  })

  it('B2.2: decimal — qty: 2, price_kr: 123.45, vat: 25% → netto 24690, VAT 6173', () => {
    // toOre(2 * 123.45) = Math.round(246.9 * 100) = 24690
    // VAT: Math.round(24690 * 0.25) = Math.round(6172.5) = 6173
    const lines = [makeLine({ quantity: 2, unit_price_kr: 123.45, vat_rate: 0.25 })]
    render(<ExpenseTotals lines={lines} />)

    expect(screen.getByText(byKr(24690))).toBeDefined()
    expect(screen.getByText(byKr(6173))).toBeDefined()
    // Total: 24690 + 6173 = 30863
    expect(screen.getByText(byKr(30863))).toBeDefined()
  })

  it('B2.3: edge 99 öre — qty: 1, price_kr: 0.99, vat: 25% → netto 99, VAT 25', () => {
    // toOre(0.99) = Math.round(0.99 * 100) = 99
    // VAT: Math.round(99 * 0.25) = Math.round(24.75) = 25
    const lines = [makeLine({ quantity: 1, unit_price_kr: 0.99, vat_rate: 0.25 })]
    render(<ExpenseTotals lines={lines} />)

    expect(screen.getByText(byKr(99))).toBeDefined()  // Netto
    expect(screen.getByText(byKr(25))).toBeDefined()  // VAT
    // Total: 99 + 25 = 124
    expect(screen.getByText(byKr(124))).toBeDefined()
  })

  it('B2.4: fraktionell qty — F44 float-trap: qty: 1.5, price_kr: 100.33 → netto 15050, VAT 3763', () => {
    // F44: Float-precision ger avrundning som kan avvika från matematiskt förväntat
    // värde. Se docs/bug-backlog.md F44 för fix-plan. När F44 fixas uppdateras:
    //   - InvoiceTotals.test.tsx B2.4
    //   - ExpenseTotals.test.tsx B2.4
    // toOre(1.5 * 100.33) = Math.round(150.495 * 100) = Math.round(15049.5) = 15050
    // VAT: Math.round(15050 * 0.25) = Math.round(3762.5) = 3763
    const lines = [makeLine({ quantity: 1.5, unit_price_kr: 100.33, vat_rate: 0.25 })]
    render(<ExpenseTotals lines={lines} />)

    expect(screen.getByText(byKr(15050))).toBeDefined() // Netto
    expect(screen.getByText(byKr(3763))).toBeDefined()  // VAT
    // Total: 15050 + 3763 = 18813
    expect(screen.getByText(byKr(18813))).toBeDefined()
  })
})

// ── B3: Ackumulerad F27 ──────────────────────────────────────────────

describe('ExpenseTotals — ackumulerad F27', () => {
  it('B3.1: 3 × (qty: 1, price_kr: 0.99, vat: 25%) → VAT = 75, ej 74', () => {
    // Per-rad: toOre(0.99) = 99, VAT = Math.round(99 * 0.25) = Math.round(24.75) = 25
    // Ackumulerad: 25 + 25 + 25 = 75, inte Math.round(3 * 24.75) = Math.round(74.25) = 74
    // Verifierar summering efter avrundning per rad.
    const lines = [
      makeLine({ temp_id: 'a', quantity: 1, unit_price_kr: 0.99, vat_rate: 0.25 }),
      makeLine({ temp_id: 'b', quantity: 1, unit_price_kr: 0.99, vat_rate: 0.25 }),
      makeLine({ temp_id: 'c', quantity: 1, unit_price_kr: 0.99, vat_rate: 0.25 }),
    ]
    render(<ExpenseTotals lines={lines} />)

    // Netto: 3 × 99 = 297
    expect(screen.getByText(byKr(297))).toBeDefined()
    // VAT: 3 × 25 = 75 (not 74)
    expect(screen.getByText(byKr(75))).toBeDefined()
    // Total: 297 + 75 = 372
    expect(screen.getByText(byKr(372))).toBeDefined()
  })

  it('B3.2: stora belopp — 3 × 1 000 000 öre → ingen overflow', () => {
    const lines = [
      makeLine({ temp_id: 'a', quantity: 1, unit_price_kr: 10000, vat_rate: 0.25 }),
      makeLine({ temp_id: 'b', quantity: 1, unit_price_kr: 10000, vat_rate: 0.25 }),
      makeLine({ temp_id: 'c', quantity: 1, unit_price_kr: 10000, vat_rate: 0.25 }),
    ]
    render(<ExpenseTotals lines={lines} />)

    // Netto: 3 × 1000000 = 3000000
    expect(screen.getByText(byKr(3000000))).toBeDefined()
    // VAT: 3 × 250000 = 750000
    expect(screen.getByText(byKr(750000))).toBeDefined()
    // Total: 3750000
    expect(screen.getByText(byKr(3750000))).toBeDefined()
  })
})

// ── B4: Paritet med InvoiceTotals — data-testid-jämförelse ──────────

describe('ExpenseTotals — paritet med InvoiceTotals', () => {
  it('B4.1: fraktionell qty → identiska öre-värden via data-testid', () => {
    // Öre-värden identiska, UI-struktur avsiktligt olika
    // (ExpenseTotals: Netto/Moms/Totalt; InvoiceTotals: VAT-gruppering + Att betala)
    const expenseLines = [makeLine({ quantity: 1.5, unit_price_kr: 100.33, vat_rate: 0.25 })]
    const invoiceLines = expenseLines.map(toInvoiceLine)

    const { unmount: unmountExpense } = render(<ExpenseTotals lines={expenseLines} />)
    const expenseNet = screen.getByTestId('total-net-ore').dataset.value
    const expenseVat = screen.getByTestId('total-vat-ore').dataset.value
    const expenseSum = screen.getByTestId('total-sum-ore').dataset.value
    unmountExpense()

    render(<InvoiceTotals lines={invoiceLines} />)
    expect(screen.getByTestId('total-net-ore').dataset.value).toBe(expenseNet)
    expect(screen.getByTestId('total-vat-ore').dataset.value).toBe(expenseVat)
    expect(screen.getByTestId('total-sum-ore').dataset.value).toBe(expenseSum)
  })

  it('B4.2: ackumulerad — 3 rader, blandade momssatser → identiska öre-värden', () => {
    const expenseLines = [
      makeLine({ temp_id: 'a', quantity: 1, unit_price_kr: 99.95, vat_rate: 0.25 }),
      makeLine({ temp_id: 'b', quantity: 3, unit_price_kr: 12.33, vat_rate: 0.12 }),
      makeLine({ temp_id: 'c', quantity: 2, unit_price_kr: 55.50, vat_rate: 0.06 }),
    ]
    const invoiceLines = expenseLines.map(toInvoiceLine)

    const { unmount: unmountExpense } = render(<ExpenseTotals lines={expenseLines} />)
    const expenseNet = screen.getByTestId('total-net-ore').dataset.value
    const expenseVat = screen.getByTestId('total-vat-ore').dataset.value
    const expenseSum = screen.getByTestId('total-sum-ore').dataset.value
    unmountExpense()

    render(<InvoiceTotals lines={invoiceLines} />)
    expect(screen.getByTestId('total-net-ore').dataset.value).toBe(expenseNet)
    expect(screen.getByTestId('total-vat-ore').dataset.value).toBe(expenseVat)
    expect(screen.getByTestId('total-sum-ore').dataset.value).toBe(expenseSum)
  })
})
