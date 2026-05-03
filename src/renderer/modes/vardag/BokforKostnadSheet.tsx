import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { BottomSheet, BottomSheetClose } from '../../components/ui/BottomSheet'
import { Callout } from '../../components/ui/Callout'
import { Field } from '../../components/ui/Field'
import { KbdChord, modKey, modLabel } from '../../components/ui/KbdChip'
import { KonteringHeader, KonteringRow } from '../../components/ui/KonteringRow'
import { SupplierPicker } from '../../components/expenses/SupplierPicker'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { useActiveCompany } from '../../contexts/ActiveCompanyContext'
import {
  useAllAccounts,
  useCounterparties,
  useCounterparty,
  useVatCodes,
} from '../../lib/hooks'
import {
  fiscalYearDateError,
  formatKr,
  kronorToOre,
  pathBasename,
  todayLocal,
} from '../../lib/format'
import { buildQuickExpensePayload } from '../../lib/build-quick-expense-payload'
import { netFromInclVatOre } from '../../lib/build-quick-expense-payload'
import { useUiMode } from '../../lib/use-ui-mode'
import { useKeyboardShortcuts } from '../../lib/useKeyboardShortcuts'
import { ReceiptPreviewPane } from '../../components/receipts/ReceiptPreviewPane'
import {
  matchSupplier,
  normalizeOrgNumber,
  ocrReceipt,
  prewarmWorker,
  type ExtractedFields,
  type SupplierMatch,
} from '../../lib/ocr'

// VS-145d: lokal helper — normalizeOrgNumber returnerar null vid icke-10-siffr.
function normalizeMaybe(s: string | null | undefined): string | null {
  return normalizeOrgNumber(s)
}

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
  /**
   * VS-112: Förbifyllning från Inkorgen. Receipt-filen ligger redan i
   * receipts-inbox/ — sheet:en kopierar INTE filen igen utan länkar
   * den befintliga raden till den nya expense:n via
   * window.api.linkReceiptToExpense efter finalize. Drop-zone:en
   * blir read-only när detta är satt.
   */
  prefilledReceipt?: {
    receipt_id: number
    file_path: string
    original_filename: string
  }
}

const FALLBACK_EXPENSE_ACCOUNT = '6110'

/**
 * VS-145b: Bygg dynamisk förslags-text baserat på vilka fält OCR hittade.
 * Båda fält → datum + belopp. Bara datum eller bara belopp → enkel mening.
 */
