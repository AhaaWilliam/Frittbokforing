import type { ReactNode } from 'react'

interface FieldProps {
  label: string
  children: ReactNode
  hint?: string
  error?: string
  /**
   * Bredd-span i ett 2-kolumners grid. Default 1.
   */
  span?: 1 | 2
}

/**
 * Sprint H+G-8 — Field-primitive för sheet-formulär.
 *
 * Strukturerar ett label + input-par med valfri hint/error. Designad
 * för att användas i sheets (BokforKostnadSheet, SkapaFakturaSheet)
 * där formulären är tätt packade i grid-layout.
 *
 * Aria-koppling görs av konsumenten via `htmlFor`/`id` — Field renderar
 * bara strukturen.
 */
export function Field({ label, children, hint, error, span = 1 }: FieldProps) {
  return (
    <div
      className={span === 2 ? 'col-span-2' : 'col-span-1'}
      data-testid="field"
    >
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-secondary)]">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="mt-1 text-xs text-[var(--text-faint)]">{hint}</p>
      )}
      {error && (
        <p
          className="mt-1 text-xs text-[var(--color-danger-600)]"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}
