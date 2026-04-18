import { useMemo } from 'react'
import type { ExpenseLineForm } from '../../lib/form-schemas/expense'
import { toOre, formatKr } from '../../lib/format'

interface ExpenseTotalsProps {
  lines: ExpenseLineForm[]
}

export function ExpenseTotals({ lines }: ExpenseTotalsProps) {
  const totals = useMemo(() => {
    let netOre = 0
    let vatOre = 0
    for (const line of lines) {
      // M131: heltalsaritmetik — undviker IEEE 754-precision-fel (F44)
      const lineNetOre = Math.round(
        (Math.round(line.quantity * 100) *
          Math.round(line.unit_price_kr * 100)) /
          100,
      )
      const lineVatOre = Math.round(lineNetOre * line.vat_rate)
      netOre += lineNetOre
      vatOre += lineVatOre
    }
    return { netOre, vatOre, totalOre: netOre + vatOre }
  }, [lines])

  return (
    <div className="flex justify-end">
      <div
        className="w-64 space-y-1 text-sm"
        aria-live="polite"
        aria-label="Totaler"
      >
        <div className="flex justify-between">
          <span className="text-muted-foreground">Netto</span>
          <span
            className="tabular-nums"
            data-testid="total-net-ore"
            data-value={totals.netOre}
          >
            {formatKr(totals.netOre)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Moms</span>
          <span
            className="tabular-nums"
            data-testid="total-vat-ore"
            data-value={totals.vatOre}
          >
            {formatKr(totals.vatOre)}
          </span>
        </div>
        <div className="flex justify-between border-t pt-1 font-medium">
          <span>Totalt</span>
          <span
            className="tabular-nums"
            data-testid="total-sum-ore"
            data-value={totals.totalOre}
          >
            {formatKr(totals.totalOre)}
          </span>
        </div>
      </div>
    </div>
  )
}
