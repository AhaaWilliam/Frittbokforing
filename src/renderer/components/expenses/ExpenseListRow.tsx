import { memo, useMemo } from 'react'
import { CheckCircle, CreditCard } from 'lucide-react'
import type { ExpenseListItem } from '../../../shared/types'
import { formatKr } from '../../lib/format'
import { consumeFlashable } from '../../lib/flashable'
import { Pill, type PillVariant } from '../ui/Pill'

// Sprint 13b — Pill-migration. Speglar InvoiceListRow.
const STATUS_PILL: Record<string, { variant: PillVariant; label: string }> = {
  draft: { variant: 'neutral', label: 'Utkast' },
  unpaid: { variant: 'warning', label: 'Obetald' },
  partial: { variant: 'info', label: 'Delbetald' },
  paid: { variant: 'success', label: 'Betald' },
  overdue: { variant: 'danger', label: 'Förfallen' },
}

interface ExpenseListRowProps {
  item: ExpenseListItem
  tabIndex: 0 | -1
  onRef: (el: HTMLElement | null) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onFocus: () => void
  isSelected: boolean
  isSelectable: boolean
  onRowClick: (item: ExpenseListItem) => void
  onToggleSelect: (id: number) => void
  onFinalizeClick: (item: ExpenseListItem) => void
  onPayClick: (item: ExpenseListItem) => void
  onCreateCreditNote: (item: ExpenseListItem) => void
}

export const ExpenseListRow = memo(function ExpenseListRow({
  item,
  tabIndex,
  onRef,
  onKeyDown,
  onFocus,
  isSelected,
  isSelectable,
  onRowClick,
  onToggleSelect,
  onFinalizeClick,
  onPayClick,
  onCreateCreditNote,
}: ExpenseListRowProps) {
  const pill = STATUS_PILL[item.status] ?? STATUS_PILL.draft
  // VS-46: flash om denna expense just bokfördes (se VS-45 för detaljer).
  const flash = useMemo(() => consumeFlashable('expense', item.id), [item.id])
  return (
    <tr
      ref={onRef}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onClick={() => onRowClick(item)}
      className={`cursor-pointer border-b transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring${flash ? ' fritt-flash' : ''}`}
    >
      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
        {isSelectable ? (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(item.id)}
            className="h-4 w-4 rounded border-[var(--border-default)]"
          />
        ) : (
          <span className="inline-block h-4 w-4" />
        )}
      </td>
      <td className="px-4 py-3 font-mono">{item.expense_date}</td>
      <td className="px-4 py-3">{item.counterparty_name}</td>
      <td className="max-w-[200px] truncate px-4 py-3">
        {item.description}
        {item.expense_type === 'credit_note' && (
          <span className="ml-1.5">
            <Pill variant="brand" size="sm">
              Kredit
            </Pill>
          </span>
        )}
        {!!item.has_credit_note && item.expense_type !== 'credit_note' && (
          <span className="ml-1.5">
            <Pill variant="neutral" size="sm">
              Krediterad
            </Pill>
          </span>
        )}
      </td>
      <td className="px-4 py-3 font-mono">
        {item.supplier_invoice_number || '\u2014'}
      </td>
      <td className="px-4 py-3 text-right font-mono font-medium">
        {formatKr(item.total_amount_ore)}
      </td>
      <td className="px-4 py-3 text-right font-mono">
        {item.total_paid > 0 ? formatKr(item.total_paid) : ''}
      </td>
      <td className="px-4 py-3 text-right font-mono">
        {formatKr(item.remaining)}
      </td>
      <td className="px-4 py-3">
        <Pill variant={pill.variant} withDot>
          {pill.label}
        </Pill>
      </td>
      <td
        className={`px-4 py-3 font-mono ${item.status === 'overdue' ? 'text-status-overdue' : ''}`}
      >
        {item.due_date || '\u2014'}
      </td>
      <td className="px-4 py-3 font-mono">
        {item.verification_number
          ? `${item.verification_series ?? 'B'}${item.verification_number}`
          : '\u2014'}
      </td>
      <td className="px-4 py-3">
        <div
          role="presentation"
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {item.status === 'draft' && (
            <button
              type="button"
              onClick={() => onFinalizeClick(item)}
              title="Bokför"
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <CheckCircle className="h-3 w-3" />
              Bokför
            </button>
          )}
          {item.status !== 'draft' &&
            item.status !== 'paid' &&
            item.expense_type !== 'credit_note' && (
              <button
                type="button"
                onClick={() => onPayClick(item)}
                title="Registrera betalning"
                className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs font-medium hover:bg-muted"
              >
                <CreditCard className="h-3 w-3" />
                Betala
              </button>
            )}
          {item.status !== 'draft' &&
            item.expense_type !== 'credit_note' &&
            !item.has_credit_note && (
              <button
                type="button"
                onClick={() => onCreateCreditNote(item)}
                title="Skapa kreditnota"
                className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs font-medium hover:bg-muted"
              >
                Kreditera
              </button>
            )}
        </div>
      </td>
    </tr>
  )
})
