import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useFiscalYearContext } from '../contexts/FiscalYearContext'
import {
  useAccrualSchedules,
  useExecuteAccrual,
  useExecuteAllAccruals,
  useDeactivateAccrual,
  useFiscalPeriods,
} from '../lib/hooks'
import { PageHeader } from '../components/layout/PageHeader'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { CreateAccrualDialog } from '../components/accruals/CreateAccrualDialog'
import { ScheduleCard } from '../components/accruals/ScheduleCard'

export function PageAccruals() {
  const { activeFiscalYear } = useFiscalYearContext()
  const [showCreate, setShowCreate] = useState(false)
  const [showExecuteAllPreview, setShowExecuteAllPreview] = useState<
    number | null
  >(null)
  const { data: schedules, isLoading } = useAccrualSchedules(
    activeFiscalYear?.id,
  )
  const { data: periods } = useFiscalPeriods(activeFiscalYear?.id)
  const periodCount = periods?.length ?? 12
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
      await executeMutation.mutateAsync({
        schedule_id: scheduleId,
        period_number: periodNumber,
      })
      toast.success(`Period ${periodNumber} bokförd`)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Kunde inte köra periodisering',
      )
    }
  }

  // Beräkna preview för givet period-nummer — vilka scheman skulle köras + belopp.
  function getExecuteAllPreview(periodNumber: number) {
    if (!schedules) return []
    return schedules
      .filter((s) => s.is_active === 1)
      .map((s) => {
        const ps = s.periodStatuses.find((p) => p.periodNumber === periodNumber)
        return ps && !ps.executed
          ? {
              scheduleId: s.id,
              description: s.description,
              amountOre: ps.amountOre,
            }
          : null
      })
      .filter(
        (
          x,
        ): x is {
          scheduleId: number
          description: string
          amountOre: number
        } => x !== null,
      )
  }

  async function handleExecuteAllConfirmed(periodNumber: number) {
    if (!activeFiscalYear) return
    setShowExecuteAllPreview(null)
    try {
      const result = await executeAllMutation.mutateAsync({
        fiscal_year_id: activeFiscalYear.id,
        period_number: periodNumber,
      })
      if (result.failed.length === 0) {
        toast.success(
          `${result.executed} periodiseringar körda för period ${periodNumber}`,
        )
      } else {
        toast.warning(
          `${result.executed} av ${result.executed + result.failed.length} körda`,
        )
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Kunde inte köra periodiseringar',
      )
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
                onClick={() => setShowExecuteAllPreview(nextGlobalPeriod)}
                disabled={executeAllMutation.isPending}
                className="rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
                data-testid="accrual-execute-all"
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
        periodCount={periodCount}
      />

      {/* VS-56: Migrerar till Radix Dialog (M156 + ADR 003). */}
      <Dialog.Root
        open={showExecuteAllPreview !== null}
        onOpenChange={(o) => {
          if (!o) setShowExecuteAllPreview(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-lg focus:outline-none"
            data-testid="accrual-preview-dialog"
          >
            <Dialog.Title
              id="exec-all-preview-title"
              className="mb-3 text-lg font-semibold"
            >
              Kör alla periodiseringar — Period {showExecuteAllPreview}
            </Dialog.Title>
            {showExecuteAllPreview !== null &&
              (() => {
                const preview = getExecuteAllPreview(showExecuteAllPreview)
                if (preview.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground">
                      Inga periodiseringar att köra.
                    </p>
                  )
                }
                const total = preview.reduce((s, p) => s + p.amountOre, 0)
                return (
                  <>
                    <p className="mb-3 text-sm text-muted-foreground">
                      Följande {preview.length} periodiseringar kommer bokföras
                      som separata C-serie-verifikat:
                    </p>
                    <ul className="mb-4 max-h-60 overflow-auto rounded border text-sm">
                      {preview.map((p) => (
                        <li
                          key={p.scheduleId}
                          className="flex items-center justify-between border-b px-3 py-2 last:border-b-0"
                        >
                          <span className="truncate">{p.description}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {new Intl.NumberFormat('sv-SE', {
                              style: 'currency',
                              currency: 'SEK',
                            }).format(p.amountOre / 100)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="mb-4 flex justify-between border-t pt-2 text-sm font-medium">
                      <span>Total</span>
                      <span className="tabular-nums">
                        {new Intl.NumberFormat('sv-SE', {
                          style: 'currency',
                          currency: 'SEK',
                        }).format(total / 100)}
                      </span>
                    </div>
                  </>
                )
              })()}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md border px-4 py-2 text-sm"
                >
                  Avbryt
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={() =>
                  showExecuteAllPreview !== null &&
                  handleExecuteAllConfirmed(showExecuteAllPreview)
                }
                disabled={executeAllMutation.isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                data-testid="accrual-preview-confirm"
              >
                {executeAllMutation.isPending ? 'Kör…' : 'Bekräfta'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
