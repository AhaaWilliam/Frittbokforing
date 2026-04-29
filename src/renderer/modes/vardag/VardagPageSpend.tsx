import { useState } from 'react'
import { Callout } from '../../components/ui/Callout'
import { BottomSheet, BottomSheetClose } from '../../components/ui/BottomSheet'
import { useUiMode } from '../../lib/use-ui-mode'

/**
 * Sprint 22 — Vardag kostnad.
 * Sprint 23 — Bottom-sheet wire-in. CTA "Lägg till" öppnar sheet med
 * placeholder-input. Faktisk save-integration mot expense-service kommer
 * när Vardag-quick-input domänmodellen (auto-kontoallokering) är klar.
 */
export function VardagPageSpend() {
  const { setMode } = useUiMode()
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-neutral-900">
            Lägg till kostnad
          </h1>
          <p className="text-sm text-neutral-500">
            Snabb-input för dina utgifter.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          data-testid="open-quick-spend"
        >
          Ny kostnad
        </button>
      </header>

      <Callout variant="tip" title="Snabb-input under uppbyggnad">
        Tryck <strong>Ny kostnad</strong> ovan för att förhandsgranska den
        kommande quick-input-flödet. Just nu är formuläret en platshållare — för
        att faktiskt registrera en kostnad, använd{' '}
        <button
          type="button"
          onClick={() => setMode('bokforare')}
          className="font-medium text-brand-700 underline-offset-2 hover:underline"
          data-testid="spend-fallback-link"
        >
          Bokförar-läget
        </button>
        .
      </Callout>

      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Ny kostnad"
        description="Quick-input — fyll i de viktigaste fälten och vi sköter resten."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            setSheetOpen(false)
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">
              Leverantör
            </span>
            <input
              type="text"
              placeholder="Acme AB"
              className="rounded-md border border-neutral-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              data-testid="quick-spend-supplier"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">
              Belopp (kr)
            </span>
            <input
              type="number"
              step="0.01"
              placeholder="0,00"
              className="rounded-md border border-neutral-200 px-3 py-2 text-sm font-mono focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              data-testid="quick-spend-amount"
            />
          </label>
          <Callout variant="info">
            Den här platshållar-formen sparar inte data ännu. Full integration
            kommer i nästa Vardag-iteration.
          </Callout>
          <div className="flex justify-end gap-2">
            <BottomSheetClose>Avbryt</BottomSheetClose>
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              data-testid="quick-spend-submit"
            >
              Spara
            </button>
          </div>
        </form>
      </BottomSheet>
    </div>
  )
}
