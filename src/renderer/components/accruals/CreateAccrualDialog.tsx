import { useState } from 'react'
import { toast } from 'sonner'
import { useCreateAccrual, useAccounts } from '../../lib/hooks'
import type { AccrualType } from '../../../shared/types'
import { ACCRUAL_TYPES, kronorToOre } from './accrual-constants'

export function CreateAccrualDialog({
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
  const { data: balanceAccounts } = useAccounts(
    fiscalRule as 'K2' | 'K3',
    undefined,
    true,
  )

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
      toast.error(
        err instanceof Error ? err.message : 'Kunde inte skapa periodisering',
      )
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
            <label
              htmlFor="accrual-description"
              className="mb-1 block text-sm font-medium"
            >
              Beskrivning
            </label>
            <input
              id="accrual-description"
              type="text"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="T.ex. Förutbetald hyra 2025"
            />
          </div>

          <div>
            <label
              htmlFor="accrual-type"
              className="mb-1 block text-sm font-medium"
            >
              Typ
            </label>
            <select
              id="accrual-type"
              value={form.accrual_type}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  accrual_type: e.target.value as AccrualType,
                }))
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {ACCRUAL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="accrual-balance-account"
                className="mb-1 block text-sm font-medium"
              >
                Balanskonto (klass 1–2)
              </label>
              <input
                id="accrual-balance-account"
                type="text"
                value={form.balance_account}
                onChange={(e) =>
                  setForm((f) => ({ ...f, balance_account: e.target.value }))
                }
                required
                placeholder="1710"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {form.balance_account && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {getAccountName(form.balance_account)}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="accrual-result-account"
                className="mb-1 block text-sm font-medium"
              >
                Resultatkonto (klass 3–8)
              </label>
              <input
                id="accrual-result-account"
                type="text"
                value={form.result_account}
                onChange={(e) =>
                  setForm((f) => ({ ...f, result_account: e.target.value }))
                }
                required
                placeholder="5010"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {form.result_account && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {getAccountName(form.result_account)}
                </p>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="accrual-amount"
              className="mb-1 block text-sm font-medium"
            >
              Totalbelopp (kr)
            </label>
            <input
              id="accrual-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={form.amount_kr}
              onChange={(e) =>
                setForm((f) => ({ ...f, amount_kr: e.target.value }))
              }
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="accrual-start-period"
                className="mb-1 block text-sm font-medium"
              >
                Startperiod
              </label>
              <select
                id="accrual-start-period"
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
                  <option key={p} value={p}>
                    Period {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="accrual-period-count"
                className="mb-1 block text-sm font-medium"
              >
                Antal perioder
              </label>
              <select
                id="accrual-period-count"
                value={form.period_count}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    period_count: parseInt(e.target.value, 10),
                  }))
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {Array.from(
                  { length: Math.max(maxPeriods - 1, 1) },
                  (_, i) => i + 2,
                ).map((n) => (
                  <option key={n} value={n}>
                    {n} perioder
                  </option>
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
