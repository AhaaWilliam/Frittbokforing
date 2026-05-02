import type { ReactNode } from 'react'

/**
 * CheckLine — list-rad med tillstånd-symbol + text + valfri beskrivning.
 *
 * Användning: validerings-checklista ("Balanserar: ✓"), bokföringskonsekvens
 * ("Verifikat balanserat", "Periodisering registrerad"), wizard-step-status.
 *
 * Inte interaktiv — för klickbar list-rad använd `<button>` runt eller
 * en separat menu-item-komponent.
 */

export type CheckLineState = 'check' | 'cross' | 'pending' | 'info'

interface CheckLineProps {
  state: CheckLineState
  label: ReactNode
  /** Sekundär förklaringstext under huvudraden. */
  description?: ReactNode
  className?: string
}

const STATE_ICON_CLASSES: Record<CheckLineState, string> = {
  check: 'text-success-500',
  cross: 'text-danger-500',
  pending: 'text-[var(--text-faint)]',
  info: 'text-info-500',
}

function StateIcon({ state }: { state: CheckLineState }) {
  const className = `h-4 w-4 flex-shrink-0 ${STATE_ICON_CLASSES[state]}`
  switch (state) {
    case 'check':
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          className={className}
        >
          <path
            d="M3 8.5l3 3 7-7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'cross':
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          className={className}
        >
          <path
            d="M4 4l8 8M12 4l-8 8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'pending':
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          className={className}
        >
          <circle
            cx="8"
            cy="8"
            r="5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="2 2"
          />
        </svg>
      )
    case 'info':
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          className={className}
        >
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M8 7v4M8 5.25v.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )
  }
}

const STATE_LABEL: Record<CheckLineState, string> = {
  check: 'Klar',
  cross: 'Misslyckad',
  pending: 'Väntar',
  info: 'Information',
}

export function CheckLine({
  state,
  label,
  description,
  className,
}: CheckLineProps) {
  const rootClasses = ['flex items-start gap-2 text-sm', className ?? '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rootClasses} data-state={state}>
      <span className="mt-0.5 flex-shrink-0" aria-hidden="true">
        <StateIcon state={state} />
      </span>
      <span className="sr-only">{STATE_LABEL[state]}: </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-[var(--text-primary)]">{label}</span>
        {description != null && (
          <span className="text-xs text-[var(--text-secondary)]">
            {description}
          </span>
        )}
      </div>
    </div>
  )
}
