import { Callout } from '../../components/ui/Callout'
import { useUiMode } from '../../lib/use-ui-mode'

/**
 * Sprint 22 — Vardag faktura.
 *
 * MVP: tom yta med fallback till Bokförar-läget. Sprint 24+ inför
 * snabb-fakturering (kund + belopp + skicka).
 */
export function VardagPageIncome() {
  const { setMode } = useUiMode()

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="font-display text-3xl font-semibold text-neutral-900">
          Skicka faktura
        </h1>
        <p className="text-sm text-neutral-500">Quick-input för intäkter.</p>
      </header>

      <Callout variant="tip" title="Snabb-fakturering kommer">
        Användarvänlig fakturering är under uppbyggnad. Använd{' '}
        <button
          type="button"
          onClick={() => setMode('bokforare')}
          className="font-medium text-brand-700 underline-offset-2 hover:underline"
          data-testid="income-fallback-link"
        >
          Bokförar-läget
        </button>{' '}
        för full fakturahantering.
      </Callout>
    </div>
  )
}
