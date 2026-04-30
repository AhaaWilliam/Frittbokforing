import type { ReactNode } from 'react'

interface ZoneNuHeadProps {
  title: ReactNode
  sub?: ReactNode
  testId?: string
}

/**
 * Sprint H+G-5 — ZoneNuHead.
 *
 * Standard-header för innehållet i ZoneNu (mittzonen i bokförare-läget).
 * Serif 20px-titel, valfri sub-rad (12px muted), under-streck-border.
 *
 * Används av VerifikatList, kontoplan, period-vyer, rapporter etc. enligt
 * H+G-prototypen. Konsumeras i Sprint H+G-6 (verifikat-list) och senare.
 */
export function ZoneNuHead({ title, sub, testId }: ZoneNuHeadProps) {
  return (
    <div
      className="shrink-0 border-b border-[var(--border-default)] px-[22px] pb-3.5 pt-[18px]"
      data-testid={testId}
    >
      <h2 className="font-serif text-xl font-normal leading-[1.2] text-[var(--text-primary)]">
        {title}
      </h2>
      {sub && (
        <p className="mt-1 text-xs text-[var(--text-secondary)]">{sub}</p>
      )}
    </div>
  )
}
