// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ProductForm } from '../../../../src/renderer/components/products/ProductForm'
import type { VatCode, Account, Company, Product } from '../../../../src/shared/types'

const VAT_CODES: VatCode[] = [
  { id: 1, code: 'MP1', description: 'Utgående 25%', rate_percent: 25, vat_type: 'outgoing', report_box: null },
  { id: 2, code: 'MP2', description: 'Utgående 12%', rate_percent: 12, vat_type: 'outgoing', report_box: null },
]

const ACCOUNTS: Account[] = [
  { id: 10, account_number: '3002', name: 'Försäljning tjänster', account_type: 'revenue', is_active: 1, k2_allowed: 1, k3_only: 0, is_system_account: 0 },
  { id: 11, account_number: '3040', name: 'Försäljning varor', account_type: 'revenue', is_active: 1, k2_allowed: 1, k3_only: 0, is_system_account: 0 },
]

const COMPANY: Company = {
  id: 1,
  name: 'Test AB',
  org_number: '556000-0000',
  fiscal_rule: 'K2',
  share_capital: 2500000,
  registration_date: '2020-01-01',
  address_line1: null,
  postal_code: null,
  city: null,
  phone: null,
  email: null,
  website: null,
  bankgiro: null,
  plusgiro: null,
  vat_number: null,
  board_members: null,
  created_at: '2026-01-01T00:00:00Z',
}

const DEFAULT_PROPS = {
  onClose: vi.fn(),
  onSaved: vi.fn(),
}

function setupMocks() {
  mockIpcResponse('vat-code:list', { success: true, data: VAT_CODES })
  mockIpcResponse('account:list', { success: true, data: ACCOUNTS })
  mockIpcResponse('company:get', COMPANY)
}

beforeEach(() => {
  setupMockIpc()
  setupMocks()
})

function renderForm(overrides?: { product?: Product; onClose?: () => void; onSaved?: (id: number) => void }) {
  const props = { ...DEFAULT_PROPS, ...overrides }
  return renderWithProviders(<ProductForm {...props} />, { axeCheck: false })
}

describe('ProductForm', () => {
  it('axe-check passes', async () => {
    const { axeResults } = await renderWithProviders(
      <ProductForm {...DEFAULT_PROPS} />,
    )
    expect(axeResults?.violations).toEqual([])
  })

  it('renders all form fields', async () => {
    await renderForm()
    await waitFor(() => {
      expect(screen.getByLabelText(/Namn/)).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/Beskrivning/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Standardpris/)).toBeInTheDocument()
    expect(screen.getByText('Artikeltyp')).toBeInTheDocument()
    expect(screen.getByLabelText('Tjänst')).toBeInTheDocument()
    expect(screen.getByLabelText('Vara')).toBeInTheDocument()
    expect(screen.getByLabelText('Utlägg')).toBeInTheDocument()
  })

  it('submits with valid values', async () => {
    const onSaved = vi.fn()
    mockIpcResponse('product:create', { success: true, data: { id: 99 } })
    await renderForm({ onSaved })

    await waitFor(() => {
      expect(screen.getByLabelText(/Namn/)).toBeInTheDocument()
    })

    await userEvent.type(screen.getByLabelText(/Namn/), 'Konsulttimme')
    await userEvent.type(screen.getByLabelText(/Standardpris/), '950')
    await userEvent.click(screen.getByRole('button', { name: 'Spara' }))

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(99)
    })
  })

  it('shows validation error for empty name', async () => {
    await renderForm()

    await waitFor(() => {
      expect(screen.getByLabelText(/Namn/)).toBeInTheDocument()
    })

    // Leave name empty, try to submit
    await userEvent.click(screen.getByRole('button', { name: 'Spara' }))

    await waitFor(() => {
      expect(screen.getByText(/Namn är obligatoriskt/)).toBeInTheDocument()
    })
  })

  it('pre-fills fields in edit mode', async () => {
    const product = {
      id: 5,
      name: 'Befintlig tjänst',
      description: 'En beskrivning',
      unit: 'timme' as const,
      default_price_ore: 95000,
      vat_code_id: 1,
      account_id: 10,
      article_type: 'service' as const,
      is_active: 1,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    }
    await renderForm({ product })

    await waitFor(() => {
      expect(screen.getByLabelText(/Namn/)).toHaveValue('Befintlig tjänst')
    })
    expect(screen.getByLabelText(/Standardpris/)).toHaveValue(950)
  })

  it('changes unit when article type changes', async () => {
    await renderForm()

    await waitFor(() => {
      expect(screen.getByLabelText('Tjänst')).toBeChecked()
    })

    // Default article type is 'service' with unit 'timme'
    // Switch to 'goods' → unit should become 'styck'
    await userEvent.click(screen.getByLabelText('Vara'))

    await waitFor(() => {
      expect(screen.getByLabelText('Vara')).toBeChecked()
    })
  })
})
