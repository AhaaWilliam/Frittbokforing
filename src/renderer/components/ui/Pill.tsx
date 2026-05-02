import type { ReactNode } from 'react'

/**
 * Pill — kompakt status-/kategori-badge.
 *
 * Användning: status på faktura/kostnad ("Utkast", "Bokförd"), tag-chip,
 * inline-meta i listor. Inte interaktiv — om badge ska vara klickbar,
 * använd `<button>` runt eller bygg en annan primitiv.
 *
 * Sprint 13 (komponentprimitiver) — bor i `components/ui/`.
 */

export type PillVariant =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'

export type PillSize = 'xs' | 'sm' | 'md'

interface PillProps {
  children: ReactNode
  variant?: PillVariant
  size?: PillSize
  /** Optional dot prefix (matchar variant-färg) — t.ex. live/aktiv-indikator. */
  withDot?: boolean
  /** Sätt på root för stylingoverride i specifika kontexter. */
  className?: string
}

const VARIANT_CLASSES: Record<PillVariant, string> = {
  neutral:
    'bg-[var(--surface-secondary)]/60 text-[var(--text-secondary)] ring-1 ring-inset ring-[var(--border-default)]',
  brand: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100',
  success: 'bg-success-100 text-success-500 ring-1 ring-inset ring-success-100',
  warning: 'bg-warning-100 text-warning-500 ring-1 ring-inset ring-warning-100',
  danger: 'bg-danger-100 text-danger-500 ring-1 ring-inset ring-danger-100',
  info: 'bg-info-100 text-info-500 ring-1 ring-inset ring-info-100',
}

const DOT_CLASSES: Record<PillVariant, string> = {
  neutral: 'bg-[var(--text-faint)]',
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  info: 'bg-info-500',
}

const SIZE_CLASSES: Record<PillSize, string> = {
  // Sprint 74 — xs för täta tabeller (depreciation-schedule, dense lists).
  xs: 'text-[10px] px-1.5 py-0 gap-0.5',
  sm: 'text-xs px-2 py-0.5 gap-1',
  md: 'text-sm px-2.5 py-1 gap-1.5',
}

export function Pill({
  children,
  variant = 'neutral',
  size = 'sm',
  withDot = false,
  className,
}: PillProps) {
  const classes = [
    'inline-flex items-center rounded-full font-medium whitespace-nowrap',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} data-variant={variant} data-size={size}>
      {withDot && (
        <span
          aria-hidden="true"
          className={`inline-block h-1.5 w-1.5 rounded-full ${DOT_CLASSES[variant]}`}
        />
      )}
      {children}
    </span>
  )
}
