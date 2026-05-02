import { useState } from 'react'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import {
  useFiscalPeriods,
  useClosePeriod,
  useReopenPeriod,
} from '../../lib/hooks'
import { formatFiscalYearLabel } from '../layout/YearPicker'
import { Callout } from '../ui/Callout'
import { ConfirmDialog } from '../ui/ConfirmDialog'
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
                    type="button"
                    onClick={() => setConfirmId(period.id)}
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

      {/* VS-49: ConfirmDialog (Radix AlertDialog) ersätter custom modal —
          a11y-rätt focus-trap, escape-stäng, och 'dark'-variant signalerar
          period-låsning som irreversibel action (M156 + ADR 003). */}
      <ConfirmDialog
        open={confirmId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmId(null)
        }}
        title={
          confirmId !== null
            ? `Stäng ${getMonthName(periods.find((p) => p.id === confirmId)!)}?`
            : ''
        }
        description="Inga nya transaktioner kan bokföras i denna månad efter detta. Du kan öppna månaden igen om det behövs."
        confirmLabel="Stäng månaden"
        variant="dark"
        onConfirm={() => {
          if (confirmId !== null) handleClose(confirmId)
        }}
      />
    </div>
  )
}
