import type { ReactNode } from 'react'
import { SectionLabel } from '../ui/SectionLabel'

interface ZoneConsProps {
  /**
   * Etikett för zonen (UPPERCASE i SectionLabel-styling).
   * Defaultar till "KONSEKVENS" — kan överskrivas per vy
   * (t.ex. "KONSEKVENS · LIVE" vid live-bokföring).
   */
  label?: string
  /** Visa pulserande indikator (mint-prick) — används vid live-mode. */
  pulse?: boolean
  children?: ReactNode
}

/**
 * Sprint H+G-5 — ZoneCons (höger zon, 360px).
 *
 * Konsekvens-zonen i bokförare-läget. Alltid synlig i 3-zone-grid:n.
 * Visar status (`StatusNu`), live-preview (`VerifikatLivePreview`) eller
 * detalj-påverkan (`VerifikatDetaljPaverkan`) beroende på aktiv vy.
 *
 * I H+G-5 är zonen en placeholder med "KONSEKVENS"-rubrik och tom yta.
 * Innehåll kommer i Sprint H+G-7.
 */
export function ZoneCons({
  label = 'Konsekvens',
  pulse,
  children,
}: ZoneConsProps) {
  return (
    <aside
      className="flex flex-col overflow-hidden border-l border-[var(--border-default)] bg-[var(--surface-secondary)]"
      data-testid="zone-cons"
      aria-label={label}
    >
      <div className="flex items-baseline justify-between px-[18px] pb-2.5 pt-3.5">
        <SectionLabel as="span">{label}</SectionLabel>
        {pulse && (
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: 'var(--color-mint-500)' }}
            aria-hidden="true"
          />
        )}
      </div>
      <div className="flex-1 overflow-auto px-[22px] pb-[22px] pt-1">
        {children ?? (
          <p className="text-xs italic text-[var(--text-faint)]">
            Konsekvens-zonen — fylls i Sprint H+G-7 (status · live · påverkan).
          </p>
        )}
      </div>
    </aside>
  )
}
