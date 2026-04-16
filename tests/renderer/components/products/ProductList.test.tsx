// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ProductList } from '../../../../src/renderer/components/products/ProductList'

const PRODUCTS = [
  { id: 1, name: 'Konsulttjänst', description: 'Timbaserad', unit: 'tim', default_price_ore: 95000, article_type: 'service', is_active: true },
  { id: 2, name: 'Kontorsstol', description: 'Ergonomisk', unit: 'st', default_price_ore: 350000, article_type: 'goods', is_active: true },
  { id: 3, name: 'Parkeringsavgift', description: 'Utlägg', unit: 'st', default_price_ore: 10000, article_type: 'expense', is_active: true },
]

function renderList(props?: Partial<{
  selectedId: number | null
  onSelect: (id: number) => void
  search: string
  typeFilter: string | undefined
}>) {
  mockIpcResponse('product:list', { success: true, data: PRODUCTS })
  return renderWithProviders(
    <ProductList
      selectedId={props?.selectedId ?? null}
      onSelect={props?.onSelect ?? vi.fn()}
      search={props?.search ?? ''}
      typeFilter={props?.typeFilter}
    />,
    { axeCheck: false }, // M133 exempt — dedicated axe test below
  )
}

beforeEach(() => {
  setupMockIpc()
})

describe('ProductList', () => {
  it('axe-check passes', async () => {
    mockIpcResponse('product:list', { success: true, data: PRODUCTS })
    const { axeResults } = await renderWithProviders(
      <ProductList selectedId={null} onSelect={vi.fn()} search="" typeFilter={undefined} />,
    )
    expect(axeResults?.violations).toEqual([])
  })

  it('renders all products', async () => {
    await renderList()
    await waitFor(() => {
      expect(screen.getByText('Konsulttjänst')).toBeDefined()
      expect(screen.getByText('Kontorsstol')).toBeDefined()
      expect(screen.getByText('Parkeringsavgift')).toBeDefined()
    })
  })

  it('click calls onSelect with product id', async () => {
    const onSelect = vi.fn()
    await renderList({ onSelect })
    await waitFor(() => {
      expect(screen.getByText('Konsulttjänst')).toBeDefined()
    })
    await userEvent.click(screen.getByText('Konsulttjänst'))
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('empty state when no products', async () => {
    mockIpcResponse('product:list', { success: true, data: [] })
    await renderWithProviders(
      <ProductList selectedId={null} onSelect={vi.fn()} search="" typeFilter={undefined} />,
      { axeCheck: false }, // M133 exempt
    )
    await waitFor(() => {
      expect(screen.getByText(/inga artiklar/i)).toBeDefined()
    })
  })

  it('shows price for each product', async () => {
    await renderList()
    await waitFor(() => {
      // 95000 öre = 950 kr
      expect(screen.getByText(/950/)).toBeDefined()
    })
  })
})
