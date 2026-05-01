import { useState } from 'react'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import {
  useFiscalPeriods,
  useClosePeriod,
  useReopenPeriod,
} from '../../lib/hooks'
import { formatFiscalYearLabel } from '../layout/YearPicker'
import { Callout } from '../ui/Callout'
import { Pill } from '../ui/Pill'
import type { FiscalPeriod } from '../../../shared/types'

function getMonthName(period: FiscalPeriod): string {
  const name = new Date(period.start_date + 'T00:00:00').toLocaleDateString(
    'sv-SE',
    { month: 'long' },
  )
  return name.charAt(0).toUpperCase() + name.slice(1)
}

export function PeriodList() {
  const { activeFiscalYear, isReadOnly } = useFiscalYearContext()
  const { data: periods = [] } = useFiscalPeriods(activeFiscalYear?.id)
  const closePeriod = useClosePeriod(activeFiscalYear?.id)
  const reopenPeriod = useReopenPeriod(activeFiscalYear?.id)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  if (periods.length === 0) return null

  const firstOpenIndex = periods.findIndex((p) => p.is_closed === 0)
  const lastClosedIndex = periods.findLastIndex((p) => p.is_closed === 1)
  const allClosed = firstOpenIndex === -1

  const handleClose = (periodId: number) => {
    closePeriod.mutate({ period_id: periodId })
    setConfirmId(null)
  }

  const handleReopen = (periodId: number) => {
    reopenPeriod.mutate({ period_id: periodId })
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold">Månadsperioder</h2>
      <div className="space-y-1">
        {periods.map((period, idx) => {
          const monthName = getMonthName(period)
          const canClose = !isReadOnly && idx === firstOpenIndex
          const canReopen = !isReadOnly && idx === lastClosedIndex

          return (
            <div
              key={period.id}
              className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted/50"
            >
              <span>{monthName}</span>
              <div className="flex items-center gap-2">
                {period.is_closed === 1 ? (
                  <Pill variant="success" withDot>
                    Klar
                  </Pill>
                ) : (
                  <Pill variant="neutral" withDot>
                    Öppen
                  </Pill>
                )}
                {canClose && (
                  <button
                    onClick={() => setConfirmId(period.id)}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                  >
                    Stäng {monthName.toLowerCase()}
                  </button>
                )}
                {canReopen && (
                  <button
                    onClick={() => handleReopen(period.id)}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                  >
                    Öppna {monthName.toLowerCase()}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {allClosed && !isReadOnly && activeFiscalYear && (
        <div className="mt-4">
          <Callout variant="info" data-testid="all-closed">
            Alla månader för {formatFiscalYearLabel(activeFiscalYear)} är
            stängda. Du kan nu förbereda bokslut.
          </Callout>
        </div>
      )}

      {/* Bekräftelse-dialog */}
      {confirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-background p-6 shadow-lg">
            <h3 className="text-base font-semibold">
              Stäng {getMonthName(periods.find((p) => p.id === confirmId)!)}?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Inga nya transaktioner kan bokföras i denna månad efter detta. Du
              kan öppna månaden igen om det behövs.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmId(null)}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                Avbryt
              </button>
              <button
                onClick={() => handleClose(confirmId)}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              >
                Stäng månaden
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
