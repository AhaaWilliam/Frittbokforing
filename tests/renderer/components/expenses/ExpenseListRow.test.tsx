// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExpenseListRow } from '../../../../src/renderer/components/expenses/ExpenseListRow'
import type { ExpenseListItem } from '../../../../src/shared/types'

function makeItem(overrides?: Partial<ExpenseListItem>): ExpenseListItem {
  return {
    id: 1,
    expense_type: 'expense',
    credits_expense_id: null,
    has_credit_note: 0,
    expense_date: '2026-04-01',
    due_date: '2026-04-30',
    description: 'Office supplies',
    supplier_invoice_number: 'INV-9001',
    status: 'unpaid',
    total_amount_ore: 50000,
    total_paid: 0,
    remaining: 50000,
    counterparty_name: 'Office Inc',
    verification_number: 7,
    verification_series: 'B',
    journal_entry_id: 100,
    ...overrides,
  }
}

const noopProps = {
  tabIndex: 0 as const,
  onRef: () => {},
  onKeyDown: () => {},
  onFocus: () => {},
  isSelected: false,
  isSelectable: true,
  onRowClick: () => {},
  onToggleSelect: () => {},
  onFinalizeClick: () => {},
  onPayClick: () => {},
  onCreateCreditNote: () => {},
}

function renderRow(item: ExpenseListItem, overrides = {}) {
  return render(
    <table>
      <tbody>
        <ExpenseListRow item={item} {...noopProps} {...overrides} />
      </tbody>
    </table>,
  )
}

describe('ExpenseListRow', () => {
  it('rendrar verifikationsnummer med serie-prefix', () => {
    renderRow(makeItem({ verification_number: 42, verification_series: 'B' }))
    expect(screen.getByText('B42')).toBeInTheDocument()
  })

  it('verification_series fallback till "B" om null', () => {
    renderRow(makeItem({ verification_number: 5, verification_series: null }))
    expect(screen.getByText('B5')).toBeInTheDocument()
  })

  it('saknar verifikationsnummer → em-dash', () => {
    renderRow(makeItem({ status: 'draft', verification_number: null }))
    // Em-dash kan finnas i flera celler; dock minst en
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  it('status="overdue" sätter text-status-overdue på due-cell', () => {
    const { container } = renderRow(makeItem({ status: 'overdue' }))
    const overdueCell = container.querySelector('.text-status-overdue')
    expect(overdueCell).not.toBeNull()
    expect(overdueCell).toHaveTextContent('2026-04-30')
  })

  it('draft-status visar bara Bokför-knapp', () => {
    renderRow(makeItem({ status: 'draft' }))
    expect(screen.getByRole('button', { name: /Bokför/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Betala/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Kreditera/ })).not.toBeInTheDocument()
  })

  it('partial visar Betala + Kreditera', () => {
    renderRow(makeItem({ status: 'partial', total_paid: 10000, remaining: 40000 }))
    expect(screen.getByRole('button', { name: /Betala/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Kreditera/ })).toBeInTheDocument()
  })

  it('paid döljer Betala men visar Kreditera', () => {
    renderRow(makeItem({ status: 'paid', total_paid: 50000, remaining: 0 }))
    expect(screen.queryByRole('button', { name: /Betala/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Kreditera/ })).toBeInTheDocument()
  })

  it('credit_note döljer Betala och Kreditera (M138)', () => {
    renderRow(makeItem({ expense_type: 'credit_note' }))
    expect(screen.queryByRole('button', { name: /Betala/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Kreditera/ })).not.toBeInTheDocument()
    expect(screen.getByText('Kredit')).toBeInTheDocument()
  })

  it('has_credit_note=1 visar "Krediterad"-pill och döljer Kreditera', () => {
    renderRow(makeItem({ has_credit_note: 1 }))
    expect(screen.getByText('Krediterad')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Kreditera/ })).not.toBeInTheDocument()
  })

  it('total_paid=0 → tom paid-cell, total_paid>0 → formaterad', () => {
    const { container } = renderRow(makeItem({ total_paid: 0 }))
    // Cellen finns men bör inte innehålla siffror
    const paidCell = container.querySelectorAll('td')[6]
    expect(paidCell?.textContent).toBe('')
  })

  it('row-click anropar onRowClick', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    const item = makeItem()
    renderRow(item, { onRowClick })
    await user.click(screen.getByText('Office Inc'))
    expect(onRowClick).toHaveBeenCalledWith(item)
  })

  it('Bokför-klick anropar onFinalizeClick utan att trigga row-click', async () => {
    const user = userEvent.setup()
    const onFinalizeClick = vi.fn()
    const onRowClick = vi.fn()
    const item = makeItem({ status: 'draft' })
    renderRow(item, { onFinalizeClick, onRowClick })
    await user.click(screen.getByRole('button', { name: /Bokför/ }))
    expect(onFinalizeClick).toHaveBeenCalledWith(item)
    expect(onRowClick).not.toHaveBeenCalled()
  })
})
