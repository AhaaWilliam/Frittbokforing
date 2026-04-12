import { useState, useEffect } from 'react'
import { formatKr, kronorToOre } from '../../lib/format'

export interface BulkPaymentRow {
  id: number
  label: string // invoice_number or description
  counterparty: string
  remaining: number // öre
}

interface BulkPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  rows: BulkPaymentRow[]
  onSubmit: (payments: Array<{ id: number; amount_ore: number }>, date: string, accountNumber: string, bankFeeOre: number | undefined, userNote: string | undefined) => void
  isLoading: boolean
}

export function BulkPaymentDialog({
  open,
  onOpenChange,
  title,
  rows,
  onSubmit,
  isLoading,
}: BulkPaymentDialogProps) {
  const [amounts, setAmounts] = useState<Record<number, string>>({})
  const [paymentDate, setPaymentDate] = useState('')
  const [accountNumber, setAccountNumber] = useState('1930')
  const [bankFeeStr, setBankFeeStr] = useState('')
  const [userNote, setUserNote] = useState('')

  useEffect(() => {
    if (open) {
      const initial: Record<number, string> = {}
      for (const row of rows) {
        initial[row.id] = (row.remaining / 100).toFixed(2)
      }
      setAmounts(initial)
      setPaymentDate(new Date().toISOString().slice(0, 10))
      setAccountNumber('1930')
      setBankFeeStr('')
      setUserNote('')
    }
  }, [open, rows])

  if (!open || rows.length === 0) return null

  const totalOre = rows.reduce((sum, r) => {
    const ore = kronorToOre(amounts[r.id] ?? '0')
    return sum + (isNaN(ore) ? 0 : ore)
  }, 0)

  function handleSubmit() {
    const payments = rows.map(r => ({
      id: r.id,
      amount_ore: kronorToOre(amounts[r.id] ?? '0'),
    })).filter(p => p.amount_ore > 0)

    if (payments.length === 0) return

    const feeOre = bankFeeStr ? kronorToOre(bankFeeStr) : undefined
    onSubmit(payments, paymentDate, accountNumber, feeOre || undefined, userNote || undefined)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-2xl max-h-[80vh] overflow-auto rounded-lg bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold">{title}</h2>

        {/* Per-row amounts */}
        <div className="mb-4 rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2">Nr/Beskrivning</th>
                <th className="px-3 py-2">Motpart</th>
                <th className="px-3 py-2 text-right">Kvar</th>
                <th className="px-3 py-2 text-right">Betala (kr)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2">{row.label}</td>
                  <td className="px-3 py-2">{row.counterparty}</td>
                  <td className="px-3 py-2 text-right">{formatKr(row.remaining)}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="0.01"
                      value={amounts[row.id] ?? ''}
                      onChange={e => setAmounts(prev => ({ ...prev, [row.id]: e.target.value }))}
                      className="w-28 rounded-md border border-input bg-background px-2 py-1 text-right text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mb-3 text-sm font-medium text-right">
          Summa: {formatKr(totalOre)}
        </div>

        {/* Global fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Betaldatum</label>
            <input
              type="date"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Bankkonto</label>
            <input
              type="text"
              value={accountNumber}
              onChange={e => setAccountNumber(e.target.value)}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Bankavgift (kr)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={bankFeeStr}
              onChange={e => setBankFeeStr(e.target.value)}
              placeholder="0.00"
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Notering</label>
            <input
              type="text"
              value={userNote}
              onChange={e => setUserNote(e.target.value)}
              placeholder="Valfri notering"
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || totalOre <= 0}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isLoading ? 'Bearbetar...' : `Betala ${rows.length} poster`}
          </button>
        </div>
      </div>
    </div>
  )
}
