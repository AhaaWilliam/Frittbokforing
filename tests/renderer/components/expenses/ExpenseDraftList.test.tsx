// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ExpenseDraftList } from '../../../../src/renderer/components/expenses/ExpenseDraftList'

const DRAFTS = [
  {
    id: 20,
    counterparty_name: 'Supplier AB',
    supplier_invoice_number: 'INV-001',
    expense_date: '2026-02-10',
    description: 'Kontorsmaterial',
    total_amount_ore: 89900,
    created_at: '2026-02-10T08:00:00Z',
  },
]

beforeEach(() => {
  setupMockIpc()
})

function renderList(onSelect = vi.fn()) {
  mockIpcResponse('expense:list-drafts', { success: true, data: DRAFTS })
  return renderWithProviders(<ExpenseDraftList onSelect={onSelect} />, { axeCheck: false })
}

describe('ExpenseDraftList', () => {
  it('renders draft with date, supplier, description and amount', async () => {
    await renderList()
    await waitFor(() => {
      expect(screen.getByText('Supplier AB')).toBeInTheDocument()
    })
    expect(screen.getByText('Kontorsmaterial')).toBeInTheDocument()
    // Amount: 89900 ore = 899 kr
    expect(screen.getByText(/899/)).toBeInTheDocument()
    expect(screen.getByText('Utkast')).toBeInTheDocument()
  })

  it('click on row calls onSelect', async () => {
    const onSelect = vi.fn()
    await renderList(onSelect)
    await waitFor(() => {
      expect(screen.getByText('Supplier AB')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByText('Supplier AB'))
    expect(onSelect).toHaveBeenCalledWith(20)
  })

  it('empty list shows empty message', async () => {
    mockIpcResponse('expense:list-drafts', { success: true, data: [] })
    await renderWithProviders(<ExpenseDraftList onSelect={vi.fn()} />, { axeCheck: false })
    await waitFor(() => {
      expect(screen.getByText(/Inga utkast/)).toBeInTheDocument()
    })
  })

  it('passes axe a11y check', async () => {
    mockIpcResponse('expense:list-drafts', { success: true, data: DRAFTS })
    const { axeResults } = await renderWithProviders(
      <ExpenseDraftList onSelect={vi.fn()} />,
    )
    expect(axeResults?.violations).toEqual([])
  })
})