function buildOcrSuggestionMessage(fields: ExtractedFields): string {
  const hasAmount = fields.amount_kr !== undefined
  const hasDate = fields.date !== undefined
  // sv-SE thousand separator för belopps-presentation.
  const amountStr = hasAmount
    ? new Intl.NumberFormat('sv-SE', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(fields.amount_kr!)
    : ''
  if (hasAmount && hasDate) {
    return `Vi tror datumet är ${fields.date} och beloppet ${amountStr} kr — klicka för att tillämpa`
  }
  if (hasDate) {
    return `Vi tror datumet är ${fields.date} — klicka för att tillämpa`
  }
  if (hasAmount) {
    return `Vi tror beloppet är ${amountStr} kr — klicka för att tillämpa`
  }
  return ''
}

export function BokforKostnadSheet({ open, onClose, prefilledReceipt }: Props) {
  const { activeFiscalYear } = useFiscalYearContext()
  const { activeCompany } = useActiveCompany()
  const { setMode } = useUiMode()
  const { data: vatCodesData } = useVatCodes('incoming')
  const vatCodes = vatCodesData ?? []
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
  // VS-41: M100 field-propagation, se SkapaFakturaSheet.
  const [errorField, setErrorField] = useState<string | null>(null)
  const [receiptPath, setReceiptPath] = useState<string | null>(
    prefilledReceipt ? prefilledReceipt.file_path : null,
  )
  const amountInputRef = useRef<HTMLInputElement | null>(null)
  // VS-37: synkron submit-guard mot double-click race (se SkapaFakturaSheet).
  const submittingRef = useRef(false)

  // VS-145b: OCR-state. ocrSuggestion = pre-fill-förslag visat som Callout
  // ovanför formuläret. ocrLoading = subtil "Läser kvitto..."-indikator under
  // attached-thumbnail. ocrTokenRef sekvens-id som invalideras vid
  // close/clear så att stale resultat inte sätter state efter unmount.
  // VS-145c: supplier_match är auto-fuzzy-matchad counterparty från
  // supplier_hint mot aktuell suppliers-lista (kind=supplier, samma bolag).
  // null om ingen match >= 0.7-threshold.
  const [ocrSuggestion, setOcrSuggestion] = useState<
    | (ExtractedFields & {
        supplier_match?: SupplierMatch | null
        // VS-145d: true om matchen drevs av org-nr (visa "matchad via org-nr"
        // i debug-text för att skilja mot ren namn-fuzzy).
        supplier_match_via_org?: boolean
      })
    | null
  >(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const ocrTokenRef = useRef(0)

  // VS-25: Rensa submit-fel automatiskt så fort användaren börjar
  // redigera ett fält efter ett misslyckat submit (t.ex. ändra datum
  // efter PERIOD_CLOSED). Felet ska inte hänga kvar och förvirra.
  // useEffect refererar inte error i deps för att undvika en self-loop;
  // istället läses error genom closure varje gång input-deps ändras.
  useEffect(() => {
    if (error) setError(null)
    if (errorField) setErrorField(null)
    // VS-96: error/errorField avsiktligt utelämnade ur deps — closure-läsning
    // förhindrar self-loop. Rule react-hooks/exhaustive-deps är inte
    // konfigurerad i denna repo, så disable-kommentaren togs bort.
  }, [date, amountKr, supplier, description, accountNumber, vatCodeId])

  // VS-18: Auto-focus belopp-fältet när sheet öppnas. Belopp är nästan
  // alltid det första användaren vill mata in (datum är default = idag).
  // setTimeout 0 så Radix-portal hinner mounta innan fokus försöks.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => amountInputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  // VS-145e: Pre-warm Tesseract-worker när komponenten mountas, så att
  // första riktiga OCR-anropet är near-instant. Fire-and-forget — ingen
  // await, inget loading-state, blockerar inte sheet-rendering.
  // prewarmWorker är idempotent (singleton-cache) och no-op i test-miljö.
  useEffect(() => {
    void prewarmWorker()
  }, [])

  // Default till IP1 (25%) när vatCodes laddats.
  useEffect(() => {
    if (vatCodeId === null && vatCodes.length > 0) {
      const ip1 = vatCodes.find((vc) => vc.rate_percent === 25) ?? vatCodes[0]
      setVatCodeId(ip1.id)
    }
  }, [vatCodes, vatCodeId])

  // Hämta full counterparty för default_expense_account-fallback.
  const { data: supplierFull } = useCounterparty(supplier?.id)

  // VS-145c: Suppliers-lista för OCR-fuzzy-match. Hooken filtrerar redan
  // på aktivt bolag (M158) och type='supplier'. Ref så runOcr kan läsa
  // senaste listan utan att vara dep:ad.
  const { data: suppliersData } = useCounterparties({
    type: 'supplier',
    active_only: true,
  })
  const suppliersRef = useRef<
    { id: number; name: string; org_number: string | null }[]
  >([])
  useEffect(() => {
    suppliersRef.current = (suppliersData ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      // VS-145d: ta med org_number för prioriterad org-nr-match.
      org_number: s.org_number,
    }))
  }, [suppliersData])

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
    submittingRef.current = false
    setSubmitting(false)
    setReceiptPath(prefilledReceipt ? prefilledReceipt.file_path : null)
    setOcrSuggestion(null)
    setOcrLoading(false)
    ocrTokenRef.current += 1
  }, [open, prefilledReceipt])

  // VS-145b: Är path en OCR-bar bild? PDF skip för v1.
  function isOcrSupported(path: string): boolean {
    return /\.(jpg|jpeg|png|webp|heic)$/i.test(path)
  }

  async function runOcr(blob: Blob) {
    const token = ++ocrTokenRef.current
    setOcrLoading(true)
    try {
      const fields = await ocrReceipt(blob)
      if (token !== ocrTokenRef.current) return
      // VS-145c/d: kör match mot aktuell suppliers-lista. org-nr (om OCR
      // hittade giltigt) prioriteras över hint i matchSupplier.
      const hint = fields.supplier_hint ?? ''
      const supplier_match =
        hint || fields.org_number
          ? matchSupplier(hint, suppliersRef.current, {
              orgNumber: fields.org_number,
            })
          : null
      // Avgör om matchen drevs av org-nr (för "matchad via org-nr"-text).
      const supplier_match_via_org = !!(
        supplier_match &&
        fields.org_number &&
        suppliersRef.current.find((s) => s.id === supplier_match.id)
          ?.org_number &&
        normalizeMaybe(
          suppliersRef.current.find((s) => s.id === supplier_match.id)!
            .org_number,
        ) === normalizeMaybe(fields.org_number)
      )
      // Visa bara om vi har något att föreslå (>= 1 fält eller supplier-match).
      const hasAny =
        fields.amount_kr !== undefined ||
        fields.date !== undefined ||
        fields.supplier_hint !== undefined ||
        fields.org_number !== undefined ||
        supplier_match !== null
      if (hasAny)
        setOcrSuggestion({ ...fields, supplier_match, supplier_match_via_org })
    } catch (e) {
      // M133-mönster: tyst felhantering, ingen UI-störning. Logga bara.
      console.warn('[BokforKostnadSheet] OCR failed:', e)
    } finally {
      if (token === ocrTokenRef.current) setOcrLoading(false)
    }
  }

  async function ocrFromPath(path: string) {
    if (!isOcrSupported(path)) return
    try {
      const r = await window.api.getReceiptAbsolutePath({ receipt_path: path })
      if (!r.success) return
      const res = await fetch(r.data.url)
      if (!res.ok) return
      const blob = await res.blob()
      await runOcr(blob)
    } catch (e) {
      console.warn('[BokforKostnadSheet] OCR fetch failed:', e)
    }
  }

  async function handlePickReceipt() {
    const res = await window.api.selectReceiptFile()
    if (!res.success) return
    if (res.data && res.data.filePath) {
      setReceiptPath(res.data.filePath)
      void ocrFromPath(res.data.filePath)
    }
  }

  function applyOcrSuggestion() {
    if (!ocrSuggestion) return
    if (ocrSuggestion.amount_kr !== undefined) {
      // Svenskt komma-format för konsistens med befintlig input.
      setAmountKr(ocrSuggestion.amount_kr.toFixed(2).replace('.', ','))
    }
    if (ocrSuggestion.date !== undefined) {
      setDate(ocrSuggestion.date)
    }
    // VS-145c: pre-fyll counterparty om fuzzy-match hittades.
    if (ocrSuggestion.supplier_match) {
      setSupplier({
        id: ocrSuggestion.supplier_match.id,
        name: ocrSuggestion.supplier_match.name,
      })
    }
    setOcrSuggestion(null)
  }

  function dismissOcrSuggestion() {
    setOcrSuggestion(null)
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

  // VS-27: Slå upp namn för fasta konton (2640 ingående moms, 2440
  // leverantörsskuld) från kontoplan, fall tillbaka till hårdkodade
  // labels om kontot saknas (kundens chart kan ha ändrat numreringen).
  function accountName(num: string, fallback: string): string {
    return allAccounts.find((a) => a.account_number === num)?.name ?? fallback
  }

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

  // VS-28: Lista vad som saknas för att kunna submitta. Visas som
  // diskret hint vid disabled submit-knapp.
  const missingFields: string[] = []
  if (amountInclVatOre <= 0) missingFields.push('belopp')
  if (!supplier) missingFields.push('leverantör')
  if (description.trim().length === 0) missingFields.push('beskrivning')

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
    if (submittingRef.current) return
    if (!canSubmit || !activeFiscalYear || !supplier || vatCodeId === null)
      return

    submittingRef.current = true
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
        setErrorField(draft.field ?? null)
        submittingRef.current = false
        setSubmitting(false)
        return
      }

      const finalized = await window.api.finalizeExpense({ id: draft.data.id })
      if (!finalized.success) {
        setError(finalized.error)
        setErrorField(finalized.field ?? null)
        submittingRef.current = false
        setSubmitting(false)
        return
      }

      // VS-38: Receipt-attach EFTER finalize — undviker föräldralös receipt-fil
      // om finalize failar (annars skulle filen kopieras till disken och
      // expenses.receipt_path uppdateras på en draft som sedan inte kan bokas).
      // Best-effort: attach-fel blockerar inte bokföringen, användaren får
      // toast.warning för manuellt re-attach.
      //
      // VS-112: Om prefilledReceipt finns ligger filen redan i receipts-
      // inbox/ — vi länkar bara raden till den nya expense:n via
      // linkReceiptToExpense (sätter receipts.status='booked' och speglar
      // file_path till expenses.receipt_path) istället för att kopiera.
      let receiptAttachFailed = false
      if (prefilledReceipt) {
        try {
          const r = await window.api.linkReceiptToExpense({
            receipt_id: prefilledReceipt.receipt_id,
            expense_id: draft.data.id,
            company_id: activeCompany!.id,
          })
          if (!r.success) receiptAttachFailed = true
        } catch {
          receiptAttachFailed = true
        }
      } else if (receiptPath) {
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
        } catch (e) {
          // VS-40: best-effort men inte tyst — logga så fel kan upptäckas
          // i felsökning utan att blockera bokföringen.
          console.warn(
            '[BokforKostnadSheet] setCounterpartyDefaultAccount failed:',
            e,
          )
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
      submittingRef.current = false
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
      <div
        className={
          receiptPath
            ? 'grid grid-cols-1 gap-6 min-[900px]:grid-cols-[3fr_2fr]'
            : 'grid grid-cols-[200px_1fr] gap-6'
        }
        data-testid="vardag-kostnad-layout"
        data-split={receiptPath ? 'true' : 'false'}
      >
        {!receiptPath && (
          <ReceiptVisual
            path={null}
            onPick={handlePickReceipt}
            onClear={() => setReceiptPath(null)}
            onDropPath={(p, file) => {
              setReceiptPath(p)
              // VS-145b: drop-File är redan en Blob — kör OCR direkt utan
              // att gå via fetch+absolute-path. PDF skip via isOcrSupported.
              if (file && isOcrSupported(p)) void runOcr(file)
            }}
            locked={false}
          />
        )}
        <div className="space-y-5">
          {receiptPath && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border-default)] bg-[var(--surface-secondary)]/40 px-3 py-2 text-xs">
              <span
                className="truncate font-mono text-[var(--text-secondary)]"
                title={
                  prefilledReceipt
                    ? prefilledReceipt.original_filename
                    : receiptPath
                }
                data-testid="vardag-kostnad-receipt-attached"
              >
                📎{' '}
                {prefilledReceipt
                  ? prefilledReceipt.original_filename
                  : pathBasename(receiptPath)}
              </span>
              {!prefilledReceipt && (
                <button
                  type="button"
                  onClick={() => setReceiptPath(null)}
                  className="text-[10px] text-[var(--text-faint)] underline hover:text-[var(--text-primary)]"
                  data-testid="vardag-kostnad-receipt-clear"
                >
                  Ta bort
                </button>
              )}
            </div>
          )}
          {ocrLoading && (
            <p
              className="text-[11px] text-[var(--text-faint)]"
              data-testid="vardag-kostnad-ocr-loading"
              aria-live="polite"
            >
              Läser kvitto…
            </p>
          )}
          {ocrSuggestion && (
            <Callout variant="tip" data-testid="vardag-kostnad-ocr-suggestion">
              <div className="flex flex-col gap-2">
                <p>{buildOcrSuggestionMessage(ocrSuggestion)}</p>
                {ocrSuggestion.supplier_match ? (
                  <p
                    className="text-xs text-[var(--text-faint)]"
                    data-testid="vardag-kostnad-ocr-supplier-match"
                  >
                    Förslag på leverantör: {ocrSuggestion.supplier_match.name}
                    {ocrSuggestion.supplier_match_via_org
                      ? ' (matchad via org-nr)'
                      : ''}
                  </p>
                ) : (
                  ocrSuggestion.supplier_hint && (
                    <p
                      className="text-xs text-[var(--text-faint)]"
                      data-testid="vardag-kostnad-ocr-supplier-hint"
                    >
                      Förslag på leverantör: {ocrSuggestion.supplier_hint}
                    </p>
                  )
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={applyOcrSuggestion}
                    className="rounded-md bg-[var(--color-brand-500)] px-3 py-1 text-xs font-medium text-white"
                    data-testid="vardag-kostnad-ocr-apply"
                  >
                    Tillämpa
                  </button>
                  <button
                    type="button"
                    onClick={dismissOcrSuggestion}
                    className="text-xs text-[var(--text-faint)] underline hover:text-[var(--text-primary)]"
                    data-testid="vardag-kostnad-ocr-dismiss"
                  >
                    Avvisa
                  </button>
                </div>
              </div>
            </Callout>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Datum" hint="ÅÅÅÅ-MM-DD">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={
                  !!dateError ||
                  errorField === 'expense_date' ||
                  errorField === 'date'
                }
                aria-describedby={
                  dateError ? 'vardag-kostnad-date-err' : undefined
                }
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
                aria-describedby={
                  amountInclVatOre > 0 ? 'vardag-kostnad-summary' : undefined
                }
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

          {/* VS-32: "Att betala"-sammanställning matchar SkapaFakturaSheets
              VS-32-summary. Visar Netto/Moms/Totalt så användaren ser
              uppdelningen tydligt innan submit. */}
          {amountInclVatOre > 0 && (
            <div
              id="vardag-kostnad-summary"
              className="rounded-md border border-[var(--border-default)] bg-[var(--surface-secondary)]/40 p-3"
              aria-live="polite"
              data-testid="vardag-kostnad-summary"
            >
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                Att betala
              </p>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <CostSummaryCell label="Netto" value={formatKr(netOre)} />
                <CostSummaryCell label="Moms" value={formatKr(vatOre)} />
                <CostSummaryCell
                  label="Totalt"
                  value={formatKr(amountInclVatOre)}
                  emphasis
                  testId="vardag-kostnad-summary-total"
                />
              </div>
            </div>
          )}

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
                    description={accountName('2640', 'Ingående moms')}
                    debit={vatOre}
                  />
                )}
                <KonteringRow
                  account="2440"
                  description={accountName('2440', 'Leverantörsskuld')}
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
            <Callout variant="danger" data-testid="vardag-kostnad-error">
              {error}
            </Callout>
          )}

          <div className="flex items-end justify-between gap-2">
            <button
              type="button"
              onClick={openInBokforare}
              className="text-xs text-[var(--text-faint)] underline hover:text-[var(--text-primary)]"
              data-testid="vardag-kostnad-multiline-cta"
            >
              Behöver dela upp på flera konton?
            </button>
            <div className="flex flex-col items-end gap-1">
              {!canSubmit && missingFields.length > 0 && !submitting && (
                <p
                  className="text-[11px] text-[var(--text-faint)]"
                  data-testid="vardag-kostnad-missing-hint"
                >
                  Saknas: {missingFields.join(', ')}
                </p>
              )}
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
                    keys={[modKey(), '↵']}
                    ariaLabel={`${modLabel()} plus Enter`}
                    size="sm"
                    className="opacity-80"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
        {receiptPath && (
          <div
            className="min-h-[400px]"
            data-testid="vardag-kostnad-preview-col"
          >
            <ReceiptPreviewPane receiptPath={receiptPath} />
          </div>
        )}
      </div>
    </BottomSheet>
  )
}

