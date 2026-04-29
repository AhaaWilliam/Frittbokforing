import type { ReactNode } from 'react'

/**
 * FieldError — kompakt fält-felmeddelande för formulär.
 *
 * Sprint 32: lättviktig variant av Callout-mönstret för inline-fel under
 * FormField/FormSelect/FormTextarea. Återanvänder danger-token-paletten
 * (samma färger som <Callout variant="danger">) men utan ikon, titel eller
 * accent-stapel — ett vanligt inline-fel ska inte visuellt konkurrera med
 * en Callout som signalerar viktig konsekvens.
 *
 * role="alert" så screen readers annonserar felet vid uppdatering.
 *
 * M133: callsiten ansvarar för att rendera detta endast när det finns ett
 * faktiskt fel — komponenten antar att children är satt.
 */
interface FieldErrorProps {
  id?: string
  children: ReactNode
  className?: string
}

export function FieldError({ id, children, className }: FieldErrorProps) {
  return (
    <p
      role="alert"
      id={id}
      className={`mt-1 text-xs text-danger-500 ${className ?? ''}`.trim()}
    >
      {children}
    </p>
  )
}
