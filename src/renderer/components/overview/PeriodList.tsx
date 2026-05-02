import { useState } from 'react'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import {
  useFiscalPeriods,
  useReopenPeriod,
  usePeriodChecks,
} from '../../lib/hooks'
import { formatFiscalYearLabel } from '../layout/YearPicker'
import { Callout } from '../ui/Callout'
import { CloseMonthDialog } from '../period/CloseMonthDialog'
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
  const reopenPeriod = useReopenPeriod(activeFiscalYear?.id)
  const [closeDialogId, setCloseDialogId] = useState<number | null>(null)

  const firstOpenIndex = periods.findIndex((p) => p.is_closed === 0)
  const lastClosedIndex = periods.findLastIndex((p) => p.is_closed === 1)
  const allClosed = firstOpenIndex === -1
  const firstOpenPeriod =
    firstOpenIndex === -1 ? undefined : periods[firstOpenIndex]
  // VS-122: pre-fetcha advisory-checks för första öppna period så
  // ChecksBadge kan visa status utan att vänta tills användaren öppnar
  // CloseMonthDialog.
  const { data: firstOpenChecks } = usePeriodChecks(firstOpenPeriod?.id)

  if (periods.length === 0) return null

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
                {/* VS-122: status-prick för advisory-checks visas bara på
                    första öppna period (den enda som kan stängas). */}
                {idx === firstOpenIndex && firstOpenChecks && (
                  <Pill
                    variant={firstOpenChecks.allOk ? 'success' : 'warning'}
                    size="xs"
                    withDot
                    className=""
                  >
                    <span data-testid={`period-checks-status-${period.id}`}>
                      {firstOpenChecks.allOk
                        ? 'Klar för stängning'
                        : 'Varningar'}
                    </span>
                  </Pill>
                )}
                {canClose && (
                  <button
                    type="button"
                    onClick={() => setCloseDialogId(period.id)}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                  >
                    Stäng {monthName.toLowerCase()}
                  </button>
                )}
                {canReopen && (
                  <button
                    type="button"
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

      {/* VS-116: CloseMonthDialog ersätter ConfirmDialog så bokförare-läget
          får samma advisory-checks som Vardag-läget (M156 + Stäng månad-flow). */}
      <CloseMonthDialog
        open={closeDialogId !== null}
        onClose={() => setCloseDialogId(null)}
        periodIdOverride={closeDialogId ?? undefined}
      />
    </div>
  )
}
