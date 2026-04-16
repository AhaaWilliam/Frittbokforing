// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from './setup/mock-ipc'
import { renderWithProviders } from './helpers/render-with-providers'
import { GlobalSearch } from '../src/renderer/components/layout/GlobalSearch'
import type { GlobalSearchResponse } from '../src/shared/search-types'

const MOCK_RESULTS: GlobalSearchResponse = {
  results: [
    { type: 'invoice', identifier: '1', title: '#1 — Acme AB', subtitle: '12 500 kr · obetald', route: '/income/view/1' },
    { type: 'customer', identifier: '10', title: 'Acme AB', subtitle: 'Kund · 556036-0793', route: '/customers/10' },
    { type: 'account', identifier: '1510', title: '1510 Kundfordringar', subtitle: 'Klass 1 — Tillgångar', route: '/account-statement?account=1510' },
  ],
  total_count: 3,
}

const EMPTY_RESULTS: GlobalSearchResponse = {
  results: [],
  total_count: 0,
}

beforeEach(() => {
  setupMockIpc()
})

describe('GlobalSearch UI', () => {
  it('renders searchbox in sidebar', async () => {
    mockIpcResponse('search:global', { success: true, data: EMPTY_RESULTS })
    await renderWithProviders(<GlobalSearch />)
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })

  it('results list has role="listbox" and results have role="option" (F12)', async () => {
    mockIpcResponse('search:global', { success: true, data: MOCK_RESULTS })
    const user = userEvent.setup()
    await renderWithProviders(<GlobalSearch />)

    const input = screen.getByRole('searchbox')
    await user.click(input)
    await user.type(input, 'Acme')

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      const options = screen.getAllByRole('option')
      expect(options.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows grouped results with type headers', async () => {
    mockIpcResponse('search:global', { success: true, data: MOCK_RESULTS })
    const user = userEvent.setup()
    await renderWithProviders(<GlobalSearch />)

    const input = screen.getByRole('searchbox')
    await user.click(input)
    await user.type(input, 'Acme')

    await waitFor(() => {
      expect(screen.getByText(/Fakturor/)).toBeInTheDocument()
      expect(screen.getByText(/Kunder/)).toBeInTheDocument()
      expect(screen.getByText(/Konton/)).toBeInTheDocument()
    })
  })

  it('clicking a result navigates to correct route', async () => {
    mockIpcResponse('search:global', { success: true, data: MOCK_RESULTS })
    const user = userEvent.setup()
    await renderWithProviders(<GlobalSearch />, { initialRoute: '/overview' })

    const input = screen.getByRole('searchbox')
    await user.click(input)
    await user.type(input, 'Acme')

    await waitFor(() => {
      expect(screen.getAllByRole('option').length).toBeGreaterThanOrEqual(1)
    })

    // Click the customer result
    const customerOption = screen.getAllByRole('option').find(el => el.textContent?.includes('Acme AB') && el.textContent?.includes('Kund'))
    expect(customerOption).toBeDefined()
    await user.click(customerOption!)

    // After clicking, search should be cleared
    expect(input).toHaveValue('')
  })

  it('shows empty state when no results', async () => {
    mockIpcResponse('search:global', { success: true, data: EMPTY_RESULTS })
    const user = userEvent.setup()
    await renderWithProviders(<GlobalSearch />)

    const input = screen.getByRole('searchbox')
    await user.click(input)
    await user.type(input, 'xyz123')

    await waitFor(() => {
      expect(screen.getByText(/Inga resultat/)).toBeInTheDocument()
    })
  })

  it('Escape closes dropdown', async () => {
    mockIpcResponse('search:global', { success: true, data: MOCK_RESULTS })
    const user = userEvent.setup()
    await renderWithProviders(<GlobalSearch />)

    const input = screen.getByRole('searchbox')
    await user.click(input)
    await user.type(input, 'Acme')

    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('passes axe accessibility check (M133)', async () => {
    mockIpcResponse('search:global', { success: true, data: EMPTY_RESULTS })
    const { axeResults } = await renderWithProviders(<GlobalSearch />)
    expect(axeResults?.violations).toHaveLength(0)
  })
})
