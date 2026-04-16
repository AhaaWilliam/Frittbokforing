import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useFiscalYearContext } from '../contexts/FiscalYearContext'
import {
  useAccrualSchedules,
  useCreateAccrual,
  useExecuteAccrual,
  useExecuteAllAccruals,
  useDeactivateAccrual,
  useAccounts,
} from '../lib/hooks'
import { formatKr } from '../lib/format'
import { PageHeader } from '../components/layout/PageHeader'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import type { AccrualScheduleWithStatus, AccrualType, CreateAccrualScheduleInput } from '../../shared/types'

const ACCRUAL_TYPES: { value: AccrualType; label: string }[] = [
  { value: 'prepaid_expense', label: 'Förutbetald kostnad' },
  { value: 'accrued_expense', label: 'Upplupen kostnad' },
  { value: 'prepaid_income', label: 'Förutbetald intäkt' },
  { value: 'accrued_income', label: 'Upplupen intäkt' },
]

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ACCRUAL_TYPES.map((t) => [t.value, t.label]),
)

const TYPE_BADGE: Record<string, { bg: string; text: string }> = {
  prepaid_expense: { bg: 'bg-blue-100', text: 'text-blue-700' },
  accrued_expense: { bg: 'bg-orange-100', text: 'text-orange-700' },
  prepaid_income: { bg: 'bg-purple-100', text: 'text-purple-700' },
  accrued_income: { bg: 'bg-teal-100', text: 'text-teal-700' },
}

function kronorToOre(kr: string): number {
  const n = parseFloat(kr)
  return isNaN(n) ? 0 : Math.round(n * 100)
}

// ═══ Create Dialog ═══

