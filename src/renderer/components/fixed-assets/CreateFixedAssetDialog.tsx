import { useState } from 'react'
import { toast } from 'sonner'
import { DEPRECIATION_DEFAULTS, findDepreciationDefaults } from '../../../shared/depreciation-defaults'
import { useCreateFixedAsset } from '../../lib/hooks'
import type { CreateFixedAssetInput, DepreciationMethod } from '../../../shared/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Minimal inline-dialog för att skapa en anläggningstillgång.
 * Form använder `_kr`-suffix i state och konverterar till öre vid submit (M136).
 */
export function CreateFixedAssetDialog({ open, onOpenChange }: Props) {
  const createMutation = useCreateFixedAsset()
  const [name, setName] = useState('')
  const [acquisitionDate, setAcquisitionDate] = useState(new Date().toISOString().slice(0, 10))
  const [costKr, setCostKr] = useState('')
  const [residualKr, setResidualKr] = useState('0')
  const [months, setMonths] = useState('36')
  const [method, setMethod] = useState<DepreciationMethod>('linear')
  const [decliningRatePct, setDecliningRatePct] = useState('30')
  const [assetAccount, setAssetAccount] = useState('1220')
  const [accAccount, setAccAccount] = useState('1229')
  const [expAccount, setExpAccount] = useState('7832')
  const [formError, setFormError] = useState<string | null>(null)

  function resetForm() {
    setName('')
    setAcquisitionDate(new Date().toISOString().slice(0, 10))
    setCostKr('')
    setResidualKr('0')
    setMonths('36')
    setMethod('linear')
    setDecliningRatePct('30')
    setAssetAccount('1220')
    setAccAccount('1229')
    setExpAccount('7832')
    setFormError(null)
  }

  function handleAssetAccountChange(value: string) {
    setAssetAccount(value)
    const defaults = findDepreciationDefaults(value)
    if (defaults) {
      setAccAccount(defaults.accumulated)
      setExpAccount(defaults.expense)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const costOre = Math.round(parseFloat(costKr) * 100)
    const residualOre = Math.round(parseFloat(residualKr || '0') * 100)
    const monthsNum = parseInt(months, 10)

    if (!name.trim()) return setFormError('Namn krävs')
    if (!Number.isFinite(costOre) || costOre < 0) return setFormError('Ange giltigt anskaffningsvärde')
    if (residualOre > costOre) return setFormError('Restvärde kan inte överstiga anskaffningsvärde')
    if (!Number.isFinite(monthsNum) || monthsNum < 1) return setFormError('Nyttjandeperiod måste vara minst 1 månad')

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
      const ratePct = parseFloat(decliningRatePct)
      if (!Number.isFinite(ratePct) || ratePct <= 0) return setFormError('Ange giltig degressiv ränta')
      payload.declining_rate_bp = Math.round(ratePct * 100)
    }

    try {
      const r = await createMutation.mutateAsync(payload)
      toast.success(`Tillgång skapad — ${r.scheduleCount} schema-rader genererade`)
      resetForm()
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kunde inte skapa tillgång'
      setFormError(msg)
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fixed-asset-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-2xl rounded-lg bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="fixed-asset-dialog-title" className="mb-4 text-lg font-semibold">
          Ny anläggningstillgång
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="fa-name" className="mb-1 block text-sm font-medium">Namn</label>
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
              <label htmlFor="fa-date" className="mb-1 block text-sm font-medium">Anskaffningsdatum</label>
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
              <label htmlFor="fa-months" className="mb-1 block text-sm font-medium">Nyttjandeperiod (månader)</label>
              <input
                id="fa-months"
                type="number"
                min="1"
                max="600"
                value={months}
                onChange={(e) => setMonths(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="fa-cost" className="mb-1 block text-sm font-medium">Anskaffningsvärde (kr)</label>
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
              />
            </div>
            <div>
              <label htmlFor="fa-residual" className="mb-1 block text-sm font-medium">Restvärde (kr)</label>
              <input
                id="fa-residual"
                type="number"
                step="0.01"
                min="0"
                value={residualKr}
                onChange={(e) => setResidualKr(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="fa-method" className="mb-1 block text-sm font-medium">Avskrivningsmetod</label>
            <select
              id="fa-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as DepreciationMethod)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="linear">Linjär</option>
              <option value="declining">Degressiv (räknesats)</option>
            </select>
          </div>

          {method === 'declining' && (
            <div>
              <label htmlFor="fa-rate" className="mb-1 block text-sm font-medium">Avskrivningssats (% per år)</label>
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
            <legend className="px-1 text-sm font-medium">Bokföringskonton</legend>
            <p className="mb-2 text-xs text-muted-foreground">
              Välj kontoklass från BAS-kontoplanen. Defaults sätts automatiskt via{' '}
              {DEPRECIATION_DEFAULTS.length} vanliga mappningar.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label htmlFor="fa-asset-account" className="mb-1 block text-xs font-medium">Anskaffning</label>
                <input
                  id="fa-asset-account"
                  value={assetAccount}
                  onChange={(e) => handleAssetAccountChange(e.target.value)}
                  className="w-full rounded-md border px-2 py-1.5 text-sm"
                  list="fa-asset-accounts"
                />
                <datalist id="fa-asset-accounts">
                  {DEPRECIATION_DEFAULTS.map((d) => (
                    <option key={d.asset} value={d.asset}>{d.label}</option>
                  ))}
                </datalist>
              </div>
              <div>
                <label htmlFor="fa-acc-account" className="mb-1 block text-xs font-medium">Ack. avskrivningar</label>
                <input
                  id="fa-acc-account"
                  value={accAccount}
                  onChange={(e) => setAccAccount(e.target.value)}
                  className="w-full rounded-md border px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="fa-exp-account" className="mb-1 block text-xs font-medium">Avskrivningskostnad</label>
                <input
                  id="fa-exp-account"
                  value={expAccount}
                  onChange={(e) => setExpAccount(e.target.value)}
                  className="w-full rounded-md border px-2 py-1.5 text-sm"
                />
              </div>
            </div>
          </fieldset>

          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md border px-4 py-2 text-sm"
            >
              Avbryt
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              data-testid="fa-submit"
            >
              {createMutation.isPending ? 'Skapar…' : 'Skapa tillgång'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
