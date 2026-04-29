import { memo } from 'react'
import { FileDown, CheckCircle, CreditCard } from 'lucide-react'
import type { InvoiceListItem } from '../../../shared/types'
import { formatKr } from '../../lib/format'
import { Pill, type PillVariant } from '../ui/Pill'

// Sprint 13b — Pill-migration. Tidigare inline-badge med Tailwind-palett
// (bg-amber-100 etc.) bytt mot Pill med token-baserade variants.
const STATUS_PILL: Record<string, { variant: PillVariant; label: string }> = {
  draft: { variant: 'neutral', label: 'Utkast' },
  unpaid: { variant: 'warning', label: 'Obetald' },
  paid: { variant: 'success', label: 'Betald' },
  overdue: { variant: 'danger', label: 'Förfallen' },
}

interface InvoiceListRowProps {
  item: InvoiceListItem
  tabIndex: 0 | -1
  onRef: (el: HTMLElement | null) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onFocus: () => void
  isSelected: boolean
  isSelectable: boolean
  onRowClick: (item: InvoiceListItem) => void
  onToggleSelect: (id: number) => void
  onFinalizeClick: (item: InvoiceListItem) => void
  onPayClick: (item: InvoiceListItem) => void
  onCreateCreditNote: (item: InvoiceListItem) => void
  onGeneratePdf: (
    e: React.MouseEvent,
    invoiceId: number,
    invoiceNumber: string,
  ) => void
}

export const InvoiceListRow = memo(function InvoiceListRow({
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
  onGeneratePdf,
}: InvoiceListRowProps) {
  const pill = STATUS_PILL[item.status] ?? STATUS_PILL.draft
  return (
    <tr
      ref={onRef}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onClick={() => onRowClick(item)}
      className="cursor-pointer border-b transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
    >
      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
        {isSelectable ? (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(item.id)}
            className="h-4 w-4 rounded border-gray-300"
          />
        ) : (
          <span className="inline-block h-4 w-4" />
        )}
      </td>
      <td className="px-4 py-3">
        {item.invoice_number || '\u2014'}
        {item.invoice_type === 'credit_note' && (
          <span className="ml-1.5">
            <Pill variant="brand" size="sm">
              Kredit
            </Pill>
          </span>
        )}
        {!!item.has_credit_note && item.invoice_type !== 'credit_note' && (
          <span className="ml-1.5">
            <Pill variant="neutral" size="sm">
              Krediterad
            </Pill>
          </span>
        )}
      </td>
      <td className="px-4 py-3">{item.invoice_date}</td>
      <td className="px-4 py-3">{item.counterparty_name}</td>
      <td className="px-4 py-3 text-right">{formatKr(item.net_amount_ore)}</td>
      <td className="px-4 py-3 text-right">{formatKr(item.vat_amount_ore)}</td>
      <td className="px-4 py-3 text-right font-medium">
        {formatKr(item.total_amount_ore)}
      </td>
      <td className="px-4 py-3">
        <Pill variant={pill.variant}>{pill.label}</Pill>
      </td>
      <td
        className={`px-4 py-3 ${item.status === 'overdue' ? 'text-red-600' : ''}`}
      >
        {item.due_date}
      </td>
      <td className="px-4 py-3">
        {item.verification_number ? `A${item.verification_number}` : '\u2014'}
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
            item.invoice_type !== 'credit_note' && (
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
            item.invoice_type !== 'credit_note' &&
            !item.has_credit_note && (
              <button
                type="button"
                onClick={() => onCreateCreditNote(item)}
                title="Skapa kreditfaktura"
                className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs font-medium hover:bg-muted"
              >
                Kreditera
              </button>
            )}
          {item.status !== 'draft' && (
            <button
              type="button"
              onClick={(e) => onGeneratePdf(e, item.id, item.invoice_number)}
              title="Ladda ner PDF"
              className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <FileDown className="h-4 w-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
})
