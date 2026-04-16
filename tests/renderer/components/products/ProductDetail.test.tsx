// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ProductDetail } from '../../../../src/renderer/components/products/ProductDetail'

const PRODUCT = {
  id: 1,
  name: 'Konsulttjänst',
  description: 'Timbaserad konsulttjänst',
  unit: 'timme',
  default_price_ore: 95000,
  vat_code_id: 1,
  account_id: 10,
  article_type: 'service',
  is_active: 1,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  customer_prices: [
    { counterparty_id: 1, counterparty_name: 'Acme AB', price_ore: 85000 },
  ],
}

const DEFAULT_PROPS = {
  id: 1,
  onEdit: vi.fn(),
}

beforeEach(() => {
  setupMockIpc()
})

function mockProductGet() {
  mockIpcResponse('product:get', { success: true, data: PRODUCT })
}

function renderDetail(overrides?: Partial<typeof DEFAULT_PROPS>) {
  const props = { ...DEFAULT_PROPS, ...overrides }
  mockProductGet()
  // CustomerPriceTable uses useCounterparties
  mockIpcResponse('counterparty:list', { success: true, data: [] })
  return renderWithProviders(<ProductDetail {...props} />, { axeCheck: false })
}

describe('ProductDetail', () => {
  it('axe-check passes', async () => {
    mockProductGet()
    mockIpcResponse('counterparty:list', { success: true, data: [] })
    const { axeResults } = await renderWithProviders(
      <ProductDetail {...DEFAULT_PROPS} />,
    )
    expect(axeResults?.violations).toEqual([])
  })

  it('renders product name, price and unit', async () => {
    await renderDetail()
    await waitFor(() => {
      expect(screen.getByText('Konsulttjänst')).toBeInTheDocument()
    })
    // formatKr(95000) = "950 kr" (Intl sv-SE currency format)
    expect(screen.getByText(/950/)).toBeInTheDocument()
    // unit appears multiple times (price display + detail row)
    expect(screen.getAllByText(/timme/).length).toBeGreaterThanOrEqual(1)
  })

  it('shows deactivation confirm step on button click', async () => {
    await renderDetail()
    await waitFor(() => {
      expect(screen.getByText('Konsulttjänst')).toBeInTheDocument()
    })

    const deactivateBtn = screen.getByRole('button', { name: 'Inaktivera' })
    await userEvent.click(deactivateBtn)

    expect(
      screen.getByText(/Vill du verkligen inaktivera/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Ja, inaktivera' }),
    ).toBeInTheDocument()
  })
})
