// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { setupMockIpc } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { PayExpenseDialog } from '../../../../src/renderer/components/expenses/PayExpenseDialog'
import type { ExpenseDetail } from '../../../../src/shared/types'

const EXPENSE: ExpenseDetail = {
  id: 1,
  fiscal_year_id: 1,
  counterparty_id: 1,
  expense_type: 'supplier_invoice',
  credits_expense_id: null,
  supplier_invoice_number: 'INV-001',
  expense_date: '2026-03-01',
  due_date: '2026-03-31',
  description: 'Kontorsmaterial',
  status: 'unpaid',
  payment_terms: 30,
  journal_entry_id: 10,
  total_amount_ore: 500000,
  paid_amount_ore: 100000,
  notes: '',
  created_at: '2026-03-01',
  updated_at: '2026-03-01',
  lines: [],
  counterparty_name: 'Staples AB',
  total_paid: 100000,
  remaining: 400000,
}

const DEFAULT_PROPS = {
  expense: EXPENSE,
  open: true,
  onClose: vi.fn(),
  onSuccess: vi.fn(),
}

beforeEach(() => {
  vi.setSystemTime(new Date('2026-06-15T12:00:00'))
  setupMockIpc()
})

afterEach(() => {
  vi.useRealTimers()
})

function renderDialog(overrides?: Partial<typeof DEFAULT_PROPS>) {
  const props = { ...DEFAULT_PROPS, onClose: vi.fn(), onSuccess: vi.fn(), ...overrides }
  return renderWithProviders(<PayExpenseDialog {...props} />, { axeCheck: false })
}

describe('PayExpenseDialog', () => {
  it('axe-check passes', async () => {
    const { axeResults } = await renderWithProviders(
      <PayExpenseDialog {...DEFAULT_PROPS} />,
    )
    expect(axeResults?.violations).toEqual([])
  })

  it('renders expense info and remaining amount', async () => {
    await renderDialog()
    expect(screen.getByText('Kontorsmaterial')).toBeInTheDocument()
    expect(screen.getByText('Staples AB')).toBeInTheDocument()
    // remaining = 400000 öre = 4 000 kr
    expect(screen.getByText(/4[\s\u00a0\u202f]000/)).toBeInTheDocument()
  })

  it('pre-fills amount with remaining in kr', async () => {
    await renderDialog()
    const amountInput = screen.getByLabelText(/Belopp/)
    // remaining = 400000 öre → toKr = 4000 → toFixed(2) = "4000.00"
    expect(amountInput).toHaveValue(4000)
  })
})
