import { useState, useEffect, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { formatKr, kronorToOre, todayLocal } from '../../lib/format'
import { errorIdFor } from '../../lib/a11y'
import { FieldError } from './FieldError'

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  totalAmount: number
  paidAmount: number
  documentDate: string
  fiscalYearEnd: string
  onSubmit: (amount: number, date: string, bankFeeOre?: number) => void
  isLoading: boolean
}

export function PaymentDialog({
  open,
  onOpenChange,
  title,
  totalAmount,
  paidAmount,
  documentDate,
  fiscalYearEnd,
  onSubmit,
  isLoading,
}: PaymentDialogProps) {
  const remaining = totalAmount - paidAmount
  const remainingKr = (remaining / 100).toFixed(2)

  const [amountStr, setAmountStr] = useState(remainingKr)
  const [paymentDate, setPaymentDate] = useState(todayLocal())
  const [bankFeeStr, setBankFeeStr] = useState('')
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({})
  const amountInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setAmountStr((remaining / 100).toFixed(2))
      setPaymentDate(todayLocal())
      setBankFeeStr('')
      setErrors({})
    }
  }, [open, remaining])

  function validate(): boolean {
    const newErrors: { amount?: string; date?: string } = {}
    const amountOre = kronorToOre(amountStr)

    if (isNaN(amountOre) || amountOre <= 0) {
      newErrors.amount = 'Belopp måste vara större än 0'
    } else if (amountOre > remaining) {
      newErrors.amount = `Belopp kan inte överstiga kvarvarande ${formatKr(remaining)}`
    }

    if (paymentDate < documentDate) {
      newErrors.date = `Betalningsdatum kan inte vara före dokumentdatum (${documentDate})`
    } else if (paymentDate > fiscalYearEnd) {
      newErrors.date = `Betalningsdatum måste vara inom räkenskapsåret (senast ${fiscalYearEnd})`
    } else if (paymentDate > todayLocal()) {
      newErrors.date = 'Betalningsdatum kan inte vara i framtiden'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleSubmit() {
    if (!validate()) return
    const amountOre = kronorToOre(amountStr)
    const feeOre = bankFeeStr ? kronorToOre(bankFeeStr) : undefined
    onSubmit(amountOre, paymentDate, feeOre || undefined)
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && isLoading) return
        onOpenChange(next)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            amountInputRef.current?.focus()
          }}
          onEscapeKeyDown={(e) => {
            if (isLoading) e.preventDefault()
          }}
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-xl focus:outline-none"
        >
          <Dialog.Title className="mb-4 text-base font-semibold">
            {title}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Formulär för att registrera en betalning.
          </Dialog.Description>

          <div className="mb-4 rounded-md border px-3 py-2 text-sm text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>Totalt:</span>
              <span>{formatKr(totalAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span>Betalt:</span>
              <span>{formatKr(paidAmount)}</span>
            </div>
            <div className="flex justify-between font-medium text-foreground">
              <span>Kvar:</span>
              <span>{formatKr(remaining)}</span>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="payment-amount"
                className="mb-1 block text-sm font-medium"
              >
                Belopp (kr)
              </label>
              <input
                ref={amountInputRef}
                id="payment-amount"
                type="number"
                step="0.01"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                aria-invalid={!!errors.amount}
                aria-describedby={
                  errors.amount ? errorIdFor('payment-amount') : undefined
                }
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {errors.amount && (
                <FieldError id={errorIdFor('payment-amount')}>
                  {errors.amount}
                </FieldError>
              )}
            </div>

            <div>
              <label
                htmlFor="payment-date"
                className="mb-1 block text-sm font-medium"
              >
                Datum
              </label>
              <input
                id="payment-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                aria-invalid={!!errors.date}
                aria-describedby={
                  errors.date ? errorIdFor('payment-date') : undefined
                }
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {errors.date && (
                <FieldError id={errorIdFor('payment-date')}>
                  {errors.date}
                </FieldError>
              )}
            </div>

            <div>
              <label
                htmlFor="payment-bank-fee"
                className="mb-1 block text-sm font-medium"
              >
                Bankavgift (kr)
              </label>
              <input
                id="payment-bank-fee"
                type="number"
                step="0.01"
                min="0"
                value={bankFeeStr}
                onChange={(e) => setBankFeeStr(e.target.value)}
                placeholder="0.00"
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={isLoading}
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                Avbryt
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isLoading}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? 'Registrerar...' : 'Registrera'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
