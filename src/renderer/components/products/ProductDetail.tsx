import { useState } from 'react'
import { useProduct, useDeactivateProduct } from '../../lib/hooks'
import { formatKr, unitLabel } from '../../lib/format'
import { CustomerPriceTable } from './CustomerPriceTable'
import { LoadingSpinner } from '../ui/LoadingSpinner'

interface ProductDetailProps {
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
      <dd className="col-span-2 text-sm">{value || '\u2014'}</dd>
    </div>
  )
}

function articleTypeLabel(type: string): string {
  switch (type) {
    case 'service':
      return 'Tj\u00e4nst'
    case 'goods':
      return 'Vara'
    case 'expense':
      return 'Utl\u00e4gg'
    default:
      return type
  }
}

export function ProductDetail({ id, onEdit }: ProductDetailProps) {
  const { data, isLoading } = useProduct(id)
  const deactivate = useDeactivateProduct()
  const [showConfirm, setShowConfirm] = useState(false)

  if (isLoading) {
    return <LoadingSpinner />
  }

  if (!data) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Artikeln hittades inte
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-medium">{data.name}</h2>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Redigera
        </button>
      </div>

      <div className="mb-4">
        <span className="text-2xl font-semibold">
          {formatKr(data.default_price_ore)}
        </span>
        <span className="text-lg text-muted-foreground">
          /{unitLabel(data.unit)}
        </span>
      </div>

      <dl>
        <DetailRow label="Beskrivning" value={data.description} />
        <DetailRow
          label="Artikeltyp"
          value={articleTypeLabel(data.article_type)}
        />
        <DetailRow label="Enhet" value={unitLabel(data.unit)} />
        <DetailRow label="Moms" value={`Momskod ${data.vat_code_id}`} />
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
              Vill du verkligen inaktivera denna artikel?
            </span>
            <button
              type="button"
              onClick={() => {
                deactivate.mutate({ id: data.id })
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

      <div className="mt-8 border-t pt-6">
        <CustomerPriceTable
          productId={id}
          customerPrices={data.customer_prices}
          unit={data.unit}
        />
      </div>
    </div>
  )
}
