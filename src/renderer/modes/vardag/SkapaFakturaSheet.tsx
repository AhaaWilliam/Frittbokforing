import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BottomSheet, BottomSheetClose } from '../../components/ui/BottomSheet'
import { Field } from '../../components/ui/Field'
import {
  KonteringHeader,
  KonteringRow,
} from '../../components/ui/KonteringRow'
import { CustomerPicker } from '../../components/invoices/CustomerPicker'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { useActiveCompany } from '../../contexts/ActiveCompanyContext'
import { useCounterparty, useVatCodes } from '../../lib/hooks'
import { fiscalYearDateError, kronorToOre, todayLocal } from '../../lib/format'
import { buildQuickInvoicePayload } from '../../lib/build-quick-invoice-payload'
import { useUiMode } from '../../lib/use-ui-mode'
import { useKeyboardShortcuts } from '../../lib/useKeyboardShortcuts'

/**
 * Sprint VS-4 — SkapaFakturaSheet (funktionell).
 *
 * 1-rads-snabbfakturering för Vardag-läget. Speglar BokforKostnadSheet
 * (VS-3) men för utgående faktura. Multi-line hänvisas till
 * bokförare-läget via CTA "Lägg till fler rader" → /income/edit/<id>.
 *
 * Submit-flow:
 *   1. invoice:save-draft (med 1-rad payload)
 *   2. invoice:finalize (auto)
 *   3. counterparty:set-default-account (om default_revenue_account null)
 *
 * Default-konto: counterparties.default_revenue_account, fallback 3001.
 * PDF-generation lämnas till bokförare-läget i denna iteration.
 */

interface Props {
  open: boolean
  onClose: () => void
}

const FALLBACK_REVENUE_ACCOUNT = '3001'

