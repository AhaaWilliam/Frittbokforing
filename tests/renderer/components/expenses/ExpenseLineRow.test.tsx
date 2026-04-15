// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { setupMockIpc } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ExpenseLineRow } from '../../../../src/renderer/components/expenses/ExpenseLineRow'
import { formatKr, toOre } from '../../../../src/renderer/lib/format'
import type { ExpenseLineForm } from '../../../../src/renderer/lib/form-schemas/expense'
import type { Account, VatCode } from '../../../../src/shared/types'

// ── Fixturer ─────────────────────────────────────────────────────────

const defaultVatCodes: VatCode[] = [
  { id: 1, code: '25', description: 'Moms 25%', rate_percent: 25, vat_type: 'incoming', report_box: null },
  { id: 2, code: '12', description: 'Moms 12%', rate_percent: 12, vat_type: 'incoming', report_box: null },
  { id: 3, code: '06', description: 'Moms 6%', rate_percent: 6, vat_type: 'incoming', report_box: null },
]

const defaultExpenseAccounts: Account[] = [
  { id: 1, account_number: '4010', name: 'Inköp material', account_type: 'expense', is_active: 1, k2_allowed: 1, k3_only: 0, is_system_account: 0 },
  { id: 2, account_number: '5410', name: 'Förbrukningsinventarier', account_type: 'expense', is_active: 1, k2_allowed: 1, k3_only: 0, is_system_account: 0 },
]

const defaultLine: ExpenseLineForm = {
  temp_id: 'line-1',
  description: 'Kontorsmaterial',
  account_number: '4010',
  quantity: 2,
  unit_price_kr: 150,
  vat_code_id: 1,
  vat_rate: 0.25,
}

interface ExpenseLineRowProps {
  line: ExpenseLineForm
  index: number
  expenseAccounts: Account[]
  vatCodes: VatCode[]
  onUpdate: (index: number, updates: Partial<ExpenseLineForm>) => void
  onRemove: (index: number) => void
}

function makeProps(overrides?: Partial<ExpenseLineRowProps>): ExpenseLineRowProps {
  return {
    index: 0,
    line: defaultLine,
    vatCodes: defaultVatCodes,
    expenseAccounts: defaultExpenseAccounts,
    onUpdate: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  }
}

async function renderRow(props: ExpenseLineRowProps) {
  return renderWithProviders(
    <table><tbody><ExpenseLineRow {...props} /></tbody></table>,
  )
}

/** Hitta total-cellen (den med tabular-nums-klass). */
function getTotalCell(container: HTMLElement): HTMLElement {
  const cell = container.querySelector('td.tabular-nums')
  if (!cell) throw new Error('Total cell not found')
  return cell as HTMLElement
}

/** Normalisera non-breaking spaces → regular space för toHaveTextContent-jämförelse. */
function expectedTotal(krValue: number): string {
  return formatKr(toOre(krValue)).replace(/\u00a0/g, ' ')
}

// ── Setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  setupMockIpc()
})

// ── Grupp 1: Rendering och display ───────────────────────────────────

describe('ExpenseLineRow — rendering', () => {
  it('renderar alla fält från line-prop', async () => {
    const props = makeProps()
    const { getByLabelText, getByTitle } = await renderRow(props)

    expect(getByLabelText('Beskrivning')).toHaveValue('Kontorsmaterial')
    expect(getByLabelText('Konto')).toHaveValue('4010')
    expect(getByLabelText('Antal')).toHaveValue(2)
    expect(getByLabelText('Pris')).toHaveValue(150)
    expect(getByLabelText('Moms')).toHaveValue('1')
    expect(getByTitle('Ta bort rad')).toBeInTheDocument()
  })

  it('visar totalsumma inkl moms', async () => {
    // quantity=2, unit_price_kr=150, vat_rate=0.25
    // lineTotal=300, lineVat=75, total=375
    const props = makeProps()
    const { container } = await renderRow(props)
    const totalCell = getTotalCell(container)

    expect(totalCell).toHaveTextContent(expectedTotal(375))
  })

  it('renderar konto-optioner med rätt format', async () => {
    const props = makeProps()
    const { getByLabelText } = await renderRow(props)
    const accountSelect = getByLabelText('Konto')
    const options = accountSelect.querySelectorAll('option')

    // Placeholder + 2 konton
    expect(options).toHaveLength(3)
    expect(options[1]).toHaveTextContent('4010 Inköp material')
    expect(options[2]).toHaveTextContent('5410 Förbrukningsinventarier')
  })

  it('renderar moms-optioner med description och procent', async () => {
    const props = makeProps()
    const { getByLabelText } = await renderRow(props)
    const vatSelect = getByLabelText('Moms')
    const options = vatSelect.querySelectorAll('option')

    // Placeholder + 3 momssatser
    expect(options).toHaveLength(4)
    expect(options[1]).toHaveTextContent('Moms 25% (25%)')
    expect(options[2]).toHaveTextContent('Moms 12% (12%)')
    expect(options[3]).toHaveTextContent('Moms 6% (6%)')
  })
})

