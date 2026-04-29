import type { ReactNode } from 'react'

/**
 * WorkspaceLayout — tre-zonslayout för Bokförare-läget.
 *
 * Designprototypens centrala arketyp: **Inkorg ⟶ Arbetsyta ⟶ Konsekvens**.
 *
 * Användning: verifikat-detaljvyn, manuell journalpost, kostnadsbokföring
 * — sidor där användaren behöver se kontext (vänster), arbeta med data
 * (mitten), och se direkta konsekvenser (höger).
 *
 * Per ADR 005 (full dual-mode UI): denna komponent är mode-specifik för
 * Bokförare. Vardag-läget använder bottom-sheets istället för konsekvens-
 * zon — om/när det implementeras (Sprint 17), bor det i
 * `src/renderer/modes/vardag/`.
 *
 * **Inte EntityListPage.** EntityListPage är optimerad för CRUD-tabeller
 * (master-detail med subview). WorkspaceLayout är optimerad för
 * arbetsytor med three-zone-fokus. Vissa sidor kommer migreras hit
 * (verifikat-detalj, kostnad-form, manuell journalpost). Listsidor
 * (kunder, produkter, faktura-listan) stannar kvar i EntityListPage.
 *
 * **Responsivt beteende:** på narrow viewports (< 1024px) staplas
 * zonerna vertikalt. Detaljerad responsiv-design (sheet-fallback för
 * höger-zon på mobil) görs i Sprint 17 när Vardag-läget byggs.
 */

interface WorkspaceLayoutProps {
  /**
   * Vänster zon — "Inkorg" / kontext. Lista över relaterade ärenden,
   * navigation mellan poster, breadcrumbs. Default-bredd: 280px.
   */
  leftZone?: ReactNode
  /**
   * Mittzon — primär arbetsyta. Form, tabell, eller annan input/redigering.
   * Tar resterande horisontellt utrymme.
   */
  centerZone: ReactNode
  /**
   * Höger zon — "Konsekvens". Live-preview av verifikat, validerings-status,
   * relaterade siffror (saldo före/efter, moms-effekt). Default-bredd: 360px.
   *
   * Per ADR 006 (live preview): höger-zonen renderar `<ConsequencePane>` som
   * default i forms — den hookas in när Sprint 16 levererar previewen.
   *
   * Om `rightZone` är `undefined` degraderas layouten till två zoner
   * (vänster + center). Ger graciös fallback för sidor som ännu inte har
   * konsekvens-data.
   */
  rightZone?: ReactNode
  /**
   * Sticky header ovanför alla zoner. Page-titel, primär CTA, breadcrumbs.
   */
  header?: ReactNode
  /**
   * Sticky footer under alla zoner. Bulk-actions, "Bokför"-knapp,
   * keyboard-hint-rad (⌘K, Esc, etc.).
   */
  footer?: ReactNode
  /** Stylingoverride för specifika kontexter. */
  className?: string
  /** Page-name för data-testid och a11y-landmarks. */
  pageName: string
}

export function WorkspaceLayout({
  leftZone,
  centerZone,
  rightZone,
  header,
  footer,
  className,
  pageName,
}: WorkspaceLayoutProps) {
  const rootClasses = [
    'flex h-full flex-col bg-[var(--surface)]',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={rootClasses}
      data-page={pageName}
      data-testid={`page-${pageName}`}
    >
      {header && (
        <header className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--border-default)] bg-[var(--surface-elevated)]">
          {header}
        </header>
      )}

      {/* Zones-region. På narrow stackar vertikalt. */}
      <div
        className="flex flex-1 flex-col overflow-hidden lg:flex-row"
        data-testid="workspace-zones"
      >
        {leftZone && (
          <aside
            className="w-full shrink-0 overflow-y-auto border-b border-[var(--border-default)] lg:w-[280px] lg:border-b-0 lg:border-r"
            aria-label="Inkorg"
            data-testid="workspace-left"
          >
            {leftZone}
          </aside>
        )}

        <main
          className="flex-1 overflow-y-auto"
          aria-label="Arbetsyta"
          data-testid="workspace-center"
        >
          {centerZone}
        </main>

        {rightZone && (
          <aside
            className="w-full shrink-0 overflow-y-auto border-t border-[var(--border-default)] lg:w-[360px] lg:border-t-0 lg:border-l"
            aria-label="Konsekvens"
            data-testid="workspace-right"
          >
            {rightZone}
          </aside>
        )}
      </div>

      {footer && (
        <footer className="sticky bottom-0 z-[var(--z-sticky)] border-t border-[var(--border-default)] bg-[var(--surface-elevated)]">
          {footer}
        </footer>
      )}
    </div>
  )
}
