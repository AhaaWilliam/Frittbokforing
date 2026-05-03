import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { useActivePeriodOptional } from '../../contexts/ActivePeriodContext'
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

function getStateLabel(
  period: FiscalPeriod,
  highlightedId: number | undefined,
): string {
  if (period.is_closed === 1) return 'klar'
  if (highlightedId === period.id) return 'aktiv månad'
  return 'öppen'
}

export function MonthIndicator() {
  const { activeFiscalYear } = useFiscalYearContext()
  const { data: periods = [] } = useFiscalPeriods(activeFiscalYear?.id)
  // VS-144: Page-driven override. När en page satt activePeriodId via
  // useSetActivePeriod highlightas den perioden i sidebar; annars
  // härleds från första öppna period i FY (default-beteende).
  const activePeriod = useActivePeriodOptional()

  if (periods.length === 0) return null

  // VS-101: Pre-räkna highlight-id en gång istället för O(n²) find per cell.
  const overrideId = activePeriod?.activePeriodId ?? null
  const overrideMatchesFy =
    overrideId !== null && periods.some((p) => p.id === overrideId)
  const highlightedId = overrideMatchesFy
    ? (overrideId ?? undefined)
    : periods.find((p) => p.is_closed === 0)?.id

  return (
    <div className="mt-3">
      <div
        className="grid grid-cols-6 gap-1"
        role="list"
        aria-label="Månader i räkenskapsåret"
      >
        {periods.map((period) => {
          const monthName = getMonthName(period)
          const stateLabel = getStateLabel(period, highlightedId)
          return (
            <div
              key={period.id}
              role="listitem"
              aria-label={`${monthName}, ${stateLabel}`}
              className={`flex aspect-square items-center justify-center rounded text-[10px] font-medium ${
                period.is_closed === 1
                  ? 'bg-success-100 text-success-700'
                  : highlightedId === period.id
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
