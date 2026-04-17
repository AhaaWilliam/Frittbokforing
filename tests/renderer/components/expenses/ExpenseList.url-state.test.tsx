// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ExpenseList } from '../../../../src/renderer/components/expenses/ExpenseList'

const EXPENSE_ITEMS = [
  {
    id: 1,
    expense_date: '2026-03-15',
    due_date: '2026-04-14',
    counterparty_name: 'Leverantör Alpha',
    description: 'Kontorsmaterial',
    supplier_invoice_number: 'INV-001',
    total_amount_ore: 12500,
    paid_amount_ore: 5000,
    status: 'partial',
    verification_number: 1,
    verification_series: 'B',
    expense_type: 'normal',
    has_credit_note: 0,
  },
]

const COUNTS = {
  total: 1,
  draft: 0,
  unpaid: 0,
  partial: 1,
  paid: 0,
  overdue: 0,
}

beforeEach(() => {
  setupMockIpc()
  vi.setSystemTime(new Date('2026-06-15T10:00:00'))
  mockIpcResponse('expense:list', {
    success: true,
    data: { expenses: EXPENSE_ITEMS, counts: COUNTS },
  })
})

describe('ExpenseList URL-state (T2.a)', () => {
  it('URL-init ?expenses_status=partial → "Delbetald"-knapp är aktiv', async () => {
    await renderWithProviders(<ExpenseList onNavigate={vi.fn()} />, {
      initialRoute: '/expenses?expenses_status=partial',
      axeCheck: false, // M133 exempt — dedicated axe test in ExpenseList.test.tsx
    })
    const button = await screen.findByRole('button', { name: /^delbetald/i })
    await waitFor(() => {
      expect(button.className).toContain('bg-primary')
    })
  })

  it('ogiltigt URL-värde strippas, default visas', async () => {
    await renderWithProviders(<ExpenseList onNavigate={vi.fn()} />, {
      initialRoute: '/expenses?expenses_status=xyz',
      axeCheck: false, // M133 exempt — dedicated axe test in ExpenseList.test.tsx
    })
    await waitFor(() => {
      expect(window.location.hash).not.toContain('expenses_status')
    })
    const alla = await screen.findByRole('button', { name: /^alla/i })
    expect(alla.className).toContain('bg-primary')
  })

  it('klick på "Alla" tar bort expenses_status från URL', async () => {
    await renderWithProviders(<ExpenseList onNavigate={vi.fn()} />, {
      initialRoute: '/expenses?expenses_status=partial',
      axeCheck: false, // M133 exempt — dedicated axe test in ExpenseList.test.tsx
    })
    const alla = await screen.findByRole('button', { name: /^alla/i })
    await userEvent.click(alla)
    await waitFor(() => {
      expect(window.location.hash).not.toContain('expenses_status')
    })
  })

  it('URL-init ?expenses_status=partial&expenses_page=3 triggar INTE page-reset', async () => {
    await renderWithProviders(<ExpenseList onNavigate={vi.fn()} />, {
      initialRoute: '/expenses?expenses_status=partial&expenses_page=3',
      axeCheck: false, // M133 exempt — dedicated axe test in ExpenseList.test.tsx
    })
    await waitFor(() => {
      expect(screen.getByText('Leverantör Alpha')).toBeDefined()
    })
    expect(window.location.hash).toContain('expenses_page=3')
    expect(window.location.hash).toContain('expenses_status=partial')
  })
})
