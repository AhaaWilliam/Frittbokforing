import { useMemo, useRef, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import {
  useCompany,
  useAccounts,
  useSaveManualEntryDraft,
  useUpdateManualEntryDraft,
  useFinalizeManualEntry,
} from '../../lib/hooks'
import { formatKr, toKr, todayLocal } from '../../lib/format'
import type { ManualEntryWithLines, Account } from '../../../shared/types'
import { errorIdFor } from '../../lib/a11y'
import { FieldError } from '../ui/FieldError'
import { useEntityForm } from '../../lib/use-entity-form'
import { useJournalPreview } from '../../lib/use-journal-preview'
import { ConsequencePane } from '../consequence/ConsequencePane'
import { Callout } from '../ui/Callout'
import {
  ManualEntryFormStateSchema,
  ManualEntrySavePayloadSchema,
  transformManualEntryForm,
  makeManualEntryDefaults,
  makeEmptyManualLine,
  parseSwedishAmount,
  type ManualEntryFormState,
  type ManualEntrySavePayload,
  type ManualEntryLineForm,
} from '../../lib/form-schemas/manual-entry'
import {
  calculateManualEntryTotals,
  formatDiffLabel,
} from '../../lib/manual-entry-calcs'

// === Helpers ===

function buildManualInitialData(
  initialData: ManualEntryWithLines,
): Partial<ManualEntryFormState> {
  return {
    entryDate: initialData.entry_date ?? '',
    description: initialData.description ?? '',
    lines:
      initialData.lines.length > 0
        ? initialData.lines.map((l) => ({
            key: crypto.randomUUID(),
            accountNumber: String(l.account_number),
            debitKr: l.debit_ore ? String(toKr(l.debit_ore)) : '',
            creditKr: l.credit_ore ? String(toKr(l.credit_ore)) : '',
            description: l.description ?? '',
          }))
        : [makeEmptyManualLine(), makeEmptyManualLine(), makeEmptyManualLine()],
  }
}

// === Props ===

interface ManualEntryFormProps {
  initialData?: ManualEntryWithLines
  fiscalYearId: number
  onSave: () => void
  onCancel: () => void
}

// === Component ===

export function ManualEntryForm({
  initialData,
  fiscalYearId,
  onSave,
  onCancel,
}: ManualEntryFormProps) {
  const { data: company } = useCompany()
  const fiscalRule = company?.fiscal_rule ?? 'K2'
  const { data: accounts } = useAccounts(fiscalRule, undefined, true)

  const saveDraft = useSaveManualEntryDraft()
  const updateDraft = useUpdateManualEntryDraft()
  const finalize = useFinalizeManualEntry()

  const initialFormData = useMemo(
    () => (initialData ? buildManualInitialData(initialData) : undefined),
    [initialData?.id],
  )

  const form = useEntityForm<
    ManualEntryFormState,
    ManualEntrySavePayload,
    { id: number }
  >({
    formSchema: ManualEntryFormStateSchema,
    payloadSchema: ManualEntrySavePayloadSchema,
    transform: (formData) => transformManualEntryForm(formData, fiscalYearId),
    defaults: {
      ...makeManualEntryDefaults(),
      entryDate: todayLocal(),
    },
    initialData: initialFormData,
    onSubmit: async (payload) => {
      if (initialData?.id) {
        const { entry_date, description, lines } = payload
        await updateDraft.mutateAsync({
          id: initialData.id,
          entry_date,
          description,
          lines,
        })
        return { id: initialData.id }
      }
      const result = await saveDraft.mutateAsync(payload)
      return result as { id: number }
    },
    onSuccess: () => onSave(),
  })

  // Array helpers
  const lines = form.getField('lines') as ManualEntryLineForm[]

  function addLine() {
    form.setField('lines', [
      ...lines,
      makeEmptyManualLine(),
    ] as ManualEntryFormState['lines'])
  }

  function removeLine(index: number) {
    if (lines.length <= 1) return
    form.setField(
      'lines',
      lines.filter((_, i) => i !== index) as ManualEntryFormState['lines'],
    )
  }

  function updateLineField(
    index: number,
    field: keyof ManualEntryLineForm,
    value: string,
  ) {
    form.setField(
      'lines',
      lines.map((l, i) =>
        i === index ? { ...l, [field]: value } : l,
      ) as ManualEntryFormState['lines'],
    )
  }

  // Account lookup map
  const accountMap = useMemo(() => {
    const map = new Map<string, Account>()
    if (accounts) {
      for (const acc of accounts) {
        map.set(acc.account_number, acc)
      }
    }
    return map
  }, [accounts])

  // Derived state (totals + balance indicator)
  const { totalDebit, totalCredit, diff } = calculateManualEntryTotals(lines)
  const diffLabel = formatDiffLabel(diff)
  const canFinalize =
    (form.getField('entryDate') as string) !== '' &&
    lines.filter(
      (l) =>
        parseSwedishAmount(l.debitKr) > 0 || parseSwedishAmount(l.creditKr) > 0,
    ).length >= 2 &&
    diff === 0

  // Sprint 18 — Live preview (ADR 006). Bygg PreviewInput från form-state
  // och hämta preview via useJournalPreview-hook. `null` när inga giltiga
  // rader finns — då fallback:ar ConsequencePane till idle-state utan
  // att IPC-anrop sker.
  const entryDate = form.getField('entryDate') as string
  const description = form.getField('description') as string
  const previewInput = useMemo(() => {
    const validLines = lines
      .filter(
        (l) =>
          l.accountNumber.length >= 4 &&
          (parseSwedishAmount(l.debitKr) > 0 ||
            parseSwedishAmount(l.creditKr) > 0),
      )
      .map((l) => ({
        account_number: l.accountNumber,
        debit_ore: parseSwedishAmount(l.debitKr),
        credit_ore: parseSwedishAmount(l.creditKr),
        description: l.description || undefined,
      }))
    if (validLines.length === 0) return null
    return {
      source: 'manual' as const,
      fiscal_year_id: fiscalYearId,
      entry_date: entryDate || undefined,
      description: description || undefined,
      lines: validLines,
    }
  }, [lines, entryDate, description, fiscalYearId])

  const preview = useJournalPreview(previewInput)

  // Lokal finalize
  async function handleFinalize() {
    const payload = transformManualEntryForm(
      {
        entryDate: form.getField('entryDate') as string,
        description: form.getField('description') as string,
        lines: form.getField('lines') as ManualEntryLineForm[],
      },
      fiscalYearId,
    )

    try {
      let id: number
      if (initialData?.id) {
        const { entry_date, description, lines: payloadLines } = payload
        await updateDraft.mutateAsync({
          id: initialData.id,
          entry_date,
          description,
          lines: payloadLines,
        })
        id = initialData.id
      } else {
        const result = await saveDraft.mutateAsync(payload)
        id = (result as { id: number }).id
      }
      await finalize.mutateAsync({ id, fiscal_year_id: fiscalYearId })
      onSave()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kunde inte bokföra')
    }
  }

  // F49: Focus-management on submit failure
  const formRef = useRef<HTMLDivElement>(null)
  const submitCountRef = useRef(0)

  const handleSubmitWithFocus = useCallback(async () => {
    submitCountRef.current += 1
    await form.handleSubmit()
  }, [form.handleSubmit])

  useEffect(() => {
    if (submitCountRef.current === 0) return
    if (Object.keys(form.errors).length === 0) return
    const firstInvalid = formRef.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    )
    firstInvalid?.focus()
  }, [form.errors])

  const isSaving =
    saveDraft.isPending ||
    updateDraft.isPending ||
    finalize.isPending ||
    form.isSubmitting

  return (
    <div className="flex flex-1 overflow-hidden">
      <div
        ref={formRef}
        className="flex flex-1 flex-col overflow-auto px-8 py-6"
        data-testid="manual-entry-form-pane"
      >
        <h2 className="mb-6 text-lg font-medium">
          {initialData
            ? 'Redigera bokf\u00f6ringsorder'
            : 'Ny bokf\u00f6ringsorder'}
        </h2>

        {form.submitError && (
          <div className="mb-4">
            <Callout variant="danger">{form.submitError}</Callout>
          </div>
        )}

        {/* Header inputs */}
        <div className="mb-6 grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="manual-entry-date"
              className="mb-1 block text-sm font-medium"
            >
              Datum
            </label>
            <input
              id="manual-entry-date"
              type="date"
              value={form.getField('entryDate') as string}
              onChange={(e) =>
                form.setField(
                  'entryDate',
                  e.target.value as ManualEntryFormState['entryDate'],
                )
              }
              aria-invalid={form.errors.entryDate ? true : undefined}
              aria-describedby={
                form.errors.entryDate
                  ? errorIdFor('manual-entry-date')
                  : undefined
              }
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {form.errors.entryDate && (
              <FieldError id={errorIdFor('manual-entry-date')}>
                {form.errors.entryDate}
              </FieldError>
            )}
          </div>
          <div>
            <label
              htmlFor="manual-entry-description"
              className="mb-1 block text-sm font-medium"
            >
              Beskrivning
            </label>
            <input
              id="manual-entry-description"
              type="text"
              value={form.getField('description') as string}
              onChange={(e) =>
                form.setField(
                  'description',
                  e.target.value as ManualEntryFormState['description'],
                )
              }
              placeholder="T.ex. Periodisering hyra"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Lines table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="w-8 pb-2 pr-2 font-medium">#</th>
                <th className="w-28 pb-2 pr-2 font-medium">Konto</th>
                <th className="pb-2 pr-2 font-medium">Kontonamn</th>
                <th className="w-32 pb-2 pr-2 font-medium text-right">Debet</th>
                <th className="w-32 pb-2 pr-2 font-medium text-right">
                  Kredit
                </th>
                <th className="pb-2 pr-2 font-medium">Text</th>
                <th className="w-8 pb-2 font-medium">
                  <span className="sr-only">Åtgärd</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const account = accountMap.get(line.accountNumber)
                return (
                  <tr key={line.key} className="border-b last:border-0">
                    <td className="py-1.5 pr-2 text-xs text-muted-foreground">
                      {index + 1}
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="text"
                        value={line.accountNumber}
                        onChange={(e) =>
                          updateLineField(
                            index,
                            'accountNumber',
                            e.target.value,
                          )
                        }
                        placeholder="1910"
                        aria-label={`Rad ${index + 1} konto`}
                        className="w-full rounded border bg-background px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </td>
                    <td className="py-1.5 pr-2 text-sm text-muted-foreground">
                      {account?.name ?? ''}
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="text"
                        value={line.debitKr}
                        onChange={(e) =>
                          updateLineField(index, 'debitKr', e.target.value)
                        }
                        placeholder="0"
                        aria-label={`Rad ${index + 1} debet`}
                        className="w-full rounded border bg-background px-2 py-1 text-right text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="text"
                        value={line.creditKr}
                        onChange={(e) =>
                          updateLineField(index, 'creditKr', e.target.value)
                        }
                        placeholder="0"
                        aria-label={`Rad ${index + 1} kredit`}
                        className="w-full rounded border bg-background px-2 py-1 text-right text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="text"
                        value={line.description}
                        onChange={(e) =>
                          updateLineField(index, 'description', e.target.value)
                        }
                        placeholder="Fritext"
                        aria-label={`Rad ${index + 1} text`}
                        className="w-full rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </td>
                    <td className="py-1.5">
                      <button
                        type="button"
                        onClick={() => removeLine(index)}
                        className="rounded p-1 text-muted-foreground hover:text-destructive"
                        aria-label={`Ta bort rad ${index + 1}`}
                      >
                        &times;
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Add line button */}
        <button
          type="button"
          onClick={addLine}
          className="mt-2 text-sm text-primary hover:underline"
        >
          + L&auml;gg till rad
        </button>
        {form.errors.lines && (
          <FieldError id={errorIdFor('manual-entry-lines')}>
            {form.errors.lines}
          </FieldError>
        )}

        {/* Totals */}
        <div className="mt-4 flex items-center gap-6 rounded-md border px-4 py-3 text-sm">
          <span>
            <span className="text-muted-foreground">Summa debet:</span>{' '}
            <span className="font-medium font-mono">
              {formatKr(totalDebit)}
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">Summa kredit:</span>{' '}
            <span className="font-medium font-mono">
              {formatKr(totalCredit)}
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">Differens:</span>{' '}
            <span
              className={`font-medium font-mono ${
                diffLabel.balanced ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {diff === 0
                ? formatKr(0)
                : diff > 0
                  ? `${formatKr(diff)} (debet > kredit)`
                  : `${formatKr(Math.abs(diff))} (kredit > debet)`}
            </span>
          </span>
        </div>

        {/* Action buttons */}
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleSubmitWithFocus()}
            disabled={isSaving}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted/50 disabled:opacity-50"
          >
            Spara utkast
          </button>
          <button
            type="button"
            onClick={handleFinalize}
            disabled={!canFinalize || isSaving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Bokf&ouml;r
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Avbryt
          </button>
        </div>
      </div>
      <aside
        className="hidden w-[360px] shrink-0 overflow-y-auto border-l border-[var(--border-default)] bg-[var(--surface)] lg:block"
        aria-label="Konsekvens"
        data-testid="manual-entry-consequence"
      >
        <ConsequencePane
          preview={preview.preview}
          pending={preview.pending}
          error={preview.error}
          idleHint="Lägg till konton och belopp för att se verifikatet förhandsgranskas."
        />
      </aside>
    </div>
  )
}
