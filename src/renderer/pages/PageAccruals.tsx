import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useFiscalYearContext } from '../contexts/FiscalYearContext'
import {
  useAccrualSchedules,
  useExecuteAccrual,
  useExecuteAllAccruals,
  useDeactivateAccrual,
} from '../lib/hooks'
import { PageHeader } from '../components/layout/PageHeader'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { CreateAccrualDialog } from '../components/accruals/CreateAccrualDialog'
import { ScheduleCard } from '../components/accruals/ScheduleCard'

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
    <div className="flex flex-1 flex-col overflow-hidden">
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
