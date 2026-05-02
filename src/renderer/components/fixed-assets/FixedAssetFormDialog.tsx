import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import {
  DEPRECIATION_DEFAULTS,
  findDepreciationDefaults,
} from '../../../shared/depreciation-defaults'
import { useCreateFixedAsset, useUpdateFixedAsset } from '../../lib/hooks'
import { todayLocal } from '../../../shared/date-utils'
import { parseDecimal } from '../../../shared/money'
import type {
  CreateFixedAssetInput,
  DepreciationMethod,
  FixedAssetWithAccumulation,
} from '../../../shared/types'
import { errorIdFor } from '../../lib/a11y'
import { FieldError } from '../ui/FieldError'
import { Callout } from '../ui/Callout'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  initialAsset?: FixedAssetWithAccumulation
}

export function FixedAssetFormDialog({
  open,
  onOpenChange,
  mode,
  initialAsset,
}: Props) {
  const createMutation = useCreateFixedAsset()
  const updateMutation = useUpdateFixedAsset()

  const [name, setName] = useState(() =>
    mode === 'edit' && initialAsset ? initialAsset.name : '',
  )
  const [acquisitionDate, setAcquisitionDate] = useState(() =>
    mode === 'edit' && initialAsset
      ? initialAsset.acquisition_date
      : todayLocal(),
  )
  const [costKr, setCostKr] = useState(() =>
    mode === 'edit' && initialAsset
      ? (initialAsset.acquisition_cost_ore / 100).toFixed(2)
      : '',
  )
  const [residualKr, setResidualKr] = useState(() =>
    mode === 'edit' && initialAsset
      ? (initialAsset.residual_value_ore / 100).toFixed(2)
      : '0',
  )
  const [months, setMonths] = useState(() =>
    mode === 'edit' && initialAsset
      ? String(initialAsset.useful_life_months)
      : '36',
  )
  const [method, setMethod] = useState<DepreciationMethod>(() =>
    mode === 'edit' && initialAsset ? initialAsset.method : 'linear',
  )
  const [decliningRatePct, setDecliningRatePct] = useState(() =>
    mode === 'edit' && initialAsset?.declining_rate_bp
      ? String(initialAsset.declining_rate_bp / 100)
      : '30',
  )
  const [assetAccount, setAssetAccount] = useState(() =>
    mode === 'edit' && initialAsset ? initialAsset.account_asset : '1220',
  )
  const [accAccount, setAccAccount] = useState(() =>
    mode === 'edit' && initialAsset
      ? initialAsset.account_accumulated_depreciation
      : '1229',
  )
  const [expAccount, setExpAccount] = useState(() =>
    mode === 'edit' && initialAsset
      ? initialAsset.account_depreciation_expense
      : '7832',
  )
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)

  function resetForm() {
    setName('')
    setAcquisitionDate(todayLocal())
    setCostKr('')
    setResidualKr('0')
    setMonths('36')
    setMethod('linear')
    setDecliningRatePct('30')
    setAssetAccount('1220')
    setAccAccount('1229')
    setExpAccount('7832')
    setFieldErrors({})
    setFormError(null)
  }

  function handleAssetAccountChange(value: string) {
    setAssetAccount(value)
    if (mode === 'create') {
      const defaults = findDepreciationDefaults(value)
      if (defaults) {
        setAccAccount(defaults.accumulated)
        setExpAccount(defaults.expense)
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldErrors({})
    setFormError(null)

    const costOre = Math.round(parseDecimal(costKr) * 100)
    const residualOre = Math.round(parseDecimal(residualKr || '0') * 100)
    const monthsNum = parseInt(months, 10)

    if (!name.trim()) return setFormError('Namn krävs')
    if (!Number.isFinite(costOre) || costOre < 0)
      return setFieldErrors({ cost: 'Ange giltigt anskaffningsvärde' })
    if (residualOre > costOre)
      return setFieldErrors({
        residual: 'Restvärde kan inte överstiga anskaffningsvärde',
      })
    if (!Number.isFinite(monthsNum) || monthsNum < 1)
      return setFieldErrors({
        months: 'Nyttjandeperiod måste vara minst 1 månad',
      })

    const payload: CreateFixedAssetInput = {
      name: name.trim(),
      acquisition_date: acquisitionDate,
      acquisition_cost_ore: costOre,
      residual_value_ore: residualOre,
      useful_life_months: monthsNum,
      method,
      account_asset: assetAccount.trim(),
      account_accumulated_depreciation: accAccount.trim(),
      account_depreciation_expense: expAccount.trim(),
    }
    if (method === 'declining') {
      const ratePct = parseDecimal(decliningRatePct)
      if (!Number.isFinite(ratePct) || ratePct <= 0)
        return setFormError('Ange giltig degressiv ränta')
      payload.declining_rate_bp = Math.round(ratePct * 100)
    }

    try {
      if (mode === 'edit' && initialAsset) {
        const r = await updateMutation.mutateAsync({
          id: initialAsset.id,
          input: payload,
        })
        toast.success(
          `Tillgång uppdaterad — ${r.scheduleCount} schema-rader regenererade`,
        )
      } else {
        const r = await createMutation.mutateAsync(payload)
        toast.success(
          `Tillgång skapad — ${r.scheduleCount} schema-rader genererade`,
        )
        resetForm()
      }
      onOpenChange(false)
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Kunde inte spara tillgång'
      setFormError(msg)
    }
  }

  if (!open) return null

  const isEdit = mode === 'edit'
  const isPending = createMutation.isPending || updateMutation.isPending
  const title =
    isEdit && initialAsset
      ? `Redigera ${initialAsset.name}`
      : 'Ny anläggningstillgång'
  const submitLabel = isPending
    ? isEdit
      ? 'Sparar…'
      : 'Skapar…'
    : isEdit
      ? 'Spara ändringar'
      : 'Skapa tillgång'

  // VS-54: Migrerar till Radix Dialog (M156 + ADR 003) — manuell click-
  // outside + Escape-handling ersätts av Radix-primitives.
  return (
    <Dialog.Root open onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-lg focus:outline-none"
          aria-labelledby="fixed-asset-dialog-title"
          data-testid="fixed-asset-form-dialog"
        >
          <Dialog.Title
            id="fixed-asset-dialog-title"
            className="mb-4 text-lg font-semibold"
          >
            {title}
          </Dialog.Title>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="fa-name"
                className="mb-1 block text-sm font-medium"
              >
                Namn
              </label>
              <input
                id="fa-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                required
                data-testid="fa-name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="fa-date"
                  className="mb-1 block text-sm font-medium"
                >
                  Anskaffningsdatum
                </label>
                <input
                  id="fa-date"
                  type="date"
                  value={acquisitionDate}
                  onChange={(e) => setAcquisitionDate(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="fa-months"
                  className="mb-1 block text-sm font-medium"
                >
                  Nyttjandeperiod (månader)
                </label>
                <input
                  id="fa-months"
                  type="number"
                  min="1"
                  max="600"
                  value={months}
                  onChange={(e) => setMonths(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  required
                  aria-invalid={!!fieldErrors.months}
                  aria-describedby={
                    fieldErrors.months ? errorIdFor('fa-months') : undefined
                  }
                />
                {fieldErrors.months && (
                  <FieldError id={errorIdFor('fa-months')}>
                    {fieldErrors.months}
                  </FieldError>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="fa-cost"
                  className="mb-1 block text-sm font-medium"
                >
                  Anskaffningsvärde (kr)
                </label>
                <input
                  id="fa-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={costKr}
                  onChange={(e) => setCostKr(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  required
                  data-testid="fa-cost"
                  aria-invalid={!!fieldErrors.cost}
                  aria-describedby={
                    fieldErrors.cost ? errorIdFor('fa-cost') : undefined
                  }
                />
                {fieldErrors.cost && (
                  <FieldError id={errorIdFor('fa-cost')}>
                    {fieldErrors.cost}
                  </FieldError>
                )}
              </div>
              <div>
                <label
                  htmlFor="fa-residual"
                  className="mb-1 block text-sm font-medium"
                >
                  Restvärde (kr)
                </label>
                <input
                  id="fa-residual"
                  type="number"
                  step="0.01"
                  min="0"
                  value={residualKr}
                  onChange={(e) => setResidualKr(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  aria-invalid={!!fieldErrors.residual}
                  aria-describedby={
                    fieldErrors.residual ? errorIdFor('fa-residual') : undefined
                  }
                />
                {fieldErrors.residual && (
                  <FieldError id={errorIdFor('fa-residual')}>
                    {fieldErrors.residual}
                  </FieldError>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="fa-method"
                className="mb-1 block text-sm font-medium"
              >
                Avskrivningsmetod
              </label>
              <select
                id="fa-method"
                value={method}
                onChange={(e) =>
                  setMethod(e.target.value as DepreciationMethod)
                }
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="linear">Linjär</option>
                <option value="declining">Degressiv (räknesats)</option>
              </select>
            </div>

            {method === 'declining' && (
              <div>
                <label
                  htmlFor="fa-rate"
                  className="mb-1 block text-sm font-medium"
                >
                  Avskrivningssats (% per år)
                </label>
                <input
                  id="fa-rate"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="100"
                  value={decliningRatePct}
                  onChange={(e) => setDecliningRatePct(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>
            )}

            <fieldset className="rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">
                Bokföringskonton
              </legend>
              <p className="mb-2 text-xs text-muted-foreground">
                {isEdit
                  ? 'Att byta BAS-konto rekommenderas bara om ursprungligt konto blivit inaktivt.'
                  : `Välj kontoklass från BAS-kontoplanen. Defaults sätts automatiskt via ${DEPRECIATION_DEFAULTS.length} vanliga mappningar.`}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label
                    htmlFor="fa-asset-account"
                    className="mb-1 block text-xs font-medium"
                  >
                    Anskaffning
                  </label>
                  <input
                    id="fa-asset-account"
                    value={assetAccount}
                    onChange={(e) => handleAssetAccountChange(e.target.value)}
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    list="fa-asset-accounts"
                  />
                  <datalist id="fa-asset-accounts">
                    {DEPRECIATION_DEFAULTS.map((d) => (
                      <option key={d.asset} value={d.asset}>
                        {d.label}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div>
                  <label
                    htmlFor="fa-acc-account"
                    className="mb-1 block text-xs font-medium"
                  >
                    Ack. avskrivningar
                  </label>
                  <input
                    id="fa-acc-account"
                    value={accAccount}
                    onChange={(e) => setAccAccount(e.target.value)}
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="fa-exp-account"
                    className="mb-1 block text-xs font-medium"
                  >
                    Avskrivningskostnad
                  </label>
                  <input
                    id="fa-exp-account"
                    value={expAccount}
                    onChange={(e) => setExpAccount(e.target.value)}
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
            </fieldset>

            {formError && <Callout variant="danger">{formError}</Callout>}

            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-md border px-4 py-2 text-sm"
                >
                  Avbryt
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                data-testid="fa-submit"
              >
                {submitLabel}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
