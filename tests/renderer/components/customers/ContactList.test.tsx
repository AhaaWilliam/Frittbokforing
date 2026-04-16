// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ContactList } from '../../../../src/renderer/components/customers/ContactList'
import type { Counterparty } from '../../../../src/shared/types'

const CUSTOMERS: Counterparty[] = [
  {
    id: 1,
    name: 'Acme AB',
    type: 'customer',
    org_number: '556036-0793',
    vat_number: null,
    address_line1: null,
    postal_code: null,
    city: null,
    country: 'Sverige',
    contact_person: null,
    email: null,
    phone: null,
    default_payment_terms: 30,
    is_active: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    bankgiro: null,
    plusgiro: null,
    bank_account: null,
    bank_clearing: null,
  },
  {
    id: 2,
    name: 'Beta Corp',
    type: 'supplier',
    org_number: '556100-0000',
    vat_number: null,
    address_line1: null,
    postal_code: null,
    city: null,
    country: 'Sverige',
    contact_person: null,
    email: null,
    phone: null,
    default_payment_terms: 30,
    is_active: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    bankgiro: null,
    plusgiro: null,
    bank_account: null,
    bank_clearing: null,
  },
  {
    id: 3,
    name: 'Gamma HB',
    type: 'both',
    org_number: null,
    vat_number: null,
    address_line1: null,
    postal_code: null,
    city: null,
    country: 'Sverige',
    contact_person: null,
    email: null,
    phone: null,
    default_payment_terms: 30,
    is_active: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    bankgiro: null,
    plusgiro: null,
    bank_account: null,
    bank_clearing: null,
  },
]

beforeEach(() => {
  setupMockIpc()
})

function renderList(props?: Partial<React.ComponentProps<typeof ContactList>>) {
  const defaultProps = {
    type: 'customer' as const,
    selectedId: null,
    onSelect: vi.fn(),
    search: '',
  }
  mockIpcResponse('counterparty:list', { success: true, data: CUSTOMERS })
  return renderWithProviders(
    <ContactList {...defaultProps} {...props} />,
    { axeCheck: false },
  )
}

describe('ContactList', () => {
  it('renders counterparty names', async () => {
    await renderList()
    await waitFor(() => {
      expect(screen.getByText('Acme AB')).toBeInTheDocument()
    })
    expect(screen.getByText('Beta Corp')).toBeInTheDocument()
    expect(screen.getByText('Gamma HB')).toBeInTheDocument()
  })

  it('shows type badges (Kund/Leverantör/Båda)', async () => {
    await renderList()
    await waitFor(() => {
      expect(screen.getByText('Acme AB')).toBeInTheDocument()
    })
    expect(screen.getByText('Kund')).toBeInTheDocument()
    expect(screen.getByText('Leverantör')).toBeInTheDocument()
    expect(screen.getByText('Båda')).toBeInTheDocument()
  })

  it('click calls onSelect with correct id', async () => {
    const onSelect = vi.fn()
    await renderList({ onSelect })
    await waitFor(() => {
      expect(screen.getByText('Acme AB')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByText('Acme AB'))
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('empty list shows appropriate message for customers', async () => {
    mockIpcResponse('counterparty:list', { success: true, data: [] })
    await renderWithProviders(
      <ContactList
        type="customer"
        selectedId={null}
        onSelect={vi.fn()}
        search=""
      />,
      { axeCheck: false },
    )
    await waitFor(() => {
      expect(screen.getByText(/Inga kunder/)).toBeInTheDocument()
    })
  })

  it('empty list shows appropriate message for suppliers', async () => {
    mockIpcResponse('counterparty:list', { success: true, data: [] })
    await renderWithProviders(
      <ContactList
        type="supplier"
        selectedId={null}
        onSelect={vi.fn()}
        search=""
      />,
      { axeCheck: false },
    )
    await waitFor(() => {
      expect(screen.getByText(/Inga leverantörer/)).toBeInTheDocument()
    })
  })

  it('passes axe a11y check', async () => {
    mockIpcResponse('counterparty:list', { success: true, data: CUSTOMERS })
    const { axeResults } = await renderWithProviders(
      <ContactList
        type="customer"
        selectedId={null}
        onSelect={vi.fn()}
        search=""
      />,
    )
    expect(axeResults?.violations).toEqual([])
  })
})
