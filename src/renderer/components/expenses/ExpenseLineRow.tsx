import { memo } from 'react'
import type { ExpenseLineForm } from '../../lib/form-schemas/expense'
import type { Account, VatCode } from '../../../shared/types'
import { formatKr } from '../../lib/format'
import { multiplyKrToOre, parseDecimal } from '../../../shared/money'

interface ExpenseLineRowProps {
  line: ExpenseLineForm
  index: number
  expenseAccounts: Account[]
  vatCodes: VatCode[]
  onUpdate: (index: number, updates: Partial<ExpenseLineForm>) => void
  onRemove: (index: number) => void
}

const inputClass =
  'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

export const ExpenseLineRow = memo(function ExpenseLineRow({
  line,
  index,
  expenseAccounts,
  vatCodes,
  onUpdate,
  onRemove,
}: ExpenseLineRowProps) {
  const lineNetOre = multiplyKrToOre(line.quantity, line.unit_price_kr)
  const lineVatOre = Math.round(lineNetOre * line.vat_rate)

  return (
    <tr className="border-b">
      <td className="px-2 py-1">
        <input
          type="text"
          value={line.description}
          onChange={(e) => onUpdate(index, { description: e.target.value })}
          aria-label="Beskrivning"
          data-testid={`expense-line-${index}-description`}
          className={inputClass}
        />
      </td>
      <td className="px-2 py-1">
        <select
          value={line.account_number}
          onChange={(e) => onUpdate(index, { account_number: e.target.value })}
          aria-label="Konto"
          data-testid={`expense-line-${index}-account`}
          className={inputClass}
        >
          <option value="">V&auml;lj konto...</option>
          {expenseAccounts.map((a: Account) => (
            <option key={a.id} value={a.account_number}>
              {a.account_number} {a.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1">
        <input
          type="number"
          min={1}
          step={1}
          value={line.quantity}
          onChange={(e) =>
            onUpdate(index, { quantity: parseInt(e.target.value, 10) || 1 })
          }
          aria-label="Antal"
          data-testid={`expense-line-${index}-quantity`}
          className={inputClass}
        />
      </td>
      <td className="px-2 py-1">
        <input
          type="number"
          min={0}
          step={0.01}
          value={line.unit_price_kr}
          onChange={(e) =>
            onUpdate(index, {
              unit_price_kr: parseDecimal(e.target.value) || 0,
            })
          }
          aria-label="Pris"
          data-testid={`expense-line-${index}-price`}
          className={inputClass}
        />
      </td>
      <td className="px-2 py-1">
        <select
          value={line.vat_code_id}
          aria-label="Moms"
          data-testid={`expense-line-${index}-vat`}
          onChange={(e) => {
            const vcId = parseInt(e.target.value, 10)
            const vc = vatCodes.find((v) => v.id === vcId)
            onUpdate(index, {
              vat_code_id: vcId,
              ...(vc ? { vat_rate: vc.rate_percent / 100 } : {}),
            })
          }}
          className={inputClass}
        >
          <option value={0}>V&auml;lj moms...</option>
          {vatCodes.map((vc) => (
            <option key={vc.id} value={vc.id}>
              {vc.description} ({vc.rate_percent}%)
            </option>
          ))}
        </select>
      </td>
      <td
        className="px-2 py-1 text-right tabular-nums"
        data-testid={`expense-line-net-ore-${index}`}
        data-value={lineNetOre}
      >
        {formatKr(lineNetOre + lineVatOre)}
      </td>
      <td className="px-2 py-1">
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="text-muted-foreground hover:text-red-600"
          title="Ta bort rad"
        >
          &times;
        </button>
      </td>
    </tr>
  )
})
