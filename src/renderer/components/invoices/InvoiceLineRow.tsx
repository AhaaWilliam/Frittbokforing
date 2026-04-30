import { memo } from 'react'
import type { InvoiceLineForm } from '../../lib/form-schemas/invoice'
import { formatKr } from '../../lib/format'
import { useVatCodes } from '../../lib/hooks'
import { ArticlePicker } from './ArticlePicker'
import { multiplyKrToOre, parseDecimal } from '../../../shared/money'

interface InvoiceLineRowProps {
  line: InvoiceLineForm
  index: number
  counterpartyId: number | null
  onUpdate: (index: number, updates: Partial<InvoiceLineForm>) => void
  onRemove: (index: number) => void
}

const VAT_OPTIONS: { label: string; rate: number }[] = [
  { label: '25%', rate: 0.25 },
  { label: '12%', rate: 0.12 },
  { label: '6%', rate: 0.06 },
  { label: 'Momsfritt', rate: 0 },
]

export const InvoiceLineRow = memo(function InvoiceLineRow({
  line,
  index,
  counterpartyId,
  onUpdate,
  onRemove,
}: InvoiceLineRowProps) {
  const { data: vatCodes } = useVatCodes('outgoing')

  function handleArticleSelect(product: {
    product_id: number
    description: string
    unit_price_kr: number
    vat_code_id: number
    vat_rate: number
    unit: string
  }) {
    const vc = vatCodes?.find((v) => v.id === product.vat_code_id)
    onUpdate(index, {
      product_id: product.product_id,
      account_number: null,
      description: product.description,
      unit_price_kr: product.unit_price_kr,
      vat_code_id: product.vat_code_id,
      vat_rate: vc ? vc.rate_percent / 100 : product.vat_rate,
      unit: product.unit,
    })
  }

  function handleVatChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const rate = parseFloat(e.target.value)
    const vc = vatCodes?.find(
      (v) => Math.abs(v.rate_percent / 100 - rate) < 0.001,
    )
    const updates: Partial<InvoiceLineForm> = { vat_rate: rate }
    if (vc) {
      updates.vat_code_id = vc.id
    }
    onUpdate(index, updates)
  }

  const lineNettoOre = multiplyKrToOre(line.quantity, line.unit_price_kr)

  return (
    <tr className="border-b">
      <td className="px-2 py-2">
        <div className="flex items-center gap-2">
          <ArticlePicker
            counterpartyId={counterpartyId}
            onSelect={handleArticleSelect}
            testId={`invoice-line-${index}-article`}
          />
          {line.product_id === null && (
            <input
              type="text"
              placeholder="Konto"
              aria-label="Konto"
              value={line.account_number ?? ''}
              onChange={(e) =>
                onUpdate(index, { account_number: e.target.value || null })
              }
              data-testid={`invoice-line-${index}-account`}
              className="block w-20 rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          )}
        </div>
      </td>
      <td className="px-2 py-2">
        <input
          type="text"
          aria-label="Beskrivning"
          value={line.description}
          onChange={(e) => onUpdate(index, { description: e.target.value })}
          data-testid={`invoice-line-${index}-description`}
          className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          step="0.01"
          aria-label="Antal"
          value={line.quantity}
          onChange={(e) =>
            onUpdate(index, { quantity: parseDecimal(e.target.value) || 0 })
          }
          data-testid={`invoice-line-${index}-quantity`}
          className="block w-20 rounded-md border border-input bg-background px-2 py-1.5 text-right text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </td>
      <td className="px-2 py-2">
        <input
          type="number"
          step="0.01"
          aria-label="Pris"
          value={line.unit_price_kr}
          onChange={(e) =>
            onUpdate(index, {
              unit_price_kr: parseDecimal(e.target.value) || 0,
            })
          }
          data-testid={`invoice-line-${index}-price`}
          className="block w-24 rounded-md border border-input bg-background px-2 py-1.5 text-right text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </td>
      <td className="px-2 py-2">
        <select
          aria-label="Moms"
          value={line.vat_rate}
          onChange={handleVatChange}
          data-testid={`invoice-line-${index}-vat`}
          className="block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {VAT_OPTIONS.map((opt) => (
            <option key={opt.rate} value={opt.rate}>
              {opt.label}
            </option>
          ))}
        </select>
      </td>
      <td
        className="px-2 py-2 text-right text-sm"
        data-testid={`line-net-ore-${index}`}
        data-value={lineNettoOre}
      >
        {formatKr(lineNettoOre)}
      </td>
      <td className="px-2 py-2 text-center">
        <button
          type="button"
          aria-label="Ta bort rad"
          onClick={() => onRemove(index)}
          className="rounded p-1 text-muted-foreground hover:bg-danger-100/50 hover:text-danger-500"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </td>
    </tr>
  )
})
