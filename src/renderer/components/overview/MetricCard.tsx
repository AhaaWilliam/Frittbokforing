import type { ReactNode } from 'react'
import { StatusCard } from '../ui/StatusCard'

/**
 * MetricCard — KPI-kort på dashboarden.
 *
 * Sprint 13b (finish): wrap-implementation ovanpå StatusCard-primitiven
 * (Sprint 13a). Bevarar publik API så PageOverview-callsites är
 * oförändrade, men ärver token-baserad styling, display-typsnitt på
 * värdet och tighter spacing från StatusCard.
 *
 * Mapping:
 * - label   → StatusCard.title
 * - value   → StatusCard.value (skeleton-placeholder vid undefined+loading)
 * - sublabel → StatusCard.hint
 * - isLoading + value undefined → animerad skeleton som value
 * - variant: 'positive'/'negative' → färgtonad value via inline span
 *   (StatusCard.variant 'default'/'accent'/'muted' kan inte uttrycka
 *   green/red — det är dashboard-specifikt och ligger fortsatt här)
 * - onClick → StatusCard.onClick (förblir <button> med focus-ring)
 */

interface MetricCardProps {
  label: string
  value?: string
  sublabel?: string
  isLoading?: boolean
  variant?: 'default' | 'positive' | 'negative'
  /**
   * Om definierad renderas kortet som `<button>` (fokuserbart + Enter-
   * aktivering). Utelämnas → presentational `<div>`. Sprint J F49-c2.
   */
  onClick?: () => void
}

function variantValueClass(
  variant: 'default' | 'positive' | 'negative',
): string {
  if (variant === 'positive') return 'text-success-500'
  if (variant === 'negative') return 'text-danger-500'
  return ''
}

export function MetricCard({
  label,
  value,
  sublabel,
  isLoading = false,
  variant = 'default',
  onClick,
}: MetricCardProps) {
  const valueNode: ReactNode =
    isLoading && value === undefined ? (
      <span className="inline-block h-7 w-24 animate-pulse rounded bg-[var(--surface-secondary)] align-middle" />
    ) : variant === 'default' ? (
      (value ?? '–')
    ) : (
      <span className={variantValueClass(variant)}>{value ?? '–'}</span>
    )

  return (
    <StatusCard
      title={label}
      value={valueNode}
      hint={sublabel}
      onClick={onClick}
      ariaLabel={onClick ? `${label} — klicka för detaljer` : undefined}
      mono
    />
  )
}