function ReceiptVisual({
  path,
  onPick,
  onClear,
  onDropPath,
  locked = false,
}: {
  path: string | null
  onPick: () => void
  onClear: () => void
  onDropPath: (filePath: string, file?: File) => void
  /** VS-112: när true visas bara filename utan möjlighet att byta. */
  locked?: boolean
}) {
  const [dragActive, setDragActive] = useState(false)

  function extractPath(file: File): string | null {
    // VS-43: Föredra Electron 32+ webUtils.getPathForFile (exponerad via
    // preload). Fall tillbaka till deprecated file.path för bakåt-
    // kompatibilitet med tidigare Electron-versioner.
    if (typeof window.api?.getPathForFile === 'function') {
      const p = window.api.getPathForFile(file)
      if (p) return p
    }
    const f = file as File & { path?: string }
    return typeof f.path === 'string' && f.path.length > 0 ? f.path : null
  }
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
        {!locked && (
          <button
            type="button"
            onClick={onClear}
            className="mt-2 text-[10px] text-[var(--text-faint)] underline hover:text-[var(--text-primary)]"
            data-testid="vardag-kostnad-receipt-clear"
          >
            Ta bort
          </button>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onPick}
      onDragOver={(e) => {
        e.preventDefault()
        if (!dragActive) setDragActive(true)
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragActive(false)
        const file = e.dataTransfer.files[0]
        if (!file) return
        const p = extractPath(file)
        if (p) onDropPath(p, file)
      }}
      className={`flex aspect-[3/4] flex-col items-center justify-center rounded-md border border-dashed text-center transition-colors ${
        dragActive
          ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10'
          : 'border-[var(--border-strong)] bg-[var(--surface-secondary)]/40 hover:bg-[var(--surface-secondary)]/70'
      }`}
      data-testid="vardag-kostnad-receipt-pick"
    >
      <div className="mb-2 text-3xl">🧾</div>
      <p className="text-xs text-[var(--text-faint)]">
        Dra in kvitto eller klicka för att välja
      </p>
      <p className="mt-1 text-[10px] text-[var(--text-faint)]">
        PDF, PNG, JPG, HEIC
      </p>
    </button>
  )
}

function CostSummaryCell({
  label,
  value,
  emphasis,
  testId,
}: {
  label: string
  value: string
  emphasis?: boolean
  testId?: string
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-[var(--text-faint)]">
        {label}
      </span>
      <span
        className={
          emphasis
            ? 'font-mono text-base font-semibold text-[var(--text-primary)]'
            : 'font-mono text-sm text-[var(--text-secondary)]'
        }
        data-testid={testId}
      >
        {value}
      </span>
    </div>
  )
}
