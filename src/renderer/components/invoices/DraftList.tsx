import type { Invoice } from '../../../shared/types'
import { useDraftInvoices } from '../../lib/hooks'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { formatKr } from '../../lib/format'
import { Pill } from '../ui/Pill'
import { EmptyState, InvoiceIllustration } from '../ui/EmptyState'
import { TableSkeleton } from '../ui/TableSkeleton'

interface DraftListProps {
  onSelect: (id: number) => void
}

export function DraftList({ onSelect }: DraftListProps) {
  const { activeFiscalYear } = useFiscalYearContext()
  const { data: drafts, isLoading } = useDraftInvoices(activeFiscalYear?.id)

  if (isLoading) {
    return <TableSkeleton columns={4} rows={4} ariaLabel="Laddar utkast" />
  }

  if (!drafts || drafts.length === 0) {
    return (
      <EmptyState
        icon={<InvoiceIllustration />}
        title="Inga utkast ännu"
        description="Klicka + Ny faktura för att börja registrera en kundfaktura."
      />
    )
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-medium text-muted-foreground">
            <th className="px-8 py-3">Datum</th>
            <th className="px-4 py-3">Kund</th>
            <th className="px-4 py-3 text-right">Belopp</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {drafts.map((invoice: Invoice & { counterparty_name: string }) => (
            <tr
              key={invoice.id}
              onClick={() => onSelect(invoice.id)}
              className="cursor-pointer border-b transition-colors hover:bg-muted/50"
            >
              <td className="px-8 py-3">{invoice.invoice_date}</td>
              <td className="px-4 py-3">{invoice.counterparty_name}</td>
              <td className="px-4 py-3 text-right">
                {formatKr(invoice.total_amount_ore)}
              </td>
              <td className="px-4 py-3">
                <Pill variant="warning" withDot>
                  Utkast
                </Pill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
