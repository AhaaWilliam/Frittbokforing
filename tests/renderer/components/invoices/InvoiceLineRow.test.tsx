// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, waitFor, screen } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { InvoiceLineRow } from '../../../../src/renderer/components/invoices/InvoiceLineRow'
import { InvoiceTotals } from '../../../../src/renderer/components/invoices/InvoiceTotals'
import { formatKr, toOre } from '../../../../src/renderer/lib/format'
import type { InvoiceLineForm } from '../../../../src/renderer/lib/form-schemas/invoice'
import type { VatCode } from '../../../../src/shared/types'

// ── ArticlePicker mock ──────────────────────────────────────────────

const mockArticle = {
  product_id: 1,
  description: 'Konsulttimme',
  unit_price_kr: 950,
  vat_code_id: 1,
  vat_rate: 0.25,
  unit: 'timme',
}

vi.mock('../../../../src/renderer/components/invoices/ArticlePicker', () => ({
  ArticlePicker: ({ onSelect }: { onSelect: (p: typeof mockArticle) => void }) => (
    <button
      type="button"
      data-testid="mock-article-picker"
      onClick={() => onSelect(mockArticle)}
    >
      Välj artikel
    </button>
  ),
}))

// ── Fixturer ────────────────────────────────────────────────────────

const defaultVatCodes: VatCode[] = [
  { id: 1, code: '25', description: 'Moms 25%', rate_percent: 25, vat_type: 'outgoing', report_box: null },
  { id: 2, code: '12', description: 'Moms 12%', rate_percent: 12, vat_type: 'outgoing', report_box: null },
  { id: 3, code: '06', description: 'Moms 6%', rate_percent: 6, vat_type: 'outgoing', report_box: null },
]

const productLine: InvoiceLineForm = {
  temp_id: 'line-1',
  product_id: 1,
  description: 'Konsulttimme',
  account_number: null,
  quantity: 2,
  unit_price_kr: 950,
  vat_code_id: 1,
  vat_rate: 0.25,
  unit: 'timme',
}

const freeformLine: InvoiceLineForm = {
  temp_id: 'line-2',
  product_id: null,
  description: 'Resekostnader',
  account_number: '3001',
  quantity: 1,
  unit_price_kr: 1500,
  vat_code_id: 1,
  vat_rate: 0.25,
  unit: 'styck',
}

// ── Props ───────────────────────────────────────────────────────────

interface InvoiceLineRowProps {
  line: InvoiceLineForm
  index: number
  counterpartyId: number | null
  onUpdate: (index: number, updates: Partial<InvoiceLineForm>) => void
  onRemove: (index: number) => void
}

function makeProductProps(overrides?: Partial<InvoiceLineRowProps>): InvoiceLineRowProps {
  return {
    index: 0,
    line: productLine,
    counterpartyId: 1,
    onUpdate: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  }
}

