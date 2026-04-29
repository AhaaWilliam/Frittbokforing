import type { ReactNode } from 'react'
import { useUiMode } from '../../lib/use-ui-mode'

/**
 * Sprint 17 — VardagShell (ADR 005).
 *
 * Minimal viable Vardag-skal. Renderar:
 * - Ljus top-bar med bolags-namn + mode-switcher
 * - Center: aktiv Vardag-page
 * - Ingen sidebar (Vardag-läget använder bottom-nav i framtida iterationer)
 *
 * **MVP-status.** Sprint 17 levererar skalet och första page (Overview).
 * Bottom-sheets, snabb-input, och full Vardag-routing-träd byggs i
 * efterföljande sprintar när denna grundstomme har funnits ett tag och
 * lärdomar samlats.
 *
 * Mode-switcher är medvetet enkel — knapp som växlar tillbaka till
 * Bokförare. Persistens hanteras via `useUiMode`.
 */

interface VardagShellProps {
  companyName: string
  children: ReactNode
}

export function VardagShell({ companyName, children }: VardagShellProps) {
  const { setMode } = useUiMode()

  return (
    <div
      className="flex h-screen flex-col bg-[var(--surface)]"
      data-testid="vardag-shell"
    >
      <header
        className="flex items-center justify-between border-b border-[var(--border-default)] bg-[var(--top-bar-surface)] px-6 py-3 text-[var(--top-bar-text)]"
        role="banner"
      >
        <div className="flex items-center gap-3">
          <span className="font-display text-xl font-semibold">
            Fritt Bokföring
          </span>
          <span className="text-sm opacity-70">— {companyName}</span>
        </div>
        <button
          type="button"
          onClick={() => setMode('bokforare')}
          className="rounded-md border border-current px-3 py-1.5 text-sm font-medium opacity-90 transition-opacity hover:opacity-100"
          data-testid="switch-to-bokforare"
          aria-label="Byt till bokförar-läge"
        >
          Bokförar-läge
        </button>
      </header>

      <main
        className="flex-1 overflow-y-auto"
        id="main-content"
        aria-label="Huvudinnehåll"
      >
        {children}
      </main>
    </div>
  )
}
