import { useFixedAsset } from '../../lib/hooks'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { Pill, type PillVariant } from '../ui/Pill'

const STATUS_PILL: Record<string, PillVariant> = {
  executed: 'success',
  skipped: 'neutral',
  pending: 'info',
}

function fmtKr(ore: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
  }).format(ore / 100)
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Väntar',
  executed: 'Bokförd',
  skipped: 'Ignorerad',
}

interface Props {
  assetId: number
}

export function FixedAssetDetailPanel({ assetId }: Props) {
  const { data, isLoading } = useFixedAsset(assetId)

  if (isLoading) {
    return (
      <div className="bg-muted/20 p-4">
        <LoadingSpinner />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-muted/20 p-4 text-sm text-muted-foreground">
        Kunde inte hämta detaljer.
      </div>
    )
  }

  const methodLabel =
    data.method === 'linear'
      ? 'Linjär'
      : data.declining_rate_bp
        ? `Degressiv (${data.declining_rate_bp / 100}% per månad)`
        : 'Degressiv'

  return (
    <div
      className="bg-muted/10 p-4 text-sm"
      data-testid={`fa-detail-${assetId}`}
    >
      <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs md:grid-cols-4">
        <div>
          <span className="text-muted-foreground">Metod:</span>{' '}
          <span className="font-medium">{methodLabel}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Nyttjandetid:</span>{' '}
          <span className="font-medium">{data.useful_life_months} mån</span>
        </div>
        <div>
          <span className="text-muted-foreground">Restvärde:</span>{' '}
          <span className="font-medium tabular-nums">
            {fmtKr(data.residual_value_ore)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Konto (tillgång):</span>{' '}
          <span className="font-mono">{data.account_asset}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Konto (ack. avskr.):</span>{' '}
          <span className="font-mono">
            {data.account_accumulated_depreciation}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Konto (kostnad):</span>{' '}
          <span className="font-mono">{data.account_depreciation_expense}</span>
        </div>
        {data.status === 'disposed' && data.disposed_date && (
          <div className="col-span-2">
            <span className="text-muted-foreground">Avyttrad:</span>{' '}
            <span className="font-medium">{data.disposed_date}</span>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded border bg-background">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/30 text-left text-muted-foreground">
              <th className="px-3 py-1.5">Period</th>
              <th className="px-3 py-1.5">Startdatum</th>
              <th className="px-3 py-1.5">Slutdatum</th>
              <th className="px-3 py-1.5 text-right">Belopp</th>
              <th className="px-3 py-1.5">Status</th>
              <th className="px-3 py-1.5">Verifikat</th>
            </tr>
          </thead>
          <tbody data-testid={`fa-schedule-${assetId}`}>
            {data.schedule.map((s) => (
              <tr key={s.id} className="border-b last:border-b-0">
                <td className="px-3 py-1 tabular-nums">{s.period_number}</td>
                <td className="px-3 py-1 text-muted-foreground">
                  {s.period_start}
                </td>
                <td className="px-3 py-1 text-muted-foreground">
                  {s.period_end}
                </td>
                <td className="px-3 py-1 text-right tabular-nums">
                  {fmtKr(s.amount_ore)}
                </td>
                <td className="px-3 py-1">
                  <Pill variant={STATUS_PILL[s.status] ?? 'neutral'}>
                    {STATUS_LABELS[s.status] ?? s.status}
                  </Pill>
                </td>
                <td className="px-3 py-1 text-muted-foreground tabular-nums">
                  {s.journal_entry_id ? `#${s.journal_entry_id}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