function makeFreeformProps(overrides?: Partial<InvoiceLineRowProps>): InvoiceLineRowProps {
  return {
    ...makeProductProps(),
    line: freeformLine,
    ...overrides,
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

async function renderRow(props: InvoiceLineRowProps) {
  return renderWithProviders(
    <table><tbody><InvoiceLineRow {...props} /></tbody></table>,
  )
}

/** Total cell = only td with text-right class directly on td (not on child input). */
function getTotalCell(container: HTMLElement): HTMLElement {
  const cell = container.querySelector('td.text-right')
  if (!cell) throw new Error('Total cell not found')
  return cell as HTMLElement
}

/** formatKr → normalized string for toHaveTextContent comparison. */
function expectedTotal(krValue: number): string {
  return formatKr(toOre(krValue)).replace(/\u00a0/g, ' ')
}

// ── Setup ───────────────────────────────────────────────────────────

beforeEach(() => {
  setupMockIpc()
  mockIpcResponse('vat-code:list', { success: true, data: defaultVatCodes })
})

// ── Grupp 1: Produktrad — rendering och kontrakt ────────────────────

describe('InvoiceLineRow — produktrad rendering', () => {
  it('1.1 renderar alla fält från line-prop', async () => {
    const props = makeProductProps()
    const { getByLabelText } = await renderRow(props)

    expect(getByLabelText('Beskrivning')).toHaveValue('Konsulttimme')
    expect(getByLabelText('Antal')).toHaveValue(2)
    expect(getByLabelText('Pris')).toHaveValue(950)
    expect(getByLabelText('Moms')).toHaveValue('0.25')
  })

  it('1.2 ArticlePicker visas alltid (även produktrad)', async () => {
    const props = makeProductProps()
    const { getByTestId } = await renderRow(props)

    expect(getByTestId('mock-article-picker')).toBeInTheDocument()
  })

  it('1.3 unit_price_kr visas korrekt i price-input', async () => {
    const line = { ...productLine, unit_price_kr: 499 }
    const props = makeProductProps({ line })
    const { getByLabelText } = await renderRow(props)

    expect(getByLabelText('Pris')).toHaveValue(499)
  })

  it('1.4 produktrad renderar INTE konto-input (M123-fork)', async () => {
    const props = makeProductProps()
    const { queryByLabelText } = await renderRow(props)

    expect(queryByLabelText('Konto')).not.toBeInTheDocument()
  })
})

// ── Grupp 2: Produktrad — callbacks och ArticlePicker-integration ───

describe('InvoiceLineRow — produktrad callbacks', () => {
  it('2.1 ArticlePicker onSelect triggar onUpdate med full payload', async () => {
    const props = makeProductProps()
    const { getByTestId } = await renderRow(props)

    fireEvent.click(getByTestId('mock-article-picker'))

    await waitFor(() => {
      expect(props.onUpdate).toHaveBeenCalledWith(0, {
        product_id: 1,
        account_number: null,
        description: 'Konsulttimme',
        unit_price_kr: 950,
        vat_code_id: 1,
        vat_rate: 0.25,
        unit: 'timme',
      })
    })
  })

  it('2.2 quantity-ändring triggar onUpdate', async () => {
    const props = makeProductProps()
    const { getByLabelText } = await renderRow(props)

    fireEvent.change(getByLabelText('Antal'), { target: { value: '3' } })

    expect(props.onUpdate).toHaveBeenCalledWith(0, { quantity: 3 })
  })

  it('2.3 price-ändring triggar onUpdate', async () => {
    const props = makeProductProps()
    const { getByLabelText } = await renderRow(props)

    fireEvent.change(getByLabelText('Pris'), { target: { value: '1200' } })

    expect(props.onUpdate).toHaveBeenCalledWith(0, { unit_price_kr: 1200 })
  })

  it('2.4 ta-bort-knapp triggar onRemove', async () => {
    const props = makeProductProps()
    const { getByLabelText } = await renderRow(props)

    fireEvent.click(getByLabelText('Ta bort rad'))

    expect(props.onRemove).toHaveBeenCalledWith(0)
  })
})

// ── Grupp 3: Friformsrad — rendering och callbacks ──────────────────

describe('InvoiceLineRow — friformsrad rendering och callbacks', () => {
  it('3.1 friformsrad visar konto-input och ArticlePicker', async () => {
    const props = makeFreeformProps()
    const { getByLabelText, getByTestId } = await renderRow(props)

    expect(getByLabelText('Konto')).toHaveValue('3001')
    expect(getByTestId('mock-article-picker')).toBeInTheDocument()
  })

  it('3.2 konto-ändring triggar onUpdate', async () => {
    const props = makeFreeformProps()
    const { getByLabelText } = await renderRow(props)

    fireEvent.change(getByLabelText('Konto'), { target: { value: '3740' } })

    expect(props.onUpdate).toHaveBeenCalledWith(0, { account_number: '3740' })
  })

  it('3.3 description-ändring triggar onUpdate', async () => {
    const props = makeFreeformProps()
    const { getByLabelText } = await renderRow(props)

    fireEvent.change(getByLabelText('Beskrivning'), { target: { value: 'Hotell' } })

    expect(props.onUpdate).toHaveBeenCalledWith(0, { description: 'Hotell' })
  })

  it('3.4a quantity-ändring på friformsrad', async () => {
    const props = makeFreeformProps()
    const { getByLabelText } = await renderRow(props)

    fireEvent.change(getByLabelText('Antal'), { target: { value: '5' } })

    expect(props.onUpdate).toHaveBeenCalledWith(0, { quantity: 5 })
  })

  it('3.4b price-ändring på friformsrad', async () => {
    const props = makeFreeformProps()
    const { getByLabelText } = await renderRow(props)

    fireEvent.change(getByLabelText('Pris'), { target: { value: '2500' } })

    expect(props.onUpdate).toHaveBeenCalledWith(0, { unit_price_kr: 2500 })
  })
})

// ── Grupp 4: F27-regression — öre-precision (NETTO, ej inkl. moms) ──

describe('InvoiceLineRow — F27-regression öre-precision', () => {
  // Total = toOre(quantity * unit_price_kr) = Math.round(quantity * unit_price_kr * 100)
  // Display = formatKr(totalOre) — NETTO, utan moms

  it('4.1 standardfall — qty=2 × 950 kr = 190 000 öre → 1 900 kr', async () => {
    const props = makeProductProps()
    const { container } = await renderRow(props)

    expect(getTotalCell(container)).toHaveTextContent(expectedTotal(2 * 950))
  })

  it('4.2 stort tal — qty=1 × 9999.99 kr = 999 999 öre', async () => {
    const line: InvoiceLineForm = {
      ...freeformLine,
      quantity: 1,
      unit_price_kr: 9999.99,
    }
    const props = makeFreeformProps({ line })
    const { container } = await renderRow(props)

    // Math.round(1 * 9999.99 * 100) = 999999
    expect(getTotalCell(container)).toHaveTextContent(expectedTotal(9999.99))
  })

  it('4.3 minsta belopp — qty=1 × 0.01 kr = 1 öre', async () => {
    const line: InvoiceLineForm = {
      ...freeformLine,
      quantity: 1,
      unit_price_kr: 0.01,
    }
    const props = makeFreeformProps({ line })
    const { container } = await renderRow(props)

    // Math.round(1 * 0.01 * 100) = 1
    expect(getTotalCell(container)).toHaveTextContent(expectedTotal(0.01))
  })
})

// ── Grupp 5: Memo-kontrakt ──────────────────────────────────────────

describe('InvoiceLineRow — memo-kontrakt', () => {
  it('5.1 InvoiceLineRow är React.memo-wrappad (M102)', () => {
    expect((InvoiceLineRow as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.memo'),
    )
  })
})

// ── Grupp 6: Edge-cases ─────────────────────────────────────────────

describe('InvoiceLineRow — edge-cases', () => {
  it('6.1 vat_rate=0 visar Momsfritt i select', async () => {
    const line: InvoiceLineForm = { ...freeformLine, vat_rate: 0 }
    const props = makeFreeformProps({ line })
    const { getByLabelText } = await renderRow(props)

    const select = getByLabelText('Moms') as HTMLSelectElement
    expect(select.value).toBe('0')
    const selectedOption = select.options[select.selectedIndex]
    expect(selectedOption.text).toBe('Momsfritt')
  })

  it('6.2 byte från produktrad till friformsrad — konto-input dyker upp', async () => {
    const props = makeProductProps()
    const { queryByLabelText, rerender } = await renderRow(props)

    expect(queryByLabelText('Konto')).not.toBeInTheDocument()

    // Rerender with freeform line (product_id = null)
    rerender(
      <table><tbody><InvoiceLineRow {...props} line={freeformLine} /></tbody></table>,
    )

    expect(queryByLabelText('Konto')).toBeInTheDocument()
    // No useEffect → no extra onUpdate calls from rerender
    expect(props.onUpdate).not.toHaveBeenCalled()
  })

  it('6.3 quantity="0" → parseFloat fallback till 0', async () => {
    const props = makeProductProps()
    const { getByLabelText } = await renderRow(props)

    fireEvent.change(getByLabelText('Antal'), { target: { value: '0' } })

    expect(props.onUpdate).toHaveBeenCalledWith(0, { quantity: 0 })
  })

  it('6.4 stale product_id (ej i produktlista) — renderar utan krash', async () => {
    const line: InvoiceLineForm = {
      ...productLine,
      product_id: 999,
      description: 'Borttagen produkt',
    }
    const props = makeProductProps({ line })
    const { getByLabelText, queryByLabelText } = await renderRow(props)

    // product_id !== null → no account input
    expect(queryByLabelText('Konto')).not.toBeInTheDocument()
    // Other fields render normally
    expect(getByLabelText('Beskrivning')).toHaveValue('Borttagen produkt')
    expect(getByLabelText('Antal')).toHaveValue(2)
    expect(getByLabelText('Pris')).toHaveValue(950)
  })
})

// ── Grupp 7: F47 precision — M131 Alt B (Sprint 21 S68a) ──────────────

describe('InvoiceLineRow — F47 M131 precision (S68a)', () => {
  it('7.1 per-rad canary B2.4: qty=1.5 × price=99.99 → 14999 öre', async () => {
    const line: InvoiceLineForm = {
      ...freeformLine,
      quantity: 1.5,
      unit_price_kr: 99.99,
    }
    const props = makeFreeformProps({ line })
    await renderRow(props)

    expect(screen.getByTestId('line-net-ore-0').dataset.value).toBe('14999')
  })

  it('7.2 per-rad canary B2.5: qty=0.5 × price=64.99 → 3250 öre', async () => {
    const line: InvoiceLineForm = {
      ...freeformLine,
      quantity: 0.5,
      unit_price_kr: 64.99,
    }
    const props = makeFreeformProps({ line })
    await renderRow(props)

    expect(screen.getByTestId('line-net-ore-0').dataset.value).toBe('3250')
  })

  /**
   * DOM-rendering-smoke: InvoiceLineRow och InvoiceTotals använder samma
   * Alt B-formel (Fall B, se docs/s68-step0-output.md), så matematiken är
   * tautologisk. Testet fångar ändå:
   *   - Render-fel (crasher, tomma värden, felaktiga testid)
   *   - Props-drift (olika line-strukturer mellan komponenter)
   *   - Formaterings-buggar (data-value saknas på någondera sida)
   * Det är INTE ett M131-konsistensbevis (det görs av per-rad-canaries +
   * InvoiceTotals-canaries var för sig + grep-checken S68d).
   */
  it('7.3 DOM-smoke: per-rad + totals renderar konsekvent för B2.4/B2.5', async () => {
    const lines: InvoiceLineForm[] = [
      { ...freeformLine, quantity: 1.5, unit_price_kr: 99.99 },
      { ...freeformLine, quantity: 0.5, unit_price_kr: 64.99, temp_id: 'line-3' },
    ]

    await renderWithProviders(
      <table>
        <tbody>
          {lines.map((line, idx) => (
            <InvoiceLineRow
              key={line.temp_id}
              line={line}
              index={idx}
              counterpartyId={1}
              onUpdate={vi.fn()}
              onRemove={vi.fn()}
            />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>
              <InvoiceTotals lines={lines} />
            </td>
          </tr>
        </tfoot>
      </table>,
    )

    // Per-rad-värden mot canary-sanningar
    expect(screen.getByTestId('line-net-ore-0').dataset.value).toBe('14999')
    expect(screen.getByTestId('line-net-ore-1').dataset.value).toBe('3250')

    // Total finns och är läsbar
    const totalEl = screen.getByTestId('total-net-ore')
    expect(totalEl).toBeInTheDocument()
    expect(totalEl.dataset.value).toMatch(/^\d+$/)

    // Sum-invariant: per-rad-DOM === total-DOM
    const perLineNet = lines.map((_, idx) =>
      parseInt(screen.getByTestId(`line-net-ore-${idx}`).dataset.value!, 10)
    )
    const sumFromRows = perLineNet.reduce((a, b) => a + b, 0)
    const totalNet = parseInt(totalEl.dataset.value!, 10)
    expect(sumFromRows).toBe(totalNet)
  })
})
