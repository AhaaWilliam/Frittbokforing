import { StatusCard } from '../../components/ui/StatusCard'
import { Callout } from '../../components/ui/Callout'
import { useDashboardSummary } from '../../lib/hooks'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { formatKr } from '../../lib/format'

/**
 * Sprint 22 — Vardag status (placeholder).
 * Sprint 26 — Riktiga data via useDashboardSummary.
 *
 * Tre KPI: bank-saldo (utestående fordringar minus skulder),
 * moms att betala, resultat hittills i år.
 */
export function VardagPageStatus() {
  const { activeFiscalYear } = useFiscalYearContext()
  const { data: summary, isLoading } = useDashboardSummary(activeFiscalYear?.id)

  // "Pengar i kassan" är en grov approximation: kundfordringar minus
  // leverantörsskulder. För riktigt bank-saldo behövs bank-konto-koppling
  // (Sprint 27+ när bank-integration är tätare). Placeholder tills dess.
  const liquidEstimateOre =
    summary != null
      ? summary.unpaidReceivablesOre - summary.unpaidPayablesOre
      : null

  const isPositive = (v: number | null) => v != null && v >= 0

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="font-display text-3xl font-semibold text-neutral-900">
          Status
        </h1>
        <p className="text-sm text-neutral-500">Hur mår företaget just nu?</p>
      </header>

      <section
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        aria-label="Status-översikt"
      >
        <StatusCard
          title="Likvidt netto"
          value={
            isLoading
              ? '–'
              : liquidEstimateOre != null
                ? formatKr(liquidEstimateOre)
                : '–'
          }
          hint="Fordringar minus skulder"
          variant={isPositive(liquidEstimateOre) ? 'default' : 'muted'}
          mono
        />
        <StatusCard
          title="Moms (netto)"
          value={isLoading ? '–' : summary ? formatKr(summary.vatNetOre) : '–'}
          hint={
            summary && summary.vatNetOre > 0
              ? 'Att betala till SKV'
              : 'Att få tillbaka'
          }
          variant={summary && summary.vatNetOre > 0 ? 'default' : 'muted'}
          mono
        />
        <StatusCard
          title="Resultat YTD"
          value={
            isLoading
              ? '–'
              : summary
                ? formatKr(summary.operatingResultOre)
                : '–'
          }
          hint="Hittills i år"
          variant={
            summary && summary.operatingResultOre >= 0 ? 'default' : 'muted'
          }
          mono
        />
      </section>

      {!activeFiscalYear && (
        <Callout variant="info" title="Inget aktivt räkenskapsår">
          För att se siffror behöver du välja eller skapa ett räkenskapsår. Det
          görs i Bokförar-läget under Inställningar.
        </Callout>
      )}
    </div>
  )
}
