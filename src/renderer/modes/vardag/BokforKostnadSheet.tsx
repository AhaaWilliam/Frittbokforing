import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { BottomSheet, BottomSheetClose } from '../../components/ui/BottomSheet'
import { Field } from '../../components/ui/Field'
import { KbdChord } from '../../components/ui/KbdChip'
import {
  KonteringHeader,
  KonteringRow,
} from '../../components/ui/KonteringRow'
import { SupplierPicker } from '../../components/expenses/SupplierPicker'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { useActiveCompany } from '../../contexts/ActiveCompanyContext'
import { useAllAccounts, useCounterparty, useVatCodes } from '../../lib/hooks'
import {
  fiscalYearDateError,
  kronorToOre,
  pathBasename,
  todayLocal,
} from '../../lib/format'
import { buildQuickExpensePayload } from '../../lib/build-quick-expense-payload'
import { netFromInclVatOre } from '../../lib/build-quick-expense-payload'
import { useUiMode } from '../../lib/use-ui-mode'
import { useKeyboardShortcuts } from '../../lib/useKeyboardShortcuts'

/**
 * Sprint VS-3 — BokforKostnadSheet (funktionell).
 *
 * 1-rads-snabbokföring för Vardag-läget. Användaren matar in:
 *   datum, totalbelopp inkl. moms, leverantör, beskrivning, momssats.
 *
 * Konto väljs automatiskt från `counterparties.default_expense_account`
 * (B2-strategin) — om null, default 6110 (kontorsmateriel) som fallback.
 * Användaren ändrar manuellt vid behov via konto-input.
 *
 * Submit-flow:
 *   1. expense:save-draft (med 1-rad payload)
 *   2. expense:finalize (auto)
 *   3. counterparty:set-default-account (om null från start)
 *
 * Multi-line-fall hänvisas till bokförare-läget via CTA "Behöver dela
 * upp?" (ej i denna sprint).
 *
 * Receipt-attach via dialog.showOpenDialog är planerad men kvarstår
 * som drag-zone-placeholder i denna sprint (kommande iteration).
 */

interface Props {
  open: boolean
  onClose: () => void
}

const FALLBACK_EXPENSE_ACCOUNT = '6110'

