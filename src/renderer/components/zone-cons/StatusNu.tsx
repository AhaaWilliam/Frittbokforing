import { useDashboardSummary } from '../../lib/hooks'
import { useFiscalYearContextOptional } from '../../contexts/FiscalYearContext'
import { formatKr } from '../../lib/format'
import { SectionLabel } from '../ui/SectionLabel'

/**
 * Sprint H+G-7 — StatusNu (default-vy i ZoneCons).
 *
 * Visar nuvarande "puls" på företaget enligt H+G-prototyp:
 * - Likvida medel (banksaldo)
 * - Obetalda kundfordringar / leverantörsskulder
 * - Moms-netto (att betala / få tillbaka)
 * - Snabbcheck per nyckel-area
 *
 * Datakälla: `useDashboardSummary` (samma som dashboard-vyns siffror,
 * single source of truth via M96 result-service).
 */
export function StatusNu() {
  const fy = useFiscalYearContextOptional()
  const fiscalYearId = fy?.activeFiscalYear?.id
  const { data, isLoading } = useDashboardSummary(fiscalYearId)

  if (!fiscalYearId) {
    return (
      <p className="text-xs italic text-[var(--text-faint)]">
        Inget aktivt räkenskapsår.
      </p>
    )
  }

  if (isLoading || !data) {
    return (
      <p className="text-xs italic text-[var(--text-faint)]">Hämtar status…</p>
    )
  }

  const vatTone = data.vatNetOre > 0 ? 'warning' : 'mint'
  const receivablesTone = data.unpaidReceivablesOre > 0 ? 'warning' : 'mint'
  const payablesTone = data.unpaidPayablesOre > 0 ? 'warning' : 'mint'

  return (
    <div className="space-y-4">
      <StatusCard label="Likvida medel">
        <span className="font-mono text-2xl">
          {formatKr(data.bankBalanceOre)}
        </span>
        <p className="mt-1 text-xs text-[var(--text-faint)]">
          summa konto 1910/1920/1930
        </p>
      </StatusCard>

      <StatusCard label="Obetalt">
        <StatusRow
          tone={receivablesTone}
          label="Kundfordringar"
          value={formatKr(data.unpaidReceivablesOre)}
        />
        <StatusRow
          tone={payablesTone}
          label="Leverantörsskulder"
          value={formatKr(data.unpaidPayablesOre)}
        />
      </StatusCard>

      <StatusCard label="Moms-netto">
        <StatusRow
          tone={vatTone}
          label={data.vatNetOre > 0 ? 'Att betala' : 'Att få tillbaka'}
          value={formatKr(Math.abs(data.vatNetOre))}
        />
      </StatusCard>

      <StatusCard label="Resultat hittills">
        <StatusRow
          tone={data.operatingResultOre >= 0 ? 'mint' : 'warning'}
          label="Rörelseresultat"
          value={formatKr(data.operatingResultOre)}
        />
      </StatusCard>
    </div>
  )
}

function StatusCard({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <section
      className="rounded-md border border-[var(--border-default)] bg-[var(--surface-elevated)] p-4"
      data-testid="status-card"
    >
      <SectionLabel className="mb-2">{label}</SectionLabel>
      <div className="text-sm text-[var(--text-primary)]">{children}</div>
    </section>
  )
}

function StatusRow({
  tone,
  label,
  value,
}: {
  tone: 'mint' | 'warning' | 'danger'
  label: string
  value: string
}) {
  const dotColor =
    tone === 'mint'
      ? 'var(--color-mint-500)'
      : tone === 'warning'
        ? 'var(--color-warning-500)'
        : 'var(--color-danger-500)'
  return (
    <div className="flex items-center justify-between py-1">
      <span className="flex items-center gap-2">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: dotColor }}
          aria-hidden="true"
        />
        <span>{label}</span>
      </span>
      <span className="font-mono">{value}</span>
    </div>
  )
}
