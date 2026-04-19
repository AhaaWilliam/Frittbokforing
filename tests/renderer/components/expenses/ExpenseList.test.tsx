// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ExpenseList } from '../../../../src/renderer/components/expenses/ExpenseList'

const EXPENSE_ITEMS = [
  {
    id: 1, expense_date: '2026-03-15', due_date: '2026-04-14',
    counterparty_name: 'Leverantör Alpha', description: 'Kontorsmaterial',
    supplier_invoice_number: 'INV-001',
    total_amount_ore: 12500, total_paid: 0, remaining: 12500, status: 'unpaid',
    verification_number: 1, verification_series: 'B', journal_entry_id: 100,
    expense_type: 'normal', has_credit_note: 0, credits_expense_id: null,
  },
  {
    id: 2, expense_date: '2026-03-20', due_date: '2026-04-19',
    counterparty_name: 'Leverantör Beta', description: 'Programvara',
    supplier_invoice_number: 'INV-002',
    total_amount_ore: 25000, total_paid: 25000, remaining: 0, status: 'paid',
    verification_number: 2, verification_series: 'B', journal_entry_id: 101,
    expense_type: 'normal', has_credit_note: 0, credits_expense_id: null,
  },
  {
    id: 3, expense_date: '2026-03-25', due_date: '2026-04-24',
    counterparty_name: 'Leverantör Gamma', description: 'Utkast-kostnad',
    supplier_invoice_number: null,
    total_amount_ore: 6250, total_paid: 0, remaining: 6250, status: 'draft',
    verification_number: null, verification_series: null, journal_entry_id: null,
    expense_type: 'normal', has_credit_note: 0, credits_expense_id: null,
  },
]

const COUNTS = { total: 3, draft: 1, unpaid: 1, partial: 0, paid: 1, overdue: 0 }

function renderList(onNavigate = vi.fn()) {
  mockIpcResponse('expense:list', {
    success: true,
    data: { expenses: EXPENSE_ITEMS, counts: COUNTS, total_items: EXPENSE_ITEMS.length },
  })
  return renderWithProviders(<ExpenseList onNavigate={onNavigate} />, { axeCheck: false }) // M133 exempt — dedicated axe test below
}

beforeEach(() => {
  setupMockIpc()
  vi.setSystemTime(new Date('2026-06-15T10:00:00'))
})

describe('ExpenseList', () => {
  it('axe-check passes', async () => {
    mockIpcResponse('expense:list', {
      success: true,
      data: { expenses: EXPENSE_ITEMS, counts: COUNTS, total_items: EXPENSE_ITEMS.length },
    })
    const { axeResults } = await renderWithProviders(<ExpenseList onNavigate={vi.fn()} />)
    expect(axeResults?.violations).toEqual([])
  })

  it('renders expense rows', async () => {
    await renderList()
    await waitFor(() => {
      expect(screen.getByText('Leverantör Alpha')).toBeDefined()
      expect(screen.getByText('Leverantör Beta')).toBeDefined()
    })
  })

  it('shows supplier invoice number', async () => {
    await renderList()
    await waitFor(() => {
      expect(screen.getByText('INV-001')).toBeDefined()
    })
  })

  it('shows status filter tabs', async () => {
    await renderList()
    await waitFor(() => {
      expect(screen.getByText(/alla/i)).toBeDefined()
    })
  })

  it('empty state when no expenses', async () => {
    mockIpcResponse('expense:list', {
      success: true,
      data: { expenses: [], counts: { total: 0, draft: 0, unpaid: 0, partial: 0, paid: 0, overdue: 0 }, total_items: 0 },
    })
    await renderWithProviders(<ExpenseList onNavigate={vi.fn()} />, { axeCheck: false }) // M133 exempt
    await waitFor(() => {
      expect(screen.getByText(/inga kostnader/i)).toBeDefined()
    })
  })

  it('row click navigates to view for finalized expense', async () => {
    const onNavigate = vi.fn()
    await renderList(onNavigate)
    await waitFor(() => {
      expect(screen.getByText('Leverantör Alpha')).toBeDefined()
    })
    await userEvent.click(screen.getByText('Leverantör Alpha'))
    expect(onNavigate).toHaveBeenCalledWith({ view: 1 })
  })

  it('row click navigates to edit for draft expense', async () => {
    const onNavigate = vi.fn()
    await renderList(onNavigate)
    await waitFor(() => {
      expect(screen.getByText('Leverantör Gamma')).toBeDefined()
    })
    await userEvent.click(screen.getByText('Leverantör Gamma'))
    expect(onNavigate).toHaveBeenCalledWith({ edit: 3 })
  })
})
