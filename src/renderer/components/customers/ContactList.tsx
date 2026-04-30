import type { Counterparty } from '../../../shared/types'
import { useCounterparties } from '../../lib/hooks'
import { Pill } from '../ui/Pill'
import { LoadingSpinner } from '../ui/LoadingSpinner'

interface ContactListProps {
  type: 'customer' | 'supplier'
  selectedId: number | null
  onSelect: (id: number) => void
  search: string
}

function typeBadge(type: Counterparty['type']) {
  switch (type) {
    case 'customer':
      return <Pill variant="info">Kund</Pill>
    case 'supplier':
      return <Pill variant="warning">Leverantör</Pill>
    case 'both':
      return <Pill variant="success">Båda</Pill>
  }
}

const EMPTY_MESSAGES: Record<ContactListProps['type'], string> = {
  customer: 'Inga kunder hittade',
  supplier: 'Inga leverantörer hittade',
}

export function ContactList({
  type,
  selectedId,
  onSelect,
  search,
}: ContactListProps) {
  const { data: counterparties, isLoading } = useCounterparties({
    search,
    type,
    active_only: true,
  })

  if (isLoading) {
    return <LoadingSpinner />
  }

  if (!counterparties || counterparties.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        {EMPTY_MESSAGES[type]}
      </div>
    )
  }

  return (
    <ul className="flex flex-col">
      {counterparties.map((cp) => (
        <li key={cp.id}>
          <button
            type="button"
            onClick={() => onSelect(cp.id)}
            className={`flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
              selectedId === cp.id ? 'bg-selected' : ''
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{cp.name}</div>
              {cp.org_number && (
                <div className="truncate text-xs text-muted-foreground">
                  {cp.org_number}
                </div>
              )}
            </div>
            {typeBadge(cp.type)}
          </button>
        </li>
      ))}
    </ul>
  )
}
