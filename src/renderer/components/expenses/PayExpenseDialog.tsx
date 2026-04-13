import { useState } from 'react'
import type { ExpenseDetail } from '../../../shared/types'
import { usePayExpense } from '../../lib/hooks'
import { formatKr, toOre, toKr, todayLocal } from '../../lib/format'

interface PayExpenseDialogProps {
  expense: ExpenseDetail
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function PayExpenseDialog({
  expense,
  open,
  onClose,
  onSuccess,
}: PayExpenseDialogProps) {
  const today = todayLocal()
  const [amountKr, setAmountKr] = useState(toKr(expense.remaining).toFixed(2))
  const [paymentDate, setPaymentDate] = useState(today)
  const [paymentMethod, setPaymentMethod] = useState<string>('bankgiro')
  const [accountNumber, setAccountNumber] = useState('1930')
  const [bankFeeStr, setBankFeeStr] = useState('')
  const [error, setError] = useState<string | null>(null)

  const payMutation = usePayExpense()

  if (!open) return null

  const handleSubmit = async () => {
    setError(null)
    try {
      const feeOre = bankFeeStr ? toOre(parseFloat(bankFeeStr)) : undefined
      await payMutation.mutateAsync({
        expense_id: expense.id,
        amount_ore: toOre(parseFloat(amountKr)),
        payment_date: paymentDate,
        payment_method: paymentMethod,
        account_number: accountNumber,
        ...(feeOre ? { bank_fee_ore: feeOre } : {}),
      })
      onSuccess?.()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Okänt fel')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">Registrera betalning</h2>

        <div className="space-y-2 mb-6 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Kostnad:</span>
            <span>{expense.description}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Leverantor:</span>
            <span>{expense.counterparty_name ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Totalt:</span>
            <span className="font-medium">
              {formatKr(expense.total_amount_ore)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Redan betalt:</span>
            <span>{formatKr(expense.total_paid)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Kvarstaende:</span>
            <span className="font-semibold text-primary">
              {formatKr(expense.remaining)}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Belopp (kr)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amountKr}
              onChange={(e) => setAmountKr(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Datum</label>
            <input
              type="date"
              value={paymentDate}
              max={today}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Konto</label>
            <select
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="1930">1930 Foretagskonto</option>
              <option value="1920">1920 PlusGiro</option>
              <option value="1910">1910 Kassa</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Betalningsmetod
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="bankgiro">Bankgiro</option>
              <option value="swish">Swish</option>
              <option value="kort">Kort</option>
              <option value="kontant">Kontant</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Bankavgift (kr)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={bankFeeStr}
              onChange={(e) => setBankFeeStr(e.target.value)}
              placeholder="0.00"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
          >
            Avbryt
          </button>
          <button
            onClick={handleSubmit}
            disabled={payMutation.isPending}
            className="px-4 py-2 text-sm bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
          >
            {payMutation.isPending ? 'Registrerar...' : 'Registrera'}
          </button>
        </div>
      </div>
    </div>
  )
}
