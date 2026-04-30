import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { formatFiscalYearLabel } from './YearPicker'

/**
 * ReadOnlyBanner — page-wide top-strip (border-b, full-width).
 *
 * Semantisk avvikelse från Callout-card (Sprint 67/68): en sentinel-banner
 * som indikerar systemstatus över hela viewporten, inte in-flow content.
 * Använder warning-tokens för paritet med övrig warning-styling.
 */
export function ReadOnlyBanner() {
  const { activeFiscalYear, isReadOnly } = useFiscalYearContext()
  if (!isReadOnly || !activeFiscalYear) return null

  const label = formatFiscalYearLabel(activeFiscalYear)

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-warning-500/30 bg-warning-100/40 px-8 py-2 text-sm text-warning-700"
      data-testid="readonly-banner"
    >
      <span aria-hidden="true">⚠</span>
      Du tittar på räkenskapsåret {label} (stängt). Data kan inte ändras.
    </div>
  )
}
