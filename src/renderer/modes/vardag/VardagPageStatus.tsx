import { StatusCard } from '../../components/ui/StatusCard'
import { Callout } from '../../components/ui/Callout'

/**
 * Sprint 22 — Vardag status.
 *
 * Tre KPI-kort: likvida medel, moms att betala, hälsa (resultat YTD).
 * MVP: placeholder-värden. Sprint 23+ hookar in
 * useDashboardSummary för riktiga siffror.
 */
export function VardagPageStatus() {
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
          title="Pengar i kassan"
          value="—"
          hint="Saldo just nu"
          variant="default"
          mono
        />
        <StatusCard
          title="Moms att betala"
          value="—"
          hint="Inom 14 dagar"
          variant="muted"
          mono
        />
        <StatusCard
          title="Resultat YTD"
          value="—"
          hint="Hittills i år"
          variant="default"
          mono
        />
      </section>

      <Callout variant="info" title="Riktiga siffror kommer">
        Status-vyn kommer hämta data från ditt aktiva räkenskapsår när
        funktionen är fullt integrerad. Just nu visas placeholder-värden.
      </Callout>
    </div>
  )
}