function CreateAccrualDialog({
  open,
  onOpenChange,
  fiscalYearId,
  fiscalRule,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  fiscalYearId: number
  fiscalRule: string
}) {
  const createMutation = useCreateAccrual()
  const { data: balanceAccounts } = useAccounts(fiscalRule as 'K2' | 'K3', undefined, true)

  const [form, setForm] = useState({
    description: '',
    accrual_type: 'prepaid_expense' as AccrualType,
    balance_account: '',
    result_account: '',
    amount_kr: '',
    period_count: 3,
    start_period: 1,
  })

  if (!open) return null

  const maxPeriods = 12 - form.start_period + 1

  function getAccountName(accountNumber: string): string {
    if (!balanceAccounts || !accountNumber) return ''
    const acc = balanceAccounts.find((a) => a.account_number === accountNumber)
    return acc ? acc.name : ''
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const totalOre = kronorToOre(form.amount_kr)
    if (totalOre <= 0) {
      toast.error('Belopp måste vara positivt')
      return
    }

    try {
      await createMutation.mutateAsync({
        fiscal_year_id: fiscalYearId,
        description: form.description,
        accrual_type: form.accrual_type,
        balance_account: form.balance_account,
        result_account: form.result_account,
        total_amount_ore: totalOre,
        period_count: form.period_count,
        start_period: form.start_period,
      })
      toast.success('Periodiseringsschema skapat')
      onOpenChange(false)
      setForm({
        description: '',
        accrual_type: 'prepaid_expense',
        balance_account: '',
        result_account: '',
        amount_kr: '',
        period_count: 3,
        start_period: 1,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kunde inte skapa periodisering')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-accrual-title"
        className="w-full max-w-lg rounded-lg bg-background p-6 shadow-xl"
      >
        <h2 id="create-accrual-title" className="mb-4 text-base font-semibold">
          Ny periodisering
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Beskrivning</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="T.ex. Förutbetald hyra 2025"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Typ</label>
            <select
              value={form.accrual_type}
              onChange={(e) => setForm((f) => ({ ...f, accrual_type: e.target.value as AccrualType }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {ACCRUAL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Balanskonto (klass 1–2)</label>
              <input
                type="text"
                value={form.balance_account}
                onChange={(e) => setForm((f) => ({ ...f, balance_account: e.target.value }))}
                required
                placeholder="1710"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {form.balance_account && (
                <p className="mt-0.5 text-xs text-muted-foreground">{getAccountName(form.balance_account)}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Resultatkonto (klass 3–8)</label>
              <input
                type="text"
                value={form.result_account}
                onChange={(e) => setForm((f) => ({ ...f, result_account: e.target.value }))}
                required
                placeholder="5010"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {form.result_account && (
                <p className="mt-0.5 text-xs text-muted-foreground">{getAccountName(form.result_account)}</p>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Totalbelopp (kr)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form.amount_kr}
              onChange={(e) => setForm((f) => ({ ...f, amount_kr: e.target.value }))}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Startperiod</label>
              <select
                value={form.start_period}
                onChange={(e) => {
                  const sp = parseInt(e.target.value, 10)
                  setForm((f) => ({
                    ...f,
                    start_period: sp,
                    period_count: Math.min(f.period_count, 12 - sp + 1),
                  }))
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {Array.from({ length: 11 }, (_, i) => i + 1).map((p) => (
                  <option key={p} value={p}>Period {p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Antal perioder</label>
              <select
                value={form.period_count}
                onChange={(e) => setForm((f) => ({ ...f, period_count: parseInt(e.target.value, 10) }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {Array.from({ length: Math.max(maxPeriods - 1, 1) }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>{n} perioder</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Avbryt
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Skapar...' : 'Skapa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ═══ Schedule Card ═══

function ScheduleCard({
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
  const badge = TYPE_BADGE[schedule.accrual_type] ?? { bg: 'bg-gray-100', text: 'text-gray-700' }
  const progressPct = schedule.period_count > 0
    ? Math.round((schedule.executedCount / schedule.period_count) * 100)
    : 0
  const nextPeriod = schedule.periodStatuses.find((p) => !p.executed)

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium">{schedule.description}</h3>
          <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.bg} ${badge.text}`}>
            {TYPE_LABELS[schedule.accrual_type]}
          </span>
        </div>
        <div className="text-right text-sm">
          <div className="font-medium">{formatKr(schedule.total_amount_ore)}</div>
          <div className="text-xs text-muted-foreground">
            {schedule.balance_account} / {schedule.result_account}
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>{schedule.executedCount} av {schedule.period_count} perioder körda</span>
          <span>P{schedule.start_period}–P{schedule.start_period + schedule.period_count - 1}</span>
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
          <span
            key={p.periodNumber}
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
              p.executed
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            P{p.periodNumber}
          </span>
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

// ═══ Page ═══

export function PageAccruals() {
  const { activeFiscalYear } = useFiscalYearContext()
  const [showCreate, setShowCreate] = useState(false)
  const { data: schedules, isLoading } = useAccrualSchedules(activeFiscalYear?.id)
  const executeMutation = useExecuteAccrual()
  const executeAllMutation = useExecuteAllAccruals()
  const deactivateMutation = useDeactivateAccrual()

  if (!activeFiscalYear) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Inget räkenskapsår valt.
      </div>
    )
  }

  async function handleExecute(scheduleId: number, periodNumber: number) {
    try {
      await executeMutation.mutateAsync({ schedule_id: scheduleId, period_number: periodNumber })
      toast.success(`Period ${periodNumber} bokförd`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kunde inte köra periodisering')
    }
  }

  async function handleExecuteAll(periodNumber: number) {
    if (!activeFiscalYear) return
    try {
      const result = await executeAllMutation.mutateAsync({
        fiscal_year_id: activeFiscalYear.id,
        period_number: periodNumber,
      })
      if (result.failed.length === 0) {
        toast.success(`${result.executed} periodiseringar körda för period ${periodNumber}`)
      } else {
        toast.warning(`${result.executed} av ${result.executed + result.failed.length} körda`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kunde inte köra periodiseringar')
    }
  }

  async function handleDeactivate(scheduleId: number) {
    try {
      await deactivateMutation.mutateAsync({ schedule_id: scheduleId })
      toast.success('Periodiseringsschema avaktiverat')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kunde inte avaktivera')
    }
  }

  // Find next executable period across all active schedules
  const nextGlobalPeriod = schedules
    ?.filter((s) => s.is_active === 1)
    .flatMap((s) => s.periodStatuses.filter((p) => !p.executed))
    .sort((a, b) => a.periodNumber - b.periodNumber)[0]?.periodNumber

  return (
    <div className="flex flex-1 flex-col overflow-hidden" data-testid="page-accruals">
      <PageHeader
        title="Periodiseringar"
        action={
          <div className="flex items-center gap-2">
            {nextGlobalPeriod && (
              <button
                type="button"
                onClick={() => handleExecuteAll(nextGlobalPeriod)}
                disabled={executeAllMutation.isPending}
                className="rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Kör alla (P{nextGlobalPeriod})
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Ny periodisering
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto px-6 pb-6">
        {isLoading ? (
          <LoadingSpinner />
        ) : !schedules || schedules.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Inga periodiseringsscheman. Skapa ett för att komma igång.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {schedules.map((s) => (
              <ScheduleCard
                key={s.id}
                schedule={s}
                onExecute={handleExecute}
                onDeactivate={handleDeactivate}
                isExecuting={executeMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>

      <CreateAccrualDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        fiscalYearId={activeFiscalYear.id}
        fiscalRule="K2"
      />
    </div>
  )
}
