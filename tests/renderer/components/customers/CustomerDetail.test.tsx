// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { CustomerDetail } from '../../../../src/renderer/components/customers/CustomerDetail'
import type { Counterparty } from '../../../../src/shared/types'

const COUNTERPARTY: Counterparty = {
  id: 1,
  name: 'Acme AB',
  type: 'customer',
  org_number: '556036-0793',
  vat_number: 'SE556036079301',
  address_line1: 'Storgatan 1',
  postal_code: '111 22',
  city: 'Stockholm',
  country: 'Sverige',
  contact_person: 'Anna Svensson',
  email: 'anna@acme.se',
  phone: '08-123456',
  default_payment_terms: 30,
  is_active: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
    bankgiro: null,
    plusgiro: null,
    bank_account: null,
    bank_clearing: null,
}

const DEFAULT_PROPS = {
  id: 1,
  onEdit: vi.fn(),
}

beforeEach(() => {
  setupMockIpc()
})

function mockCounterpartyGet(data: Counterparty | null = COUNTERPARTY) {
  mockIpcResponse('counterparty:get', { success: true, data })
}

function renderDetail(overrides?: Partial<typeof DEFAULT_PROPS>) {
  const props = { ...DEFAULT_PROPS, onEdit: vi.fn(), ...overrides }
  mockCounterpartyGet()
  return renderWithProviders(<CustomerDetail {...props} />, { axeCheck: false })
}

describe('CustomerDetail', () => {
  it('axe-check passes', async () => {
    mockCounterpartyGet()
    const { axeResults } = await renderWithProviders(
      <CustomerDetail {...DEFAULT_PROPS} />,
    )
    expect(axeResults?.violations).toEqual([])
  })

  it('renders counterparty name, type and org number', async () => {
    await renderDetail()
    await waitFor(() => {
      expect(screen.getByText('Acme AB')).toBeInTheDocument()
    })
    expect(screen.getByText('Kund')).toBeInTheDocument()
    expect(screen.getByText('556036-0793')).toBeInTheDocument()
  })

  it('shows dash for null fields', async () => {
    const partial: Counterparty = {
      ...COUNTERPARTY,
      address_line1: null,
      contact_person: null,
      email: null,
      phone: null,
    }
    mockCounterpartyGet(partial)
    await renderWithProviders(
      <CustomerDetail {...DEFAULT_PROPS} />,
      { axeCheck: false },
    )
    await waitFor(() => {
      expect(screen.getByText('Acme AB')).toBeInTheDocument()
    })
    // DetailRow renders "—" for null values
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(4)
  })

  it('deactivate flow: click → confirm → mutation called with correct id', async () => {
    await renderDetail()
    await waitFor(() => {
      expect(screen.getByText('Acme AB')).toBeInTheDocument()
    })

    // Click deactivate
    await userEvent.click(screen.getByRole('button', { name: 'Inaktivera' }))
    expect(screen.getByText(/Vill du verkligen inaktivera/)).toBeInTheDocument()

    // Confirm
    await userEvent.click(screen.getByRole('button', { name: 'Ja, inaktivera' }))

    // Verify mutation was called
    const api = window.api as unknown as Record<string, ReturnType<typeof vi.fn>>
    expect(api.deactivateCounterparty).toHaveBeenCalledWith({ id: 1 })
  })
})