// ── Grupp 2: Callback-propagering ────────────────────────────────────

describe('ExpenseLineRow — callbacks', () => {
  it('propagerar description-ändring', async () => {
    const props = makeProps()
    const { getByLabelText } = await renderRow(props)

    fireEvent.change(getByLabelText('Beskrivning'), { target: { value: 'Ny text' } })

    expect(props.onUpdate).toHaveBeenCalledWith(0, { description: 'Ny text' })
  })

  it('propagerar konto-val', async () => {
    const props = makeProps()
    const { getByLabelText } = await renderRow(props)

    fireEvent.change(getByLabelText('Konto'), { target: { value: '5410' } })

    expect(props.onUpdate).toHaveBeenCalledWith(0, { account_number: '5410' })
  })

  it('propagerar quantity — giltigt värde + fallback', async () => {
    const props = makeProps()
    const { getByLabelText } = await renderRow(props)
    const quantityInput = getByLabelText('Antal')

    // Giltigt: "5" → 5
    fireEvent.change(quantityInput, { target: { value: '5' } })
    expect(props.onUpdate).toHaveBeenCalledWith(0, { quantity: 5 })

    vi.mocked(props.onUpdate).mockClear()

    // "" → parseInt("",10) = NaN → falsy → ||1 → 1
    fireEvent.change(quantityInput, { target: { value: '' } })
    expect(props.onUpdate).toHaveBeenCalledWith(0, { quantity: 1 })

    vi.mocked(props.onUpdate).mockClear()

    // "abc" → NaN → ||1 → 1
    fireEvent.change(quantityInput, { target: { value: 'abc' } })
    expect(props.onUpdate).toHaveBeenCalledWith(0, { quantity: 1 })

    vi.mocked(props.onUpdate).mockClear()

    // "0" → 0 → falsy → ||1 → 1
    // Känd begränsning: "0" triggar fallback, quantity=0 ej möjlig via input
    fireEvent.change(quantityInput, { target: { value: '0' } })
    expect(props.onUpdate).toHaveBeenCalledWith(0, { quantity: 1 })
  })

  it('propagerar pris — giltigt värde + fallback', async () => {
    const props = makeProps()
    const { getByLabelText } = await renderRow(props)
    const priceInput = getByLabelText('Pris')

    // Giltigt: "99.50" → 99.5
    fireEvent.change(priceInput, { target: { value: '99.50' } })
    expect(props.onUpdate).toHaveBeenCalledWith(0, { unit_price_kr: 99.5 })

    vi.mocked(props.onUpdate).mockClear()

    // Tomt: "" → NaN → ||0 → 0
    fireEvent.change(priceInput, { target: { value: '' } })
    expect(props.onUpdate).toHaveBeenCalledWith(0, { unit_price_kr: 0 })
  })

  it('moms-val resolvar rate från vatCodes-prop', async () => {
    const props = makeProps()
    const { getByLabelText } = await renderRow(props)

    fireEvent.change(getByLabelText('Moms'), { target: { value: '2' } })

    // vc.id=2 → rate_percent=12 → vat_rate = 12/100 = 0.12
    expect(props.onUpdate).toHaveBeenCalledWith(0, {
      vat_code_id: 2,
      vat_rate: 0.12,
    })
  })

  it('ta-bort-knapp anropar onRemove', async () => {
    const props = makeProps()
    const { getByTitle } = await renderRow(props)

    fireEvent.click(getByTitle('Ta bort rad'))

    expect(props.onRemove).toHaveBeenCalledWith(0)
  })
})

// ── Grupp 3: Beräkningsrimlighet kr→öre ──────────────────────────────

