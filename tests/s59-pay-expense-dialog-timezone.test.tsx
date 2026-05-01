// @vitest-environment jsdom
// Force Stockholm timezone so the test proves the bug regardless of host TZ
process.env.TZ = 'Europe/Stockholm'

import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock react-query hook before importing component
vi.mock('../src/renderer/lib/hooks', () => ({
  usePayExpense: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}))

import { PayExpenseDialog } from '../src/renderer/components/expenses/PayExpenseDialog'

describe('S59 F9 — timezone regression: PayExpenseDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // 2026-04-12T22:30:00Z = 2026-04-13T00:30:00 CEST (Stockholm)
    vi.setSystemTime(new Date('2026-04-12T22:30:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const expense = {
    id: 1,
    fiscal_year_id: 1,
    counterparty_id: 1,
    counterparty_name: 'Test',
    expense_type: 'normal',
    credits_expense_id: null,
    supplier_invoice_number: null,
    expense_date: '2026-04-01',
    due_date: '2026-04-30',
    description: 'Test',
    total_amount_ore: 10000,
    status: 'unpaid' as const,
    payment_terms: 30,
    journal_entry_id: 1,
    paid_amount_ore: 0,
    notes: '',
    receipt_path: null,
    created_at: '2026-04-01',
    updated_at: '2026-04-01',
    total_paid: 0,
    remaining: 10000,
    lines: [],
  }

  it('initial paymentDate uses local date, not UTC', () => {
    render(
      <PayExpenseDialog
        expense={expense}
        open={true}
        onClose={vi.fn()}
      />,
    )
    const dateInput = screen.getByDisplayValue('2026-04-13') as HTMLInputElement
    expect(dateInput.value).toBe('2026-04-13')
  })
})
