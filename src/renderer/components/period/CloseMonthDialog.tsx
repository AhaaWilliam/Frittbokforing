/**
 * CloseMonthDialog — Sprint VS-114.
 *
 * Modal som visas när användaren klickar "Stäng månad" i Vardag-läget
 * eller i bokförare-perioder-vyn. Visar de fyra status-checkarna från
 * VS-113 (period-checks-service) med ikon per check och en sammanfattnings-
 * panel. Användaren kan stänga månaden även med warning ("advisory")
 * — knappen byter label till "Stäng ändå" när det finns warnings.
 *
 * Period väljs automatiskt: senaste öppna period vars datum-range
 * innehåller `getNow()`, eller första öppna period som fallback.
 */
import { useMemo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { CheckCircle, AlertTriangle, MinusCircle, X } from 'lucide-react'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import {
  useFiscalPeriods,
  useClosePeriod,
  usePeriodChecks,
} from '../../lib/hooks'
import { Button } from '../ui/Button'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { todayLocal } from '../../lib/format'
import { toast } from 'sonner'
import type { FiscalPeriod } from '../../../shared/types'

interface Props {
  open: boolean
  onClose: () => void
  /** Override för aktiv period; default = senaste öppna som täcker idag. */
  periodIdOverride?: number
}

function pickActivePeriod(periods: FiscalPeriod[]): FiscalPeriod | null {
  const today = todayLocal()
  // Hitta öppen period som täcker idag.
  const containingToday = periods.find(
    (p) => !p.is_closed && p.start_date <= today && today <= p.end_date,
  )
  if (containingToday) return containingToday
  // Annars: första öppna period sorterad på start_date stigande.
  const open = periods
    .filter((p) => !p.is_closed)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
  return open[0] ?? null
}

const CHECK_LABELS: Record<string, string> = {
  bankReconciliation: 'Bankavstämning',
  salaryBooked: 'Lön bokförd',
  vatReportReady: 'Moms-rapport preliminärt klar',
  supplierPayments: 'Leverantörsbetalningar',
}

function CheckIcon({ status }: { status: 'ok' | 'warning' | 'na' }) {
  if (status === 'ok')
    return (
      <CheckCircle
        className="h-4 w-4 text-[var(--color-mint-600)]"
        aria-hidden="true"
      />
    )
  if (status === 'warning')
    return (
      <AlertTriangle
        className="h-4 w-4 text-[var(--color-warning-600)]"
        aria-hidden="true"
      />
    )
  return (
    <MinusCircle
      className="h-4 w-4 text-[var(--text-faint)]"
      aria-hidden="true"
    />
  )
}

export function CloseMonthDialog({ open, onClose, periodIdOverride }: Props) {
  const { activeFiscalYear } = useFiscalYearContext()
  const { data: periodsRaw } = useFiscalPeriods(activeFiscalYear?.id)
  const periods = periodsRaw ?? []
  const closePeriodMutation = useClosePeriod(activeFiscalYear?.id)

  const activePeriod = useMemo(() => {
    if (periodIdOverride) {
      return periods.find((p) => p.id === periodIdOverride) ?? null
    }
    return pickActivePeriod(periods)
  }, [periods, periodIdOverride])

  const { data: checks, isLoading } = usePeriodChecks(activePeriod?.id)

  async function handleClose() {
    if (!activePeriod) return
    try {
      await closePeriodMutation.mutateAsync({ period_id: activePeriod.id })
      toast.success(`${formatPeriodLabel(activePeriod)} stängd`)
      onClose()
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Kunde inte stänga perioden'
      toast.error(msg)
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 w-[480px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-[var(--surface-elevated)] p-6 shadow-2xl"
          data-testid="close-month-dialog"
        >
          <div className="mb-4 flex items-start justify-between">
            <div>
              <Dialog.Title className="font-serif text-lg">
                Stäng månad
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-sm text-[var(--text-secondary)]">
                {activePeriod
                  ? formatPeriodLabel(activePeriod)
                  : 'Ingen öppen period'}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="text-[var(--text-faint)] hover:text-[var(--text-primary)]"
                aria-label="Stäng"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          {!activePeriod ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Det finns ingen öppen period att stänga i nuvarande räkenskapsår.
            </p>
          ) : isLoading || !checks ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : (
            <>
              <ul className="mb-4 space-y-2 text-sm" data-testid="checks-list">
                {(
                  [
                    'bankReconciliation',
                    'salaryBooked',
                    'vatReportReady',
                    'supplierPayments',
                  ] as const
                ).map((key) => {
                  const c = checks[key]
                  return (
                    <li
                      key={key}
                      className="flex items-start gap-2"
                      data-testid={`check-${key}`}
                    >
                      <span className="mt-0.5">
                        <CheckIcon status={c.status} />
                      </span>
                      <span className="flex-1">
                        <span className="font-medium">{CHECK_LABELS[key]}</span>
                        <span className="block text-xs text-[var(--text-secondary)]">
                          {c.detail}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>

              {!checks.allOk && (
                <p className="mb-4 rounded-md bg-[var(--color-warning-100)] p-3 text-xs text-[var(--text-primary)]">
                  En eller flera checks visar varning. Du kan stänga månaden
                  ändå — kontrollera först att inget kritiskt saknas.
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={onClose}>
                  Avbryt
                </Button>
                <Button
                  variant={checks.allOk ? 'primary' : 'warning'}
                  onClick={handleClose}
                  isLoading={closePeriodMutation.isPending}
                  data-testid="close-month-confirm"
                >
                  {checks.allOk ? 'Stäng månad' : 'Stäng ändå'}
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function formatPeriodLabel(period: FiscalPeriod): string {
  // Period-numret är 1-13, men för visning visar vi månadsnamn baserat på
  // start_date. Hanterar både "vanlig" period (en månad) och stub/förlängd
  // (kan börja mid-månad).
  const start = new Date(period.start_date)
  const end = new Date(period.end_date)
  const sameMonth =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth()
  const month = start.toLocaleDateString('sv-SE', {
    year: 'numeric',
    month: 'long',
  })
  if (sameMonth) {
    const m = month.charAt(0).toUpperCase() + month.slice(1)
    return m
  }
  return `${period.start_date} – ${period.end_date}`
}
