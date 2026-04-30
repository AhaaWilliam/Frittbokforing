import type { ReactNode } from 'react'
import { useUiMode } from '../../lib/use-ui-mode'

/**
 * Sprint 17 — VardagShell (ADR 005).
 * Sprint H+G-3 — Bottom-nav borttagen; Vardag är nu en hero-screen
 * utan sub-routing.
 *
 * Layout (Vardag):
 * - Ljus top-bar med "Fritt Bokföring" (italic Fraunces) + bolags-namn
 *   och mode-switcher till bokförare-läge.
 * - Center: aktiv Vardag-page (hero med BigButtons).
 *
 * Mode-switcher persisterar via `useUiMode` (settings-key `ui_mode`).
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
    </div>
  )
}
