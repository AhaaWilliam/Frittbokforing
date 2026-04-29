import type { ReactNode } from 'react'

/**
 * Callout — sidomarginal-callout med vertikal accent-stapel.
 *
 * Designprototypens "konsekvens"-mönster — text som förklarar vad ett
 * bokföringsval innebär ("Detta belopp dras direkt från ditt företagskonto"),
 * varningar ("Verifikat är låst efter bokföring") eller vägledning
 * ("Tips: Tryck ⌘K för att söka").
 *
 * Inte en dialog. Inte en toast. Inline-block i flödet.
 *
 * Variant `info|tip|warning|danger` → accent-färg + ikon-konvention.
 * Title är optional — utan title blir det en ren text-callout.
 */

export type CalloutVariant = 'info' | 'tip' | 'warning' | 'danger'

interface CalloutProps {
  variant?: CalloutVariant
  title?: ReactNode
  children: ReactNode
  /** Egen ikon — annars används default per variant. */
  icon?: ReactNode
  className?: string
}

const VARIANT_CLASSES: Record<
  CalloutVariant,
  { bar: string; icon: string; bg: string }
> = {
  info: {
    bar: 'bg-info-500',
    icon: 'text-info-500',
    bg: 'bg-info-100/40',
  },
  tip: {
    bar: 'bg-brand-500',
    icon: 'text-brand-500',
    bg: 'bg-brand-50',
  },
  warning: {
    bar: 'bg-warning-500',
    icon: 'text-warning-500',
    bg: 'bg-warning-100/40',
  },
  danger: {
    bar: 'bg-danger-500',
    icon: 'text-danger-500',
    bg: 'bg-danger-100/40',
  },
}

const VARIANT_ROLE: Record<CalloutVariant, 'note' | 'alert'> = {
  info: 'note',
  tip: 'note',
  warning: 'alert',
  danger: 'alert',
}

const VARIANT_LABEL: Record<CalloutVariant, string> = {
  info: 'Information',
  tip: 'Tips',
  warning: 'Varning',
  danger: 'Viktigt',
}

function DefaultIcon({ variant }: { variant: CalloutVariant }) {
  const cls = `h-4 w-4 ${VARIANT_CLASSES[variant].icon}`
  if (variant === 'warning' || variant === 'danger') {
    return (
      <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className={cls}>
        <path
          d="M8 2L1.5 13.5h13L8 2z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M8 6.5v3.5M8 11.75v.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  // info / tip
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className={cls}>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 7v4M8 5.25v.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Callout({
  variant = 'info',
  title,
  children,
  icon,
  className,
}: CalloutProps) {
  const cls = VARIANT_CLASSES[variant]
  const role = VARIANT_ROLE[variant]
  const srLabel = VARIANT_LABEL[variant]

  const rootClasses = [
    'relative flex items-start gap-3 rounded-md py-3 pr-4 pl-4',
    'border border-transparent',
    cls.bg,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      role={role}
      aria-label={typeof title === 'string' ? undefined : srLabel}
      className={rootClasses}
      data-variant={variant}
    >
      {/* Vertikal accent-stapel — left border via absolute element istf border-left
          så att hörn-radie följer panel-rundningen utan visuell bryta. */}
      <span
        aria-hidden="true"
        className={`absolute left-0 top-2 bottom-2 w-1 rounded-full ${cls.bar}`}
      />
      <span className="mt-0.5 flex-shrink-0" aria-hidden="true">
        {icon ?? <DefaultIcon variant={variant} />}
      </span>
      <div className="flex flex-col gap-1 text-sm">
        {title != null && (
          <div className="font-medium text-neutral-900">{title}</div>
        )}
        <div className="text-neutral-700">{children}</div>
      </div>
    </div>
  )
}
