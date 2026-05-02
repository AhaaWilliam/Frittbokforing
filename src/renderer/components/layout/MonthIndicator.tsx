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

function getStateLabel(
  period: FiscalPeriod,
  allPeriods: FiscalPeriod[],
): string {
  if (period.is_closed === 1) return 'klar'
  if (isFirstOpen(period, allPeriods)) return 'aktiv månad'
  return 'öppen'
}

export function MonthIndicator() {
  const { activeFiscalYear } = useFiscalYearContext()
  const { data: periods = [] } = useFiscalPeriods(activeFiscalYear?.id)

  if (periods.length === 0) return null

  // VS-101: Pre-räkna firstOpen-id en gång istället för O(n²) find per cell.
  const firstOpenId = periods.find((p) => p.is_closed === 0)?.id

  return (
    <div className="mt-3">
      <div
        className="grid grid-cols-6 gap-1"
        role="list"
        aria-label="Månader i räkenskapsåret"
      >
        {periods.map((period) => {
          const monthName = getMonthName(period)
          const stateLabel = getStateLabel(period, periods)
          return (
            <div
              key={period.id}
              role="listitem"
              aria-label={`${monthName}, ${stateLabel}`}
              className={`flex aspect-square items-center justify-center rounded text-[10px] font-medium ${
                period.is_closed === 1
                  ? 'bg-success-100 text-success-700'
                  : firstOpenId === period.id
                    ? 'bg-info-100 text-info-700 ring-1 ring-info-500'
                    : 'bg-muted text-muted-foreground'
              }`}
              title={monthName}
            >
              <span aria-hidden="true">{getMonthLetter(period)}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-success-100" />
          Klar
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-info-100 ring-1 ring-info-500" />
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
