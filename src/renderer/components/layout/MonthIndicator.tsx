import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { useFiscalPeriods } from '../../lib/hooks'
import type { FiscalPeriod } from '../../../shared/types'

function getMonthLetter(period: FiscalPeriod): string {
  return new Date(period.start_date + 'T00:00:00')
    .toLocaleDateString('sv-SE', { month: 'short' })
    .charAt(0)
    .toUpperCase()
}

function getMonthName(period: FiscalPeriod): string {
  return new Date(period.start_date + 'T00:00:00').toLocaleDateString('sv-SE', {
    month: 'long',
  })
}

function isFirstOpen(
  period: FiscalPeriod,
  allPeriods: FiscalPeriod[],
): boolean {
  const firstOpen = allPeriods.find((p) => p.is_closed === 0)
  return firstOpen?.id === period.id
}

export function MonthIndicator() {
  const { activeFiscalYear } = useFiscalYearContext()
  const { data: periods = [] } = useFiscalPeriods(activeFiscalYear?.id)

  if (periods.length === 0) return null

  return (
    <div className="mt-3">
      <div className="grid grid-cols-6 gap-1">
        {periods.map((period) => (
          <div
            key={period.id}
            className={`flex aspect-square items-center justify-center rounded text-[10px] font-medium ${
              period.is_closed === 1
                ? 'bg-green-100 text-green-700'
                : isFirstOpen(period, periods)
                  ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                  : 'bg-muted text-muted-foreground'
            }`}
            title={getMonthName(period)}
          >
            {getMonthLetter(period)}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-green-100" />
          Klar
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-blue-100 ring-1 ring-blue-300" />
          Aktiv
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-muted" />
          Öppen
        </span>
      </div>
    </div>
  )
}
