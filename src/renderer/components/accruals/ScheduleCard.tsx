import { formatKr } from '../../lib/format'
import type { AccrualScheduleWithStatus } from '../../../shared/types'
import { TYPE_BADGE, TYPE_LABELS } from './accrual-constants'
import { Pill } from '../ui/Pill'

export function ScheduleCard({
  schedule,
  onExecute,
  onDeactivate,
  isExecuting,
}: {
  schedule: AccrualScheduleWithStatus
  onExecute: (scheduleId: number, periodNumber: number) => void
  onDeactivate: (scheduleId: number) => void
  isExecuting: boolean
}) {
  const badge = TYPE_BADGE[schedule.accrual_type] ?? {
    bg: 'bg-neutral-200',
    text: 'text-neutral-700',
  }
  const progressPct =
    schedule.period_count > 0
      ? Math.round((schedule.executedCount / schedule.period_count) * 100)
      : 0
  const nextPeriod = schedule.periodStatuses.find((p) => !p.executed)

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium">{schedule.description}</h3>
          <span
            className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.bg} ${badge.text}`}
          >
            {TYPE_LABELS[schedule.accrual_type]}
          </span>
        </div>
        <div className="text-right text-sm">
          <div className="font-medium">
            {formatKr(schedule.total_amount_ore)}
          </div>
          <div className="text-xs text-muted-foreground">
            {schedule.balance_account} / {schedule.result_account}
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {schedule.executedCount} av {schedule.period_count} perioder körda
          </span>
          <span>
            P{schedule.start_period}–P
            {schedule.start_period + schedule.period_count - 1}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted">
          <div
            className="h-2 rounded-full bg-primary transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Period badges */}
      <div className="mb-3 flex flex-wrap gap-1">
        {schedule.periodStatuses.map((p) => (
          <Pill
            key={p.periodNumber}
            variant={p.executed ? 'success' : 'neutral'}
            size="xs"
          >
            P{p.periodNumber}
          </Pill>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {nextPeriod && schedule.is_active === 1 && (
          <button
            type="button"
            onClick={() => onExecute(schedule.id, nextPeriod.periodNumber)}
            disabled={isExecuting}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Kör P{nextPeriod.periodNumber}
          </button>
        )}
        {schedule.is_active === 1 && (
          <button
            type="button"
            onClick={() => onDeactivate(schedule.id)}
            className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            Avaktivera
          </button>
        )}
        {schedule.is_active === 0 && (
          <span className="text-xs text-muted-foreground">Inaktiv</span>
        )}
      </div>
    </div>
  )
}
