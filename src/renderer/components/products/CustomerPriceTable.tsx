import { useState } from 'react'
import type { CustomerPrice } from '../../../shared/types'
import { formatKr, unitLabel, toOre } from '../../lib/format'
import { parseDecimal } from '../../../shared/money'
import {
  useSetCustomerPrice,
  useRemoveCustomerPrice,
  useCounterparties,
} from '../../lib/hooks'

interface CustomerPriceTableProps {
  productId: number
  customerPrices: CustomerPrice[]
  unit: string
}

export function CustomerPriceTable({
  productId,
  customerPrices,
  unit,
}: CustomerPriceTableProps) {
  const setPrice = useSetCustomerPrice(productId)
  const removePrice = useRemoveCustomerPrice(productId)

  const [isAdding, setIsAdding] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCounterpartyId, setSelectedCounterpartyId] = useState<
    number | null
  >(null)
  const [priceKr, setPriceKr] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: counterparties } = useCounterparties({
    search: customerSearch,
    active_only: true,
  })

  function handleSave() {
    setError(null)

    if (!selectedCounterpartyId) {
      setError('V\u00e4lj en kund')
      return
    }

    const parsed = parseDecimal(priceKr)
    if (isNaN(parsed) || parsed < 0) {
      setError('Ange ett giltigt pris')
      return
    }

    setPrice.mutate(
      {
        product_id: productId,
        counterparty_id: selectedCounterpartyId,
        price_ore: toOre(parsed),
      },
      {
        onSuccess: () => {
          setIsAdding(false)
          setCustomerSearch('')
          setSelectedCounterpartyId(null)
          setPriceKr('')
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Okänt fel')
        },
      },
    )
  }

  function handleCancel() {
    setIsAdding(false)
    setCustomerSearch('')
    setSelectedCounterpartyId(null)
    setPriceKr('')
    setError(null)
  }

  const inputClass =
    'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium">Kundpriser</h3>

      {customerPrices.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="pb-2 font-medium text-muted-foreground">Kund</th>
              <th className="pb-2 font-medium text-muted-foreground">Pris</th>
              <th className="pb-2 font-medium text-muted-foreground">
                \u00c5tg\u00e4rd
              </th>
            </tr>
          </thead>
          <tbody>
            {customerPrices.map((cp) => (
              <tr key={cp.counterparty_id} className="border-b last:border-b-0">
                <td className="py-2">{cp.counterparty_name}</td>
                <td className="py-2">
                  {formatKr(cp.price_ore)}/{unitLabel(unit)}
                </td>
                <td className="py-2">
                  <button
                    type="button"
                    onClick={() =>
                      removePrice.mutate({
                        product_id: productId,
                        counterparty_id: cp.counterparty_id,
                      })
                    }
                    className="text-red-600 hover:text-red-700"
                  >
                    &times;
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">
          Inga kundspecifika priser
        </p>
      )}

      {!isAdding ? (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="mt-3 text-sm font-medium text-primary hover:underline"
        >
          + L&auml;gg till kundpris
        </button>
      ) : (
        <div className="mt-3 space-y-3 rounded-md border p-4">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="customer-price-customer"
              className="mb-1 block text-sm font-medium"
            >
              Kund
            </label>
            <input
              id="customer-price-customer"
              type="text"
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value)
                setSelectedCounterpartyId(null)
              }}
              placeholder="S\u00f6k kund..."
              className={inputClass}
            />
            {customerSearch &&
              counterparties &&
              counterparties.length > 0 &&
              !selectedCounterpartyId && (
                <ul className="mt-1 max-h-32 overflow-auto rounded-md border bg-background">
                  {counterparties.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCounterpartyId(c.id)
                          setCustomerSearch(c.name)
                        }}
                        className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        {c.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </div>

          <div>
            <label
              htmlFor="customer-price-amount"
              className="mb-1 block text-sm font-medium"
            >
              Pris (kr)
            </label>
            <input
              id="customer-price-amount"
              type="number"
              min="0"
              step="0.01"
              value={priceKr}
              onChange={(e) => setPriceKr(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={setPrice.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {setPrice.isPending ? 'Sparar...' : 'Spara'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
