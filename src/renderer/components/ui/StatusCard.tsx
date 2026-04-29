import type { ReactNode } from 'react'

/**
 * StatusCard — KPI/metric-kort med rubrik, värde och valfri delta.
 *
 * Användning: dashboard-metrics ("Likvida medel", "Moms att betala"),
 * sidor-overview-paneler. Kan klickas (variant: button) för navigation
 * — då aktiveras Enter/Space automatiskt via native button-element.
 *
 * Värde-fältet använder display-typsnitt (Fraunces) för KPI-känsla.
 * Mono-typsnitt används bara om `mono` är satt — typiskt för exakta
 * belopp där tabulär läsning är viktig.
 */

export type StatusCardVariant = 'default' | 'accent' | 'muted'

interface StatusCardProps {
  title: string
  value: ReactNode
  /**
   * Sekundär metrik — t.ex. "+ 12 % mot förra månaden" eller "3 obetalda".
   * Inte deltatecken-styrd (consumer ansvarar för formatering).
   */
  hint?: ReactNode
  /** Tonar värdet med variant-färg. */
  variant?: StatusCardVariant
  /** Använder mono-typsnitt för värdet (för tabulära belopp). */
  mono?: boolean
  /** Gör hela kortet klickbart (Enter/Space + native button-fokus). */
  onClick?: () => void
  /** För att kunna scopa stilar i specifika kontexter. */
  className?: string
  /** A11y-label om title är otydligt out-of-context. */
  ariaLabel?: string
}

const VARIANT_VALUE_CLASSES: Record<StatusCardVariant, string> = {
  default: 'text-neutral-950',
  accent: 'text-brand-700',
  muted: 'text-neutral-500',
}

export function StatusCard({
  title,
  value,
  hint,
  variant = 'default',
  mono = false,
  onClick,
  className,
  ariaLabel,
}: StatusCardProps) {
  const valueClasses = [
    'text-3xl leading-snug font-semibold',
    mono ? 'font-mono' : 'font-display',
    VARIANT_VALUE_CLASSES[variant],
  ].join(' ')

  const rootClasses = [
    'flex flex-col gap-1.5 rounded-lg border border-neutral-200 bg-white p-5 text-left',
    onClick
      ? 'transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2'
      : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  const titleClasses = 'text-sm font-medium text-neutral-500'
  const hintClasses = 'text-xs text-neutral-500'

  const inner = (
    <>
      <p className={titleClasses}>{title}</p>
      <p className={valueClasses} data-status-card-value>
        {value}
      </p>
      {hint != null && <p className={hintClasses}>{hint}</p>}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={rootClasses}
        aria-label={ariaLabel}
        data-variant={variant}
      >
        {inner}
      </button>
    )
  }

  return (
    <div
      className={rootClasses}
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
      data-variant={variant}
    >
      {inner}
    </div>
  )
}
