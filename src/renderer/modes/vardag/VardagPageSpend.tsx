import { Callout } from '../../components/ui/Callout'
import { useUiMode } from '../../lib/use-ui-mode'

/**
 * Sprint 22 — Vardag kostnad.
 * Sprint 80 — Manuell kontering: placeholder-form borttaget. Vardag styr
 * användaren direkt till Bokförar-lägets ExpenseForm där full kontering
 * (konto, momskod, motpart) sker manuellt. Auto-kontoallokering är ett
 * uttryckligt avvisat designval — kostnader kräver alltid medvetet
 * kontoval för att uppfylla M137 och kvalitet i bokföringen.
 */
export function VardagPageSpend() {
  const { setMode } = useUiMode()

  function goToExpenseForm() {
    window.location.hash = '/expenses/create'
    setMode('bokforare')
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="font-display text-3xl font-semibold text-neutral-900">
          Lägg till kostnad
        </h1>
        <p className="text-sm text-neutral-500">
          Registrera en utgift med konto och moms.
        </p>
      </header>

      <Callout variant="info" title="Manuell kontering">
        Kostnader bokförs alltid med rätt konto och momskod. Vardag-läget
        skickar dig till Bokförar-lägets fullständiga formulär där du väljer
        leverantör, konto och moms.
      </Callout>

      <button
        type="button"
        onClick={goToExpenseForm}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 self-start"
        data-testid="spend-fallback-link"
      >
        Skapa ny kostnad i Bokförar-läget
      </button>
    </div>
  )
}
