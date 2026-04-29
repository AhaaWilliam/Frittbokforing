import { Callout } from '../../components/ui/Callout'
import { CheckLine } from '../../components/ui/CheckLine'

/**
 * Sprint 22 — Vardag inkorg.
 *
 * "Vad behöver jag göra?" — checklista över saker som väntar:
 * obetalda fakturor, kostnader att registrera, momsperioder att stänga.
 *
 * MVP: statiska placeholder-rader. Sprint 23+ hookar in riktiga
 * data via useDashboardSummary + useDraftInvoices etc.
 */
export function VardagPageInbox() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="font-display text-3xl font-semibold text-neutral-900">
          Inkorg
        </h1>
        <p className="text-sm text-neutral-500">Vad behöver göras idag?</p>
      </header>

      <ul className="flex flex-col gap-3" aria-label="Att göra">
        <li className="rounded-lg border border-neutral-200 bg-white p-4">
          <CheckLine
            state="pending"
            label="Inga utestående uppgifter"
            description="När du har obetalda fakturor, kostnader att registrera eller momsperioder som stundar visas de här."
          />
        </li>
      </ul>

      <Callout variant="tip" title="Hur fungerar inkorgen?">
        Inkorgen samlar saker som behöver din uppmärksamhet — obetalda fakturor
        som har förfallit, kostnader du fotograferat men inte registrerat,
        kommande momsperioder. Klicka på en rad för att hoppa direkt till
        åtgärden.
      </Callout>
    </div>
  )
}
