import { useState } from 'react'
import { Lock } from 'lucide-react'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import type { FiscalYear } from '../../../shared/types'
import { CreateFiscalYearDialog } from './CreateFiscalYearDialog'

function formatFiscalYearLabel(fy: FiscalYear): string {
  const startYear = new Date(fy.start_date).getFullYear()
  const endYear = new Date(fy.end_date).getFullYear()
  if (startYear === endYear) return String(startYear)
  return `${startYear}/${String(endYear).slice(-2)}`
}

export { formatFiscalYearLabel }

export function YearPicker() {
  const { activeFiscalYear, setActiveFiscalYear, allFiscalYears } =
    useFiscalYearContext()
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  if (!activeFiscalYear || allFiscalYears.length === 0) return null

  return (
    <div className="mt-3" data-testid="year-picker">
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Räkenskapsår
      </label>
      <select
        value={activeFiscalYear.id}
        onChange={(e) => {
          if (e.target.value === '__create__') {
            setShowCreateDialog(true)
            // Reset select to current value
            e.target.value = String(activeFiscalYear.id)
            return
          }
          const fy = allFiscalYears.find(
            (y) => y.id === parseInt(e.target.value, 10),
          )
          if (fy) setActiveFiscalYear(fy)
        }}
        className={`w-full rounded-md border px-2 py-1.5 text-sm outline-none ${
          activeFiscalYear.is_closed === 1
            ? 'border-amber-300 bg-amber-50 text-amber-800'
            : 'border-border bg-background'
        }`}
      >
        {allFiscalYears.map((fy) => (
          <option key={fy.id} value={fy.id}>
            {formatFiscalYearLabel(fy)}
            {fy.is_closed === 1 ? ' (stängt)' : ''}
          </option>
        ))}
        <option value="__create__">+ Skapa nytt räkenskapsår</option>
      </select>
      {activeFiscalYear.is_closed === 1 && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-600">
          <Lock className="h-3 w-3" />
          Stängt år — skrivskyddat
        </div>
      )}

      <CreateFiscalYearDialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      />
    </div>
  )
}
