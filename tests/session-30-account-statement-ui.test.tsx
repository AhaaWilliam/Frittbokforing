// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from './setup/mock-ipc'
import { renderWithProviders } from './helpers/render-with-providers'
import { PageAccountStatement } from '../src/renderer/pages/PageAccountStatement'

// --- Fixtures ---

const ACCOUNTS = [
  { account_number: '1510', name: 'Kundfordringar', k2_allowed: 1, k3_only: 0, is_active: 1, is_system_account: 0 },
  { account_number: '1930', name: 'Företagskonto', k2_allowed: 1, k3_only: 0, is_active: 1, is_system_account: 0 },
  { account_number: '2440', name: 'Leverantörsskulder', k2_allowed: 1, k3_only: 0, is_active: 1, is_system_account: 0 },
  { account_number: '3001', name: 'Försäljning', k2_allowed: 1, k3_only: 0, is_active: 1, is_system_account: 0 },
]

const STATEMENT_1510 = {
  account_number: '1510',
  account_name: 'Kundfordringar',
  lines: [
    { date: '2026-01-15', verification_series: 'A', verification_number: 1, description: 'Faktura #1', debit_ore: 12500, credit_ore: 0, running_balance_ore: 12500 },
    { date: '2026-02-01', verification_series: 'A', verification_number: 5, description: 'Betalning', debit_ore: 0, credit_ore: 12500, running_balance_ore: 0 },
  ],
  summary: {
    opening_balance_ore: 0,
    total_debit_ore: 12500,
    total_credit_ore: 12500,
    closing_balance_ore: 0,
    transaction_count: 2,
  },
}

const STATEMENT_2440 = {
  account_number: '2440',
  account_name: 'Leverantörsskulder',
  lines: [
    { date: '2026-03-01', verification_series: 'B', verification_number: 1, description: 'Kostnad', debit_ore: 0, credit_ore: 5000, running_balance_ore: -5000 },
  ],
  summary: {
    opening_balance_ore: 0,
    total_debit_ore: 0,
    total_credit_ore: 5000,
    closing_balance_ore: -5000,
    transaction_count: 1,
  },
}

const EMPTY_STATEMENT = {
  account_number: '1930',
  account_name: 'Företagskonto',
  lines: [],
  summary: {
    opening_balance_ore: 0,
    total_debit_ore: 0,
    total_credit_ore: 0,
    closing_balance_ore: 0,
    transaction_count: 0,
  },
}

// --- Helpers ---

async function waitForAccountSelect() {
  return waitFor(() => screen.getByLabelText('Konto:'))
}

// --- Setup ---

beforeEach(() => {
  setupMockIpc()
  mockIpcResponse('account:list-all', { success: true, data: ACCOUNTS })
})

describe('PageAccountStatement', () => {
  it('renders with account dropdown (axe)', async () => {
    mockIpcResponse('account:get-statement', { success: true, data: EMPTY_STATEMENT })

    await renderWithProviders(<PageAccountStatement />, {
      initialRoute: '/account-statement',
    })

    await waitForAccountSelect()
    expect(screen.getByText('Kontoutdrag')).toBeInTheDocument()
    expect(screen.getByLabelText('Konto:')).toBeInTheDocument()
    expect(screen.getByText('Välj ett konto för att visa kontoutdrag.')).toBeInTheDocument()
  })

  it('shows empty message when no account selected', async () => {
    mockIpcResponse('account:get-statement', { success: true, data: EMPTY_STATEMENT })

    await renderWithProviders(<PageAccountStatement />, {
      initialRoute: '/account-statement',
    })

    await waitForAccountSelect()
    expect(screen.getByText('Välj ett konto för att visa kontoutdrag.')).toBeInTheDocument()
  })

  it('renders table rows with correct debet/kredit/saldo columns', async () => {
    mockIpcResponse('account:get-statement', { success: true, data: STATEMENT_1510 })

    const user = userEvent.setup()
    await renderWithProviders(<PageAccountStatement />, {
      initialRoute: '/account-statement',
    })

    const select = await waitForAccountSelect()
    await user.selectOptions(select, '1510')

    await waitFor(() => {
      expect(screen.getByText('Faktura #1')).toBeInTheDocument()
    })

    // Check debit column shows amount (appears in row + summary)
    expect(screen.getAllByText('125,00').length).toBeGreaterThanOrEqual(1)
    // Check verification series + number
    expect(screen.getByText('A1')).toBeInTheDocument()
    expect(screen.getByText('A5')).toBeInTheDocument()
  })

  it('"Visa hela räkenskapsåret" button changes date filter', async () => {
    mockIpcResponse('account:get-statement', { success: true, data: STATEMENT_1510 })

    const user = userEvent.setup()
    await renderWithProviders(<PageAccountStatement />, {
      initialRoute: '/account-statement',
    })

    await waitForAccountSelect()
    const button = screen.getByText('Visa hela räkenskapsåret')
    await user.click(button)

    const fromInput = screen.getByLabelText('Från:') as HTMLInputElement
    const toInput = screen.getByLabelText('Till:') as HTMLInputElement
    expect(fromInput.value).toBe('2026-01-01')
    expect(toInput.value).toBe('2026-12-31')
  })

  it('saldo shows (D)/(K) suffix correctly for liability account (class 2)', async () => {
    mockIpcResponse('account:get-statement', { success: true, data: STATEMENT_2440 })

    const user = userEvent.setup()
    await renderWithProviders(<PageAccountStatement />, {
      initialRoute: '/account-statement',
    })

    const select = await waitForAccountSelect()
    await user.selectOptions(select, '2440')

    await waitFor(() => {
      expect(screen.getByText('Kostnad')).toBeInTheDocument()
    })

    // Negative balance should show (K) — both the row and summary footer
    const saloCells = screen.getAllByText(/\(K\)/)
    expect(saloCells.length).toBeGreaterThanOrEqual(1)
  })

  it('summary row shows service summary data', async () => {
    mockIpcResponse('account:get-statement', { success: true, data: STATEMENT_1510 })

    const user = userEvent.setup()
    await renderWithProviders(<PageAccountStatement />, {
      initialRoute: '/account-statement',
    })

    const select = await waitForAccountSelect()
    await user.selectOptions(select, '1510')

    await waitFor(() => {
      expect(screen.getByText('Summa')).toBeInTheDocument()
    })
  })

  it('shows "Inga transaktioner" for empty account', async () => {
    mockIpcResponse('account:get-statement', { success: true, data: EMPTY_STATEMENT })

    const user = userEvent.setup()
    await renderWithProviders(<PageAccountStatement />, {
      initialRoute: '/account-statement',
    })

    const select = await waitForAccountSelect()
    await user.selectOptions(select, '1930')

    await waitFor(() => {
      expect(screen.getByText('Inga transaktioner för detta konto i vald period.')).toBeInTheDocument()
    })
  })
})
