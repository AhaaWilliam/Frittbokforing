// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from './setup/mock-ipc'
import { renderWithProviders } from './helpers/render-with-providers'
import { PageAccountStatement } from '../src/renderer/pages/PageAccountStatement'

const ACCOUNTS = [
  { account_number: '1510', name: 'Kundfordringar', k2_allowed: 1, k3_only: 0, is_active: 1, is_system_account: 0 },
  { account_number: '1930', name: 'Företagskonto', k2_allowed: 1, k3_only: 0, is_active: 1, is_system_account: 0 },
]

beforeEach(() => {
  setupMockIpc()
  mockIpcResponse('account:list-all', { success: true, data: ACCOUNTS })
  mockIpcResponse('search:global', { success: true, data: { results: [], total_count: 0 } })
})

describe('PageAccountStatement print mode (A4)', () => {
  it('filter section has print:hidden class', async () => {
    await renderWithProviders(<PageAccountStatement />, {
      initialRoute: '/account-statement',
    })

    await waitFor(() => {
      expect(screen.getByTestId('filter-section')).toBeInTheDocument()
    })

    expect(screen.getByTestId('filter-section').className).toContain('print:hidden')
  })

  it('print header exists in DOM with print:block class', async () => {
    await renderWithProviders(<PageAccountStatement />, {
      initialRoute: '/account-statement',
    })

    await waitFor(() => {
      expect(screen.getByTestId('print-header')).toBeInTheDocument()
    })

    expect(screen.getByTestId('print-header').className).toContain('print:block')
  })

  it('print button renders', async () => {
    await renderWithProviders(<PageAccountStatement />, {
      initialRoute: '/account-statement',
    })

    await waitFor(() => {
      expect(screen.getByTestId('print-button')).toBeInTheDocument()
    })
  })
})