export function SkapaFakturaSheet({ open, onClose }: Props) {
  const { activeFiscalYear } = useFiscalYearContext()
  const { activeCompany } = useActiveCompany()
  const { setMode } = useUiMode()
  const { data: vatCodes = [] } = useVatCodes('outgoing')

  function openInBokforare() {
    window.location.hash = '/income/create'
    setMode('bokforare')
    onClose()
  }

  const [date, setDate] = useState(todayLocal())
  const [paymentTerms, setPaymentTerms] = useState(30)
  const [customer, setCustomer] = useState<{
    id: number
    name: string
  } | null>(null)
  const [description, setDescription] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [priceKr, setPriceKr] = useState('')
  const [accountNumber, setAccountNumber] = useState(FALLBACK_REVENUE_ACCOUNT)
  const [accountManuallyEdited, setAccountManuallyEdited] = useState(false)
  const [vatCodeId, setVatCodeId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Default till MP1 (25%)
  useEffect(() => {
    if (vatCodeId === null && vatCodes.length > 0) {
      const mp1 = vatCodes.find((vc) => vc.rate_percent === 25) ?? vatCodes[0]
      setVatCodeId(mp1.id)
    }
  }, [vatCodes, vatCodeId])

  const { data: customerFull } = useCounterparty(customer?.id)

  useEffect(() => {
    if (!customerFull || accountManuallyEdited) return
    if (customerFull.default_revenue_account) {
      setAccountNumber(customerFull.default_revenue_account)
    }
  }, [customerFull, accountManuallyEdited])

  // Reset vid stängning.
  useEffect(() => {
    if (open) return
    setDate(todayLocal())
    setPaymentTerms(30)
    setCustomer(null)
    setDescription('')
    setQuantity('1')
    setPriceKr('')
    setAccountNumber(FALLBACK_REVENUE_ACCOUNT)
    setAccountManuallyEdited(false)
    setError(null)
    setSubmitting(false)
  }, [open])

  const qtyNum = useMemo(() => {
    const n = parseFloat(quantity.replace(',', '.'))
    return isNaN(n) ? 0 : n
  }, [quantity])

  const unitPriceOre = kronorToOre(priceKr)
  const lineNetOre = Math.round(qtyNum * unitPriceOre)
  const vatRate = useMemo(() => {
    return vatCodes.find((vc) => vc.id === vatCodeId)?.rate_percent ?? 25
  }, [vatCodes, vatCodeId])
  const vatOre = Math.round((lineNetOre * vatRate) / 100)
  const totalOre = lineNetOre + vatOre

  const dateError = activeFiscalYear
    ? fiscalYearDateError(
        date,
        activeFiscalYear.start_date,
        activeFiscalYear.end_date,
      )
    : null

  const canSubmit =
    !!activeFiscalYear &&
    !!activeCompany &&
    !!customer &&
    qtyNum > 0 &&
    unitPriceOre > 0 &&
    description.trim().length > 0 &&
    /^\d{4}$/.test(accountNumber) &&
    vatCodeId !== null &&
    !dateError &&
    !submitting

  async function handleSubmit() {
    if (!canSubmit || !activeFiscalYear || !customer || vatCodeId === null)
      return

    setSubmitting(true)
    setError(null)

    try {
      const payload = buildQuickInvoicePayload({
        fiscal_year_id: activeFiscalYear.id,
        counterparty_id: customer.id,
        invoice_date: date,
        payment_terms: paymentTerms,
        description: description.trim(),
        quantity: qtyNum,
        unit_price_ore: unitPriceOre,
        vat_code_id: vatCodeId,
        account_number: accountNumber,
      })

      const draft = await window.api.saveDraft(payload)
      if (!draft.success) {
        setError(draft.error)
        setSubmitting(false)
        return
      }

      const finalized = await window.api.finalizeInvoice({ id: draft.data.id })
      if (!finalized.success) {
        setError(finalized.error)
        setSubmitting(false)
        return
      }

      if (
        customerFull &&
        !customerFull.default_revenue_account &&
        activeCompany
      ) {
        try {
          await window.api.setCounterpartyDefaultAccount({
            id: customer.id,
            company_id: activeCompany.id,
            field: 'default_revenue_account',
            account_number: accountNumber,
          })
        } catch {
          /* best-effort */
        }
      }

      const verNum = finalized.data.verification_number
      toast.success(`Fakturan skickad som A${verNum}`)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ett oväntat fel uppstod')
      setSubmitting(false)
    }
  }

  // VS-16: Cmd/Ctrl+Enter submit
  useKeyboardShortcuts(
    open
      ? {
          'mod+enter': () => {
            if (canSubmit) handleSubmit()
          },
        }
      : {},
  )

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      title="Skapa faktura"
      description="Ny utgående faktura — välj kund och rad."
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Kund" span={2}>
            <CustomerPicker
              value={customer}
              onChange={(c) => {
                setCustomer({ id: c.id, name: c.name })
                setPaymentTerms(c.default_payment_terms)
              }}
              testId="vardag-faktura-customer"
            />
          </Field>
          <Field label="Fakturadatum">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={!!dateError}
              aria-describedby={dateError ? 'vardag-faktura-date-err' : undefined}
              className={`w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm font-mono ${dateError ? 'border-danger-500' : 'border-[var(--border-default)]'}`}
              data-testid="vardag-faktura-date"
            />
            {dateError && (
              <p
                id="vardag-faktura-date-err"
                role="alert"
                className="mt-1 text-xs text-danger-600"
                data-testid="vardag-faktura-date-error"
              >
                {dateError}
              </p>
            )}
          </Field>
          <Field label="Betalningsvillkor" hint="dagar">
            <input
              type="number"
              min={1}
              max={365}
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(Number(e.target.value) || 30)}
              className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface)] px-3 py-2 text-right text-sm font-mono"
              data-testid="vardag-faktura-payment-terms"
            />
          </Field>
        </div>

        <div className="rounded-md border border-[var(--border-default)] p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
            Rad
          </p>
          <div className="grid grid-cols-[1fr_60px_88px_88px] gap-2 text-sm">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Beskrivning"
              className="rounded-md border border-[var(--border-default)] bg-[var(--surface)] px-3 py-2"
              data-testid="vardag-faktura-description"
            />
            <input
              type="text"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="rounded-md border border-[var(--border-default)] bg-[var(--surface)] px-3 py-2 text-right font-mono"
              data-testid="vardag-faktura-qty"
            />
            <input
              type="text"
              inputMode="decimal"
              value={priceKr}
              onChange={(e) => setPriceKr(e.target.value)}
              placeholder="0,00"
              className="rounded-md border border-[var(--border-default)] bg-[var(--surface)] px-3 py-2 text-right font-mono"
              data-testid="vardag-faktura-price"
            />
            <span
              className="px-1 py-2 text-right font-mono text-xs text-[var(--text-secondary)]"
              data-testid="vardag-faktura-line-total"
            >
              {(lineNetOre / 100).toFixed(2)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Konto" hint="4-siffrig BAS">
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => {
                setAccountNumber(e.target.value)
                setAccountManuallyEdited(true)
              }}
              maxLength={4}
              pattern="\d{4}"
              className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface)] px-3 py-2 text-sm font-mono"
              data-testid="vardag-faktura-account"
            />
          </Field>
          <Field label="Moms">
            <select
              value={vatCodeId ?? ''}
              onChange={(e) => setVatCodeId(Number(e.target.value))}
              className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface)] px-3 py-2 text-sm"
              data-testid="vardag-faktura-vat"
            >
              {vatCodes.map((vc) => (
                <option key={vc.id} value={vc.id}>
                  {vc.code} — {vc.rate_percent}%
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div
          className="rounded-md border border-[var(--border-default)] bg-[var(--surface-secondary)]/40 p-3"
          aria-live="polite"
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
            Förslag-kontering
          </p>
          <KonteringHeader />
          {totalOre > 0 ? (
            <>
              <KonteringRow
                account="1510"
                description="Kundfordran"
                debit={totalOre}
              />
              <KonteringRow
                account={accountNumber}
                description={description || '(beskrivning)'}
                credit={lineNetOre}
              />
              {vatOre > 0 && (
                <KonteringRow
                  account="2610"
                  description="Utgående moms"
                  credit={vatOre}
                />
              )}
            </>
          ) : (
            <KonteringRow
              account="—"
              description="Fyll i belopp för förslag"
            />
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
            data-testid="vardag-faktura-error"
          >
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={openInBokforare}
            className="text-xs text-[var(--text-faint)] underline hover:text-[var(--text-primary)]"
            data-testid="vardag-faktura-multiline-cta"
          >
            Behöver lägga till fler rader?
          </button>
          <div className="flex gap-2">
            <BottomSheetClose>Avbryt</BottomSheetClose>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="rounded-md bg-[var(--color-brand-500)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              data-testid="vardag-faktura-submit"
            >
              {submitting ? 'Skickar…' : 'Skicka'}
            </button>
          </div>
        </div>
      </div>
    </BottomSheet>
  )
}