export function BokforKostnadSheet({ open, onClose }: Props) {
  const { activeFiscalYear } = useFiscalYearContext()
  const { activeCompany } = useActiveCompany()
  const { setMode } = useUiMode()
  const { data: vatCodes = [] } = useVatCodes('incoming')
  const { data: allAccountsData } = useAllAccounts(true)
  const allAccounts = allAccountsData ?? []

  function openInBokforare() {
    window.location.hash = '/expenses/create'
    setMode('bokforare')
    onClose()
  }

  const [date, setDate] = useState(todayLocal())
  const [amountKr, setAmountKr] = useState('')
  const [supplier, setSupplier] = useState<{
    id: number
    name: string
  } | null>(null)
  const [description, setDescription] = useState('')
  const [accountNumber, setAccountNumber] = useState(FALLBACK_EXPENSE_ACCOUNT)
  const [accountManuallyEdited, setAccountManuallyEdited] = useState(false)
  const [vatCodeId, setVatCodeId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receiptPath, setReceiptPath] = useState<string | null>(null)
  const amountInputRef = useRef<HTMLInputElement | null>(null)

  // VS-18: Auto-focus belopp-fältet när sheet öppnas. Belopp är nästan
  // alltid det första användaren vill mata in (datum är default = idag).
  // setTimeout 0 så Radix-portal hinner mounta innan fokus försöks.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => amountInputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  // Default till IP1 (25%) när vatCodes laddats.
  useEffect(() => {
    if (vatCodeId === null && vatCodes.length > 0) {
      const ip1 = vatCodes.find((vc) => vc.rate_percent === 25) ?? vatCodes[0]
      setVatCodeId(ip1.id)
    }
  }, [vatCodes, vatCodeId])

  // Hämta full counterparty för default_expense_account-fallback.
  const { data: supplierFull } = useCounterparty(supplier?.id)

  // När leverantör väljs och har default → prefill konto (om ej manuellt
  // ändrat).
  useEffect(() => {
    if (!supplierFull || accountManuallyEdited) return
    if (supplierFull.default_expense_account) {
      setAccountNumber(supplierFull.default_expense_account)
    }
  }, [supplierFull, accountManuallyEdited])

  // Reset state vid stängning.
  useEffect(() => {
    if (open) return
    setDate(todayLocal())
    setAmountKr('')
    setSupplier(null)
    setDescription('')
    setAccountNumber(FALLBACK_EXPENSE_ACCOUNT)
    setAccountManuallyEdited(false)
    setError(null)
    setSubmitting(false)
    setReceiptPath(null)
  }, [open])

  async function handlePickReceipt() {
    const res = await window.api.selectReceiptFile()
    if (!res.success) return
    if (res.data && res.data.filePath) {
      setReceiptPath(res.data.filePath)
    }
  }

  const amountInclVatOre = kronorToOre(amountKr)
  const vatRate = useMemo(() => {
    return vatCodes.find((vc) => vc.id === vatCodeId)?.rate_percent ?? 25
  }, [vatCodes, vatCodeId])
  const netOre = useMemo(
    () =>
      amountInclVatOre > 0 ? netFromInclVatOre(amountInclVatOre, vatRate) : 0,
    [amountInclVatOre, vatRate],
  )
  const vatOre = amountInclVatOre - netOre

  const dateError = activeFiscalYear
    ? fiscalYearDateError(
        date,
        activeFiscalYear.start_date,
        activeFiscalYear.end_date,
      )
    : null

  // VS-19: Inline-validering av kontonummer mot kontoplan.
  // Vänta tills accounts laddats innan vi flaggar fel (annars false-positive
  // initialt).
  const matchedAccount = allAccounts.find(
    (a) => a.account_number === accountNumber,
  )
  const accountError =
    /^\d{4}$/.test(accountNumber) && allAccounts.length > 0
      ? matchedAccount
        ? null
        : `Kontot ${accountNumber} finns inte i kontoplanen.`
      : null

  const canSubmit =
    !!activeFiscalYear &&
    !!activeCompany &&
    !!supplier &&
    amountInclVatOre > 0 &&
    description.trim().length > 0 &&
    /^\d{4}$/.test(accountNumber) &&
    vatCodeId !== null &&
    !dateError &&
    !accountError &&
    !submitting

  async function handleSubmit() {
    if (!canSubmit || !activeFiscalYear || !supplier || vatCodeId === null)
      return

    setSubmitting(true)
    setError(null)

    try {
      const payload = buildQuickExpensePayload({
        fiscal_year_id: activeFiscalYear.id,
        expense_date: date,
        amount_incl_vat_ore: amountInclVatOre,
        vat_rate_percent: vatRate,
        counterparty_id: supplier.id,
        description: description.trim(),
        account_number: accountNumber,
        vat_code_id: vatCodeId,
      })

      const draft = await window.api.saveExpenseDraft(payload)
      if (!draft.success) {
        setError(draft.error)
        setSubmitting(false)
        return
      }

      // Receipt-attach: best-effort innan finalize. Bokföringen blockeras
      // inte av disk-fel — men användaren informeras via toast.warning så
      // hen kan bifoga kvittot manuellt (BFL 7 kap arkivering).
      let receiptAttachFailed = false
      if (receiptPath) {
        try {
          const r = await window.api.attachReceipt({
            expense_id: draft.data.id,
            source_file_path: receiptPath,
          })
          if (!r.success) receiptAttachFailed = true
        } catch {
          receiptAttachFailed = true
        }
      }

      const finalized = await window.api.finalizeExpense({ id: draft.data.id })
      if (!finalized.success) {
        setError(finalized.error)
        setSubmitting(false)
        return
      }

      // B2-strategin: sätt default_expense_account om null från start.
      if (
        supplierFull &&
        !supplierFull.default_expense_account &&
        activeCompany
      ) {
        try {
          await window.api.setCounterpartyDefaultAccount({
            id: supplier.id,
            company_id: activeCompany.id,
            field: 'default_expense_account',
            account_number: accountNumber,
          })
        } catch {
          /* best-effort, blockerar inte success-toast */
        }
      }

      const verNum = finalized.data.verification_number
      toast.success(`Kostnaden bokförd som B${verNum}`)
      if (receiptAttachFailed) {
        toast.warning(
          'Kvittot kunde inte sparas — bifoga manuellt i kostnadsvyn för att uppfylla arkivkrav.',
        )
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ett oväntat fel uppstod')
      setSubmitting(false)
    }
  }

  // VS-16: Cmd/Ctrl+Enter submit. Aktiv endast när sheet är öppen.
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
      title="Bokför kostnad"
      description="Kvitto eller faktura — fyll i, eller låt Fritt föreslå."
    >
      <div className="grid grid-cols-[200px_1fr] gap-6">
        <ReceiptVisual
          path={receiptPath}
          onPick={handlePickReceipt}
          onClear={() => setReceiptPath(null)}
        />
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Datum" hint="ÅÅÅÅ-MM-DD">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={!!dateError}
                aria-describedby={dateError ? 'vardag-kostnad-date-err' : undefined}
                className={`w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm font-mono ${dateError ? 'border-danger-500' : 'border-[var(--border-default)]'}`}
                data-testid="vardag-kostnad-date"
              />
              {dateError && (
                <p
                  id="vardag-kostnad-date-err"
                  role="alert"
                  className="mt-1 text-xs text-danger-600"
                  data-testid="vardag-kostnad-date-error"
                >
                  {dateError}
                </p>
              )}
            </Field>
            <Field label="Belopp inkl. moms">
              <input
                ref={amountInputRef}
                type="text"
                inputMode="decimal"
                value={amountKr}
                onChange={(e) => setAmountKr(e.target.value)}
                placeholder="0,00"
                className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface)] px-3 py-2 text-right text-sm font-mono"
                data-testid="vardag-kostnad-amount"
              />
            </Field>
            <Field label="Leverantör" span={2}>
              <SupplierPicker
                value={supplier}
                onChange={(s) => setSupplier({ id: s.id, name: s.name })}
                testId="vardag-kostnad-supplier"
              />
            </Field>
            <Field label="Beskrivning" span={2}>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Vad var det här?"
                className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface)] px-3 py-2 text-sm"
                data-testid="vardag-kostnad-description"
              />
            </Field>
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
                aria-invalid={!!accountError}
                aria-describedby={
                  accountError ? 'vardag-kostnad-account-err' : undefined
                }
                className={`w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm font-mono ${accountError ? 'border-danger-500' : 'border-[var(--border-default)]'}`}
                data-testid="vardag-kostnad-account"
              />
              {accountError && (
                <p
                  id="vardag-kostnad-account-err"
                  role="alert"
                  className="mt-1 text-xs text-danger-600"
                  data-testid="vardag-kostnad-account-error"
                >
                  {accountError}
                </p>
              )}
              {!accountError && matchedAccount && (
                <p
                  className="mt-1 text-xs text-[var(--text-secondary)]"
                  data-testid="vardag-kostnad-account-name"
                >
                  {matchedAccount.name}
                </p>
              )}
            </Field>
            <Field label="Moms">
              <select
                value={vatCodeId ?? ''}
                onChange={(e) => setVatCodeId(Number(e.target.value))}
                disabled={vatCodes.length === 0}
                className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface)] px-3 py-2 text-sm disabled:opacity-60"
                data-testid="vardag-kostnad-vat"
              >
                {vatCodes.length === 0 ? (
                  <option value="">Laddar momskoder…</option>
                ) : (
                  vatCodes.map((vc) => (
                    <option key={vc.id} value={vc.id}>
                      {vc.code} — {vc.rate_percent}%
                    </option>
                  ))
                )}
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
            {amountInclVatOre > 0 ? (
              <>
                <KonteringRow
                  account={accountNumber}
                  description={description || '(beskrivning)'}
                  debit={netOre}
                />
                {vatOre > 0 && (
                  <KonteringRow
                    account="2640"
                    description="Ingående moms"
                    debit={vatOre}
                  />
                )}
                <KonteringRow
                  account="2440"
                  description="Leverantörsskuld"
                  credit={amountInclVatOre}
                />
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
              data-testid="vardag-kostnad-error"
            >
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={openInBokforare}
              className="text-xs text-[var(--text-faint)] underline hover:text-[var(--text-primary)]"
              data-testid="vardag-kostnad-multiline-cta"
            >
              Behöver dela upp på flera konton?
            </button>
            <div className="flex items-center gap-2">
              <BottomSheetClose>Avbryt</BottomSheetClose>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={handleSubmit}
                className="inline-flex items-center gap-2 rounded-md bg-[var(--color-brand-500)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                data-testid="vardag-kostnad-submit"
              >
                <span>{submitting ? 'Bokför…' : 'Bokför'}</span>
                <KbdChord
                  keys={['⌘', '↵']}
                  ariaLabel="Kommando plus Enter"
                  size="sm"
                  className="opacity-80"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </BottomSheet>
  )
}

