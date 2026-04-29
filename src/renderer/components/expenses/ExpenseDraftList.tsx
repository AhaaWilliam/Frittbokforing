import type { ExpenseDraftListItem } from '../../../shared/types'
import { useExpenseDrafts } from '../../lib/hooks'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { formatKr } from '../../lib/format'
import { Pill } from '../ui/Pill'

interface ExpenseDraftListProps {
  onSelect: (id: number) => void
}

export function ExpenseDraftList({ onSelect }: ExpenseDraftListProps) {
  const { activeFiscalYear } = useFiscalYearContext()
  const { data: drafts, isLoading } = useExpenseDrafts(activeFiscalYear?.id)

  if (isLoading) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        Laddar...
      </div>
    )
  }

  if (!drafts || drafts.length === 0) {
    return (
      <div className="px-8 py-16 text-center text-sm text-muted-foreground">
        Inga utkast. Klicka &lsquo;Ny kostnad&rsquo; f&ouml;r att registrera en
        leverant&ouml;rsfaktura.
      </div>
    )
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-medium text-muted-foreground">
            <th className="px-8 py-3">Datum</th>
            <th className="px-4 py-3">Leverant&ouml;r</th>
            <th className="px-4 py-3">Beskrivning</th>
            <th className="px-4 py-3 text-right">Belopp</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {drafts.map((expense: ExpenseDraftListItem) => (
            <tr
              key={expense.id}
              onClick={() => onSelect(expense.id)}
              className="cursor-pointer border-b transition-colors hover:bg-muted/50"
            >
              <td className="px-8 py-3">{expense.expense_date}</td>
              <td className="px-4 py-3">{expense.counterparty_name}</td>
              <td className="px-4 py-3">{expense.description}</td>
              <td className="px-4 py-3 text-right">
                {formatKr(expense.total_amount_ore)}
              </td>
              <td className="px-4 py-3">
                <Pill variant="warning">Utkast</Pill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
