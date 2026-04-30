// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InvoiceListRow } from '../../../../src/renderer/components/invoices/InvoiceListRow'
import type { InvoiceListItem } from '../../../../src/shared/types'

function makeItem(overrides?: Partial<InvoiceListItem>): InvoiceListItem {
  return {
    id: 1,
    invoice_number: '2026-0001',
    invoice_date: '2026-04-01',
    due_date: '2026-04-30',
    counterparty_name: 'Acme AB',
    counterparty_id: 1,
    net_amount_ore: 100000,
    vat_amount_ore: 25000,
    total_amount_ore: 125000,
    paid_amount: 0,
    status: 'unpaid',
    invoice_type: 'invoice',
    verification_number: 5,
    has_credit_note: 0,
    credits_invoice_id: null,
    ...overrides,
  } as InvoiceListItem
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
  onGeneratePdf: () => {},
}

function renderRow(item: InvoiceListItem, overrides = {}) {
  return render(
    <table>
      <tbody>
        <InvoiceListRow item={item} {...noopProps} {...overrides} />
      </tbody>
    </table>,
  )
}

describe('InvoiceListRow', () => {
  it('rendrar verifikationsnummer med A-prefix', () => {
    renderRow(makeItem({ verification_number: 42 }))
    expect(screen.getByText('A42')).toBeInTheDocument()
  })

  it('saknar verifikationsnummer → em-dash', () => {
    renderRow(makeItem({ status: 'draft', verification_number: null }))
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('status="overdue" sätter text-status-overdue på due-cell', () => {
    const { container } = renderRow(makeItem({ status: 'overdue' }))
    const overdueCell = container.querySelector('.text-status-overdue')
    expect(overdueCell).not.toBeNull()
    expect(overdueCell).toHaveTextContent('2026-04-30')
  })

  it('draft-status visar bara "Bokför"-knapp', () => {
    renderRow(makeItem({ status: 'draft' }))
    expect(screen.getByRole('button', { name: /Bokför/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Betala/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Kreditera/ })).not.toBeInTheDocument()
  })

  it('unpaid visar Betala + Kreditera men inte Bokför', () => {
    renderRow(makeItem({ status: 'unpaid' }))
    expect(screen.getByRole('button', { name: /Betala/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Kreditera/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Bokför/ })).not.toBeInTheDocument()
  })

  it('paid döljer Betala men visar Kreditera + PDF', () => {
    renderRow(makeItem({ status: 'paid' }))
    expect(screen.queryByRole('button', { name: /Betala/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Kreditera/ })).toBeInTheDocument()
  })

  it('credit_note döljer Betala och Kreditera (M138)', () => {
    renderRow(makeItem({ invoice_type: 'credit_note' }))
    expect(screen.queryByRole('button', { name: /Betala/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Kreditera/ })).not.toBeInTheDocument()
    // Pill "Kredit" bredvid invoice-numret
    expect(screen.getByText('Kredit')).toBeInTheDocument()
  })

  it('has_credit_note=1 visar "Krediterad"-pill och döljer Kreditera', () => {
    renderRow(makeItem({ has_credit_note: 1 as 0 | 1 }))
    expect(screen.getByText('Krediterad')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Kreditera/ })).not.toBeInTheDocument()
  })

  it('row-click anropar onRowClick', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    const item = makeItem()
    renderRow(item, { onRowClick })
    await user.click(screen.getByText('Acme AB'))
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

  it('checkbox-toggle anropar onToggleSelect utan att trigga row-click', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    const onRowClick = vi.fn()
    const item = makeItem({ id: 7 })
    renderRow(item, { onToggleSelect: onToggle, onRowClick })
    await user.click(screen.getByRole('checkbox'))
    expect(onToggle).toHaveBeenCalledWith(7)
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('isSelectable=false döljer checkbox', () => {
    renderRow(makeItem(), { isSelectable: false })
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
