// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent, act } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { GlobalSearch } from '../../../../src/renderer/components/layout/GlobalSearch'
import type { GlobalSearchResponse } from '../../../../src/shared/search-types'

const MOCK_RESULTS: GlobalSearchResponse = {
  results: [
    { type: 'invoice', identifier: '101', title: 'Faktura #1', subtitle: '10 000 kr', route: '/income/view/1' },
    { type: 'customer', identifier: '1', title: 'Acme AB', subtitle: 'Kund', route: '/customers/1' },
    { type: 'product', identifier: '5', title: 'Konsultarvode', subtitle: '1 000 kr/h', route: '/products/5' },
  ],
  total_count: 3,
}

beforeEach(() => {
  setupMockIpc()
})

describe('GlobalSearch', () => {
  it('renders input with placeholder', async () => {
    await renderWithProviders(<GlobalSearch />, { axeCheck: false }) // M133 exempt — dedicated axe test below
    // VS-63: plattformsmedveten — ⌘K på Mac, Ctrl+K annars
    expect(screen.getByPlaceholderText(/Sök \((⌘K|Ctrl\+K)\)/)).toBeInTheDocument()
  })

  it('typing < 2 chars does not open dropdown', async () => {
    await renderWithProviders(<GlobalSearch />, { axeCheck: false }) // M133 exempt — dedicated axe test below
    const input = screen.getByPlaceholderText(/Sök/)
    await act(async () => {
      fireEvent.change(input, { target: { value: 'A' } })
    })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('typing >= 2 chars opens dropdown with results after debounce', async () => {
    mockIpcResponse('search:global', { success: true, data: MOCK_RESULTS })
    await renderWithProviders(<GlobalSearch />, { axeCheck: false }) // M133 exempt — dedicated axe test below

    const input = screen.getByPlaceholderText(/Sök/)
    await act(async () => {
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'Acme' } })
    })

    // Wait for debounce (300ms) + react-query fetch
    await waitFor(() => {
      expect(screen.getByText('Acme AB')).toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('results grouped with type headers', async () => {
    mockIpcResponse('search:global', { success: true, data: MOCK_RESULTS })
    await renderWithProviders(<GlobalSearch />, { axeCheck: false }) // M133 exempt — dedicated axe test below

    const input = screen.getByPlaceholderText(/Sök/)
    await act(async () => {
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'test' } })
    })

    await waitFor(() => {
      expect(screen.getByText(/Fakturor/)).toBeInTheDocument()
    }, { timeout: 2000 })
    expect(screen.getByText(/Kunder/)).toBeInTheDocument()
    expect(screen.getByText(/Artiklar/)).toBeInTheDocument()
  })

  it('Escape closes dropdown', async () => {
    mockIpcResponse('search:global', { success: true, data: MOCK_RESULTS })
    await renderWithProviders(<GlobalSearch />, { axeCheck: false }) // M133 exempt — dedicated axe test below

    const input = screen.getByPlaceholderText(/Sök/)
    await act(async () => {
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'Acme' } })
    })

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    }, { timeout: 2000 })

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Escape' })
    })

    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('empty results shows "Inga resultat" message', async () => {
    mockIpcResponse('search:global', { success: true, data: { results: [], total_count: 0 } })
    await renderWithProviders(<GlobalSearch />, { axeCheck: false }) // M133 exempt — dedicated axe test below

    const input = screen.getByPlaceholderText(/Sök/)
    await act(async () => {
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'nonexistent' } })
    })

    await waitFor(() => {
      expect(screen.getByText(/Inga resultat/)).toBeInTheDocument()
    }, { timeout: 2000 })
  })

  it('ArrowDown navigates results', async () => {
    mockIpcResponse('search:global', { success: true, data: MOCK_RESULTS })
    await renderWithProviders(<GlobalSearch />, { axeCheck: false }) // M133 exempt — dedicated axe test below

    const input = screen.getByPlaceholderText(/Sök/)
    await act(async () => {
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'test' } })
    })

    // Wait for debounce + data to load
    await waitFor(() => {
      expect(screen.getByText('Faktura #1')).toBeInTheDocument()
    }, { timeout: 2000 })

    // ArrowDown selects first result
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown' })
    })

    // First result in TYPE_ORDER is invoice
    const firstOption = screen.getByText('Faktura #1').closest('[role="option"]')
    expect(firstOption?.getAttribute('aria-selected')).toBe('true')
  })

  it('has ARIA combobox role', async () => {
    await renderWithProviders(<GlobalSearch />, { axeCheck: false }) // M133 exempt — dedicated axe test below
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('input has role="searchbox"', async () => {
    await renderWithProviders(<GlobalSearch />, { axeCheck: false }) // M133 exempt — dedicated axe test below
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })

  it('passes axe a11y check', async () => {
    const { axeResults } = await renderWithProviders(<GlobalSearch />)
    expect(axeResults?.violations).toEqual([])
  })
})
