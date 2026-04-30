import { useState } from 'react'
import { useCounterparty, useDeactivateCounterparty } from '../../lib/hooks'
import { LoadingSpinner } from '../ui/LoadingSpinner'

interface CustomerDetailProps {
  id: number
  onEdit: () => void
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div className="grid grid-cols-3 gap-2 border-b px-1 py-2.5 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-sm">{value || '—'}</dd>
    </div>
  )
}

function typeLabel(type: string): string {
  switch (type) {
    case 'customer':
      return 'Kund'
    case 'supplier':
      return 'Leverantör'
    case 'both':
      return 'Kund & Leverantör'
    default:
      return type
  }
}

export function CustomerDetail({ id, onEdit }: CustomerDetailProps) {
  const { data: counterparty, isLoading } = useCounterparty(id)
  const deactivate = useDeactivateCounterparty()
  const [showConfirm, setShowConfirm] = useState(false)

  if (isLoading) {
    return <LoadingSpinner />
  }

  if (!counterparty) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Kunden hittades inte
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-medium">{counterparty.name}</h2>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Redigera
        </button>
      </div>

      <dl>
        <DetailRow label="Typ" value={typeLabel(counterparty.type)} />
        <DetailRow label="Org.nummer" value={counterparty.org_number} />
        <DetailRow label="VAT-nummer" value={counterparty.vat_number} />
        <DetailRow label="Adress" value={counterparty.address_line1} />
        <DetailRow label="Postnummer" value={counterparty.postal_code} />
        <DetailRow label="Stad" value={counterparty.city} />
        <DetailRow label="Land" value={counterparty.country} />
        <DetailRow label="Kontaktperson" value={counterparty.contact_person} />
        <DetailRow label="E-post" value={counterparty.email} />
        <DetailRow label="Telefon" value={counterparty.phone} />
        <DetailRow
          label="Betalningsvillkor"
          value={`${counterparty.default_payment_terms} dagar`}
        />
        <DetailRow
          label="Skapad"
          value={new Date(counterparty.created_at).toLocaleDateString('sv-SE')}
        />
      </dl>

      <div className="mt-8 border-t pt-6">
        {!showConfirm ? (
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Inaktivera
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Vill du verkligen inaktivera denna kund?
            </span>
            <button
              type="button"
              onClick={() => {
                deactivate.mutate({ id: counterparty.id })
                setShowConfirm(false)
              }}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Ja, inaktivera
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Avbryt
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
