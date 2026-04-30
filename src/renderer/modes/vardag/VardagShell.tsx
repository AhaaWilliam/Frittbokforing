import type { ReactNode } from 'react'
import { useUiMode } from '../../lib/use-ui-mode'
import { VardagBottomNav } from './VardagBottomNav'

/**
 * Sprint 17 — VardagShell (ADR 005).
 * Sprint 22 — Lägg till bottom-nav för fyra Vardag-flöden.
 *
 * Layout (Vardag):
 * - Ljus top-bar med bolags-namn + mode-switcher
 * - Center: aktiv Vardag-page (routes via HashRouter i VardagApp)
 * - Bottom-nav: Inkorg / Kostnad / Faktura / Status
 *
 * Mode-switcher persisterar via `useUiMode` (settings-key `ui_mode`).
 *
 * **showBottomNav-prop**: default true. Kan disablas i tester eller
 * vid framtida sub-views (t.ex. ny-kostnad-flöde i full-screen).
 */

interface VardagShellProps {
  companyName: string
  children: ReactNode
  showBottomNav?: boolean
}

export function VardagShell({
  companyName,
  children,
  showBottomNav = true,
}: VardagShellProps) {
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
          <span className="font-serif text-xl font-normal">
            <span className="font-serif-italic">Fritt</span> Bokföring
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

      {showBottomNav && <VardagBottomNav />}
    </div>
  )
}
