import { StatusCard } from '../../components/ui/StatusCard'
import { Callout } from '../../components/ui/Callout'

/**
 * Sprint 17 — VardagPageOverview (MVP, ADR 005).
 *
 * Vardag-läget centrerar runt frågan "vad behöver jag veta/göra idag?".
 * MVP-versionen visar tre StatusCards (likvida medel, obetalda kostnader,
 * obetalda fakturor) som klickbara CTA:er, plus en informationscallout.
 *
 * Riktiga data hookas in i efterföljande sprintar (Sprint 18+) — denna
 * version visar placeholder-värden så skalet kan utvärderas visuellt.
 */
export function VardagPageOverview() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="font-display text-3xl font-semibold text-neutral-900">
          God morgon
        </h1>
        <p className="text-sm text-neutral-500">Här är vad som väntar.</p>
      </header>

      <section
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        aria-label="Snabböversikt"
      >
        <StatusCard
          title="Pengar i kassan"
          value="—"
          hint="Inga räkenskapsår ännu"
          variant="default"
          mono
        />
        <StatusCard
          title="Obetalda kostnader"
          value="—"
          hint="Inga registrerade"
          variant="muted"
        />
        <StatusCard
          title="Obetalda fakturor"
          value="—"
          hint="Inga utestående"
          variant="muted"
        />
      </section>

      <Callout variant="tip" title="Vardag-läget är under uppbyggnad">
        Du är på Vardag-läget — en lättare ingång för dig som inte själv bokför.
        Kostnader, fakturor och status finns här i förenklad form. Behöver du
        verifikat-detaljer, klicka på <strong>Bokförar-läge</strong> i topbaren.
      </Callout>
    </div>
  )
}
