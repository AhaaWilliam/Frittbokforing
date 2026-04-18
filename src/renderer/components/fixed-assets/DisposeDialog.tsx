import { useState } from 'react'
import { useAllAccounts } from '../../lib/hooks'
import { todayLocal } from '../../../shared/date-utils'

export interface DisposeDialogResult {
  disposed_date: string
  generate_journal_entry: boolean
  sale_price_ore: number
  proceeds_account: string | null
}

interface Props {
  assetName: string
  onConfirm: (result: DisposeDialogResult) => void
  onCancel: () => void
}

export function DisposeDialog({ assetName, onConfirm, onCancel }: Props) {
  const today = todayLocal()
  const [disposedDate, setDisposedDate] = useState(today)
  const [generateEntry, setGenerateEntry] = useState(true)
  const [salePriceKr, setSalePriceKr] = useState('')
  const [proceedsAccount, setProceedsAccount] = useState('1930')

  const { data: accounts } = useAllAccounts(true)
  // Balansräkning: 1xxx–2xxx
  const proceedsOptions = (accounts ?? []).filter(
    (a) => a.account_number.startsWith('1') || a.account_number.startsWith('2'),
  )

  function submit() {
    const saleOre = salePriceKr
      ? Math.round(parseFloat(salePriceKr.replace(',', '.')) * 100)
      : 0
    onConfirm({
      disposed_date: disposedDate,
      generate_journal_entry: generateEntry,
      sale_price_ore: saleOre,
      proceeds_account: saleOre > 0 ? proceedsAccount : null,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      data-testid="dispose-dialog"
    >
      <div className="w-full max-w-md rounded-lg bg-background p-4 shadow-xl">
        <h2 className="mb-3 text-lg font-semibold">Avyttra {assetName}</h2>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs uppercase text-muted-foreground">
            Datum
          </span>
          <input
            type="date"
            className="w-full rounded border bg-background p-2 text-sm"
            value={disposedDate}
            onChange={(e) => setDisposedDate(e.target.value)}
            data-testid="dispose-date"
          />
        </label>

        <label className="mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={generateEntry}
            onChange={(e) => setGenerateEntry(e.target.checked)}
            data-testid="dispose-generate-entry"
          />
          <span>Skapa disposal-verifikat automatiskt (E-serie)</span>
        </label>

        {generateEntry && (
          <>
            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-xs uppercase text-muted-foreground">
                Försäljningspris (kr, lämna tomt vid utrangering)
              </span>
              <input
                type="text"
                inputMode="decimal"
                className="w-full rounded border bg-background p-2 text-sm"
                value={salePriceKr}
                onChange={(e) => setSalePriceKr(e.target.value)}
                data-testid="dispose-sale-price"
                placeholder="0.00"
              />
            </label>

            {salePriceKr && parseFloat(salePriceKr.replace(',', '.')) > 0 && (
              <label className="mb-4 block text-sm">
                <span className="mb-1 block text-xs uppercase text-muted-foreground">
                  Intäktskonto (balansräkning 1xxx–2xxx)
                </span>
                <select
                  className="w-full rounded border bg-background p-2 text-sm"
                  value={proceedsAccount}
                  onChange={(e) => setProceedsAccount(e.target.value)}
                  data-testid="dispose-proceeds-account"
                >
                  {proceedsOptions.map((a) => (
                    <option key={a.account_number} value={a.account_number}>
                      {a.account_number} · {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="rounded border px-3 py-1.5 text-sm hover:bg-accent"
            onClick={onCancel}
          >
            Avbryt
          </button>
          <button
            type="button"
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
            onClick={submit}
            data-testid="dispose-submit"
          >
            Avyttra
          </button>
        </div>
      </div>
    </div>
  )
}