function ReceiptVisual({
  path,
  onPick,
  onClear,
}: {
  path: string | null
  onPick: () => void
  onClear: () => void
}) {
  if (path) {
    const filename = pathBasename(path)
    return (
      <div
        className="flex aspect-[3/4] flex-col items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--surface-secondary)]/40 p-3 text-center"
        data-testid="vardag-kostnad-receipt-attached"
      >
        <div className="mb-2 text-3xl">📎</div>
        <p
          className="break-all text-[10px] font-mono text-[var(--text-secondary)]"
          title={path}
        >
          {filename}
        </p>
        <button
          type="button"
          onClick={onClear}
          className="mt-2 text-[10px] text-[var(--text-faint)] underline hover:text-[var(--text-primary)]"
          data-testid="vardag-kostnad-receipt-clear"
        >
          Ta bort
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onPick}
      className="flex aspect-[3/4] flex-col items-center justify-center rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--surface-secondary)]/40 text-center transition-colors hover:bg-[var(--surface-secondary)]/70"
      data-testid="vardag-kostnad-receipt-pick"
    >
      <div className="mb-2 text-3xl">🧾</div>
      <p className="text-xs text-[var(--text-faint)]">
        Klicka för att välja kvitto
      </p>
      <p className="mt-1 text-[10px] text-[var(--text-faint)]">
        PDF, PNG, JPG, HEIC
      </p>
    </button>
  )
}
