// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { CustomerForm } from '../../../../src/renderer/components/customers/CustomerForm'
import type { Counterparty } from '../../../../src/shared/types'

const DEFAULT_PROPS = {
  onClose: vi.fn(),
  onSaved: vi.fn(),
}

beforeEach(() => {
  setupMockIpc()
})

function renderForm(overrides?: { counterparty?: Counterparty; defaultType?: 'customer' | 'supplier'; onClose?: () => void; onSaved?: (id: number) => void }) {
  const props = { ...DEFAULT_PROPS, ...overrides }
  return renderWithProviders(<CustomerForm {...props} />, { axeCheck: false }) // M133 exempt — dedicated axe test below
}

describe('CustomerForm', () => {
  it('axe-check passes', async () => {
    const { axeResults } = await renderWithProviders(
      <CustomerForm {...DEFAULT_PROPS} />,
    )
    expect(axeResults?.violations).toEqual([])
  })

  it('renders all form fields', async () => {
    await renderForm()
    await waitFor(() => {
      expect(screen.getByLabelText(/Namn/)).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/Typ/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Organisationsnummer/)).toBeInTheDocument()
    expect(screen.getByLabelText(/VAT-nummer/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Adress/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Kontaktperson/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Betalningsvillkor/)).toBeInTheDocument()
  })

  it('submits with valid data and calls onSaved', async () => {
    const onSaved = vi.fn()
    mockIpcResponse('counterparty:create', { success: true, data: { id: 42 } })
    await renderForm({ onSaved })

    await waitFor(() => {
      expect(screen.getByLabelText(/Namn/)).toBeInTheDocument()
    })

    await userEvent.type(screen.getByLabelText(/Namn/), 'Acme AB')
    await userEvent.click(screen.getByRole('button', { name: 'Spara' }))

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(42)
    })
  })

  it('shows validation error for empty name', async () => {
    await renderForm()
    await waitFor(() => {
      expect(screen.getByLabelText(/Namn/)).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: 'Spara' }))

    await waitFor(() => {
      expect(screen.getByText(/Namn är obligatoriskt/)).toBeInTheDocument()
    })
  })

  it('pre-fills fields in edit mode', async () => {
    const counterparty: Counterparty = {
      id: 5,
      name: 'Befintlig Kund AB',
      type: 'customer',
      org_number: '556000-0000',
      vat_number: 'SE55600000001',
      address_line1: 'Storgatan 1',
      postal_code: '111 22',
      city: 'Stockholm',
      country: 'Sverige',
      contact_person: 'Anna Svensson',
      email: 'anna@kund.se',
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
    await renderForm({ counterparty })

    await waitFor(() => {
      expect(screen.getByLabelText(/Namn/)).toHaveValue('Befintlig Kund AB')
    })
    expect(screen.getByLabelText(/Organisationsnummer/)).toHaveValue('556000-0000')
  })

  it('shows VAT suggestion for Swedish company with org number', async () => {
    const counterparty: Counterparty = {
      id: 5,
      name: 'Svensk AB',
      type: 'customer',
      org_number: '556036-0793',
      vat_number: '',
      address_line1: null,
      postal_code: null,
      city: null,
      country: 'Sverige',
      contact_person: null,
      email: null,
      phone: null,
      default_payment_terms: 30,
      is_active: 1,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    bankgiro: null,
    plusgiro: null,
    bank_account: null,
    bank_clearing: null,
    }
    await renderForm({ counterparty })

    await waitFor(() => {
      expect(screen.getByText(/Förslag: SE556036079301/)).toBeInTheDocument()
    })
  })
})
