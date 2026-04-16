// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { DraftList } from '../../../../src/renderer/components/invoices/DraftList'

const DRAFTS = [
  {
    id: 10,
    company_id: 1,
    fiscal_year_id: 1,
    invoice_number: null,
    invoice_date: '2026-03-15',
    due_date: '2026-04-15',
    status: 'draft',
    total_amount_ore: 125000,
    total_vat_ore: 25000,
    paid_amount_ore: 0,
    counterparty_id: 1,
    counterparty_name: 'Acme AB',
    invoice_type: 'standard',
    credits_invoice_id: null,
    has_credit_note: 0,
    notes: null,
    payment_terms: 30,
    journal_entry_id: null,
    verification_number: null,
    verification_series: null,
    created_at: '2026-03-15T10:00:00Z',
    updated_at: '2026-03-15T10:00:00Z',
  },
]

beforeEach(() => {
  setupMockIpc()
})

function renderList(onSelect = vi.fn()) {
  mockIpcResponse('invoice:list-drafts', { success: true, data: DRAFTS })
  return renderWithProviders(<DraftList onSelect={onSelect} />, { axeCheck: false })
}

describe('DraftList', () => {
  it('renders draft with date, customer, amount and status badge', async () => {
    await renderList()
    await waitFor(() => {
      expect(screen.getByText('Acme AB')).toBeInTheDocument()
    })
    // Amount: 125000 ore = 1 250 kr (formatted)
    expect(screen.getByText(/1\s*250/)).toBeInTheDocument()
    expect(screen.getByText('Utkast')).toBeInTheDocument()
  })

  it('click on row calls onSelect with id', async () => {
    const onSelect = vi.fn()
    await renderList(onSelect)
    await waitFor(() => {
      expect(screen.getByText('Acme AB')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByText('Acme AB'))
    expect(onSelect).toHaveBeenCalledWith(10)
  })

  it('empty list shows empty message', async () => {
    mockIpcResponse('invoice:list-drafts', { success: true, data: [] })
    await renderWithProviders(<DraftList onSelect={vi.fn()} />, { axeCheck: false })
    await waitFor(() => {
      expect(screen.getByText(/Inga utkast/)).toBeInTheDocument()
    })
  })

  it('passes axe a11y check', async () => {
    mockIpcResponse('invoice:list-drafts', { success: true, data: DRAFTS })
    const { axeResults } = await renderWithProviders(
      <DraftList onSelect={vi.fn()} />,
    )
    expect(axeResults?.violations).toEqual([])
  })
})
