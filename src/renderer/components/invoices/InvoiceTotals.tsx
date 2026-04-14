import type { InvoiceLineForm } from '../../lib/form-schemas/invoice'
import { formatKr, toOre } from '../../lib/format'

interface InvoiceTotalsProps {
  lines: InvoiceLineForm[]
}

export function InvoiceTotals({ lines }: InvoiceTotalsProps) {
  // Calculate per-line amounts in oren
  const lineAmounts = lines.map((line) => {
    // M131: heltalsaritmetik — undviker IEEE 754-precision-fel (F44)
    const nettoOre = Math.round(Math.round(line.quantity * 100) * Math.round(line.unit_price_kr * 100) / 100)
    const vatOre = Math.round(nettoOre * line.vat_rate)
    return { nettoOre, vatOre, vatRate: line.vat_rate }
  })

  const totalNetto = lineAmounts.reduce((sum, l) => sum + l.nettoOre, 0)
  const totalVat = lineAmounts.reduce((sum, l) => sum + l.vatOre, 0)
  const totalAtt = totalNetto + totalVat

  // Group VAT by rate
  const vatByRate = new Map<number, number>()
  for (const la of lineAmounts) {
    if (la.vatRate > 0) {
      vatByRate.set(la.vatRate, (vatByRate.get(la.vatRate) ?? 0) + la.vatOre)
    }
  }
  const vatRates = Array.from(vatByRate.entries()).sort(([a], [b]) => b - a)

  return (
    <div className="ml-auto w-64 space-y-1 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">Netto</span>
        <span data-testid="total-net-ore" data-value={totalNetto}>{formatKr(totalNetto)}</span>
      </div>
      {vatRates.map(([rate, amount]) => (
        <div key={rate} className="flex justify-between">
          <span className="text-muted-foreground">
            Moms {Math.round(rate * 100)}%
          </span>
          <span>{formatKr(amount)}</span>
        </div>
      ))}
      {totalVat === 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Moms</span>
          <span>{formatKr(0)}</span>
        </div>
      )}
      <span data-testid="total-vat-ore" data-value={totalVat} className="hidden" />
      <div className="border-t pt-1" />
      <div className="flex justify-between font-semibold">
        <span>Att betala</span>
        <span data-testid="total-sum-ore" data-value={totalAtt}>{formatKr(totalAtt)}</span>
      </div>
    </div>
  )
}
