import type { ReactNode } from 'react'
import { AppTopBar } from '../../components/layout/AppTopBar'

/**
 * Sprint 17 — VardagShell (ADR 005).
 * Sprint H+G-3 — Bottom-nav borttagen.
 * Sprint H+G-4 — Inline-header ersatt med <AppTopBar>.
 *
 * Layout (Vardag):
 * - AppTopBar (ljus i vardag-läget, mörk i bokförare).
 * - Center: aktiv Vardag-page (hero med BigButtons).
 *
 * Mode-switcher finns nu i AppTopBar med ⌘⇧B-shortcut.
 */

interface VardagShellProps {
  companyName: string
  children: ReactNode
}

export function VardagShell({ companyName, children }: VardagShellProps) {
  return (
    <div
      className="flex h-screen flex-col bg-[var(--surface)]"
      data-testid="vardag-shell"
    >
      <AppTopBar companyName={companyName} />

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
