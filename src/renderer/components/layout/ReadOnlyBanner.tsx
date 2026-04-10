import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { formatFiscalYearLabel } from './YearPicker'

export function ReadOnlyBanner() {
  const { activeFiscalYear, isReadOnly } = useFiscalYearContext()
  if (!isReadOnly || !activeFiscalYear) return null

  const label = formatFiscalYearLabel(activeFiscalYear)

  return (
    <div
      className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-8 py-2 text-sm text-amber-800"
      data-testid="readonly-banner"
    >
      <span>&#9888;</span>
      Du tittar på räkenskapsåret {label} (stängt). Data kan inte ändras.
    </div>
  )
}