describe('ExpenseLineRow — beräkningar', () => {
  it('lineTotal = quantity × unit_price_kr (vat_rate=0)', async () => {
    // Isolera lineTotal genom att sätta vat_rate=0
    const line: ExpenseLineForm = {
      ...defaultLine,
      quantity: 3,
      unit_price_kr: 100,
      vat_rate: 0,
    }
    const props = makeProps({ line })
    const { container } = await renderRow(props)

    // lineTotal=300, lineVat=0, total=300
    expect(getTotalCell(container)).toHaveTextContent(expectedTotal(300))
  })

  it('total inkluderar moms: lineTotal + lineVat', async () => {
    const line: ExpenseLineForm = {
      ...defaultLine,
      quantity: 2,
      unit_price_kr: 100,
      vat_rate: 0.25,
    }
    const props = makeProps({ line })
    const { container } = await renderRow(props)

    // lineTotal=200, lineVat=50, total=250
    expect(getTotalCell(container)).toHaveTextContent(expectedTotal(250))
  })

  it('öre-konvertering — precision vid decimaler', async () => {
    const line: ExpenseLineForm = {
      ...defaultLine,
      quantity: 1,
      unit_price_kr: 99.99,
      vat_rate: 0.25,
    }
    const props = makeProps({ line })
    const { container } = await renderRow(props)

    // lineTotal=99.99, lineVat=24.9975, total=124.9875
    // toOre(124.9875) = Math.round(12498.75) = 12499
    // toOre(124.9875) = Math.round(12498.75) = 12499 → 124,99 kr
    const total = 99.99 + 99.99 * 0.25
    expect(getTotalCell(container)).toHaveTextContent(
      formatKr(toOre(total)).replace(/\u00a0/g, ' '),
    )
  })

  it('quantity=0 → totalsumma 0', async () => {
    const line: ExpenseLineForm = {
      ...defaultLine,
      quantity: 0,
      unit_price_kr: 150,
      vat_rate: 0.25,
    }
    const props = makeProps({ line })
    const { container } = await renderRow(props)

    expect(getTotalCell(container)).toHaveTextContent(expectedTotal(0))
  })
})

// ── Grupp 4: Memo-kontrakt ───────────────────────────────────────────

describe('ExpenseLineRow — memo', () => {
  it('är memoiserad (M102)', () => {
    expect((ExpenseLineRow as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.memo'),
    )
  })
})

// ── Grupp 5: Edge ────────────────────────────────────────────────────

describe('ExpenseLineRow — edge cases', () => {
  it('vat_code_id=0 anropar onUpdate utan vat_rate (E2)', async () => {
    const props = makeProps()
    const { getByLabelText } = await renderRow(props)

    // Välj "Välj moms..." (value=0) — ingen matchande vc → ingen vat_rate-spridning
    fireEvent.change(getByLabelText('Moms'), { target: { value: '0' } })

    expect(props.onUpdate).toHaveBeenCalledWith(0, { vat_code_id: 0 })
    // Verifiera att vat_rate INTE ingår i uppdateringen
    const updateArg = vi.mocked(props.onUpdate).mock.calls[0][1]
    expect(updateArg).not.toHaveProperty('vat_rate')
  })
})

// ── Grupp 5b: F35 — HTML min-attribut ───────────────────────────────

describe('ExpenseLineRow — F35 quantity min', () => {
  it('quantity input has min=1 (M130: expense qty integer >= 1)', async () => {
    const props = makeProps()
    await renderRow(props)
    const input = screen.getByLabelText('Antal')
    expect(input).toHaveAttribute('min', '1')
  })
})

// ── Grupp 6: F47 precision — M131 Alt B (Sprint 21 S68b, defensiv) ────
//
// ExpenseLineRow är Alt B-beräknad som defensiv M131-efterlevnad.
// I produktion blockerar z.number().int() fraktional qty på alla lager
// (form-schema, IPC-schema, DB — verifierat i Steg 0.3e), så IEEE754-fel
// kan inte uppstå via normal användning. Zod-regression-guard-testet
// skyddar om Zod-invarianten någonsin bryts.

describe('ExpenseLineRow — F47 M131 precision (S68b, defensiv)', () => {
  it('6.1 int-sanity: qty=3 × price=25.50 → 7650 öre', async () => {
    const line: ExpenseLineForm = {
      ...defaultLine,
      quantity: 3,
      unit_price_kr: 25.50,
      vat_rate: 0,
    }
    const props = makeProps({ line })
    await renderRow(props)

    expect(screen.getByTestId('expense-line-net-ore-0').dataset.value).toBe('7650')
  })

  /**
   * Zod-regression-guard: verifierar att Alt B är faktiskt applicerad,
   * inte bara gamla formeln (quantity * unit_price_kr).
   *
   * Med Alt B: round(round(0.5*100) * round(99.99*100) / 100)
   *          = round(50 * 9999 / 100) = round(4999.5) = 5000 (deterministisk)
   *
   * Detta test kringgår Zod (komponenten får fraktional qty via prop)
   * och verifierar att Alt B ger rätt heltalsresultat. Om int-invarianten
   * skulle brytas i framtiden (Zod-schema ändras) är komponenten redan skyddad.
   */
  it('6.2 Zod-regression-guard: Alt B appliceras även om int-invarianten skulle brytas', async () => {
    const line: ExpenseLineForm = {
      ...defaultLine,
      quantity: 0.5,
      unit_price_kr: 99.99,
      vat_rate: 0,
    }
    const props = makeProps({ line })
    await renderRow(props)

    // Alt B ger deterministiskt 5000; gamla formeln kan ge 4999 eller 5000
    expect(screen.getByTestId('expense-line-net-ore-0').dataset.value).toBe('5000')
  })
})
