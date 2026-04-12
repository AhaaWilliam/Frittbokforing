import { useMemo } from 'react'
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
import { useEntityForm } from '../../lib/use-entity-form'
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

  const form = useEntityForm<ManualEntryFormState, ManualEntrySavePayload, { id: number }>({
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
        await updateDraft.mutateAsync({ id: initialData.id, entry_date, description, lines })
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
    form.setField('lines', [...lines, makeEmptyManualLine()] as ManualEntryFormState['lines'])
  }

  function removeLine(index: number) {
    if (lines.length <= 1) return
    form.setField('lines', lines.filter((_, i) => i !== index) as ManualEntryFormState['lines'])
  }

  function updateLineField(index: number, field: keyof ManualEntryLineForm, value: string) {
    form.setField('lines', lines.map((l, i) => i === index ? { ...l, [field]: value } : l) as ManualEntryFormState['lines'])
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
  const totalDebit = lines.reduce((sum, l) => sum + parseSwedishAmount(l.debitKr), 0)
  const totalCredit = lines.reduce((sum, l) => sum + parseSwedishAmount(l.creditKr), 0)
  const diff = totalDebit - totalCredit
  const canFinalize = (form.getField('entryDate') as string) !== '' &&
    lines.filter(l => parseSwedishAmount(l.debitKr) > 0 || parseSwedishAmount(l.creditKr) > 0).length >= 2 &&
    diff === 0

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
        await updateDraft.mutateAsync({ id: initialData.id, entry_date, description, lines: payloadLines })
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

  const isSaving =
    saveDraft.isPending || updateDraft.isPending || finalize.isPending || form.isSubmitting

  return (
    <div className="flex flex-1 flex-col overflow-auto px-8 py-6">
      <h2 className="mb-6 text-lg font-medium">
        {initialData
          ? 'Redigera bokf\u00f6ringsorder'
          : 'Ny bokf\u00f6ringsorder'}
      </h2>

      {form.submitError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {form.submitError}
        </div>
      )}

      {/* Header inputs */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Datum</label>
          <input
            type="date"
            value={form.getField('entryDate') as string}
            onChange={(e) =>
              form.setField('entryDate', e.target.value as ManualEntryFormState['entryDate'])
            }
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {form.errors.entryDate && (
            <p className="mt-1 text-xs text-red-600">{form.errors.entryDate}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Beskrivning</label>
          <input
            type="text"
            value={form.getField('description') as string}
            onChange={(e) =>
              form.setField('description', e.target.value as ManualEntryFormState['description'])
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
              <th className="w-32 pb-2 pr-2 font-medium text-right">Kredit</th>
              <th className="pb-2 pr-2 font-medium">Text</th>
              <th className="w-8 pb-2 font-medium" />
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
                        updateLineField(index, 'accountNumber', e.target.value)
                      }
                      placeholder="1910"
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
                      className="w-full rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </td>
                  <td className="py-1.5">
                    <button
                      type="button"
                      onClick={() => removeLine(index)}
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                      title="Ta bort rad"
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
        <p className="mt-1 text-xs text-red-600">{form.errors.lines}</p>
      )}

      {/* Totals */}
      <div className="mt-4 flex items-center gap-6 rounded-md border px-4 py-3 text-sm">
        <span>
          <span className="text-muted-foreground">Summa debet:</span>{' '}
          <span className="font-medium font-mono">{formatKr(totalDebit)}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Summa kredit:</span>{' '}
          <span className="font-medium font-mono">{formatKr(totalCredit)}</span>
        </span>
        <span>
          <span className="text-muted-foreground">Differens:</span>{' '}
          <span
            className={`font-medium font-mono ${
              diff === 0 ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {formatKr(Math.abs(diff))}
          </span>
        </span>
      </div>

      {/* Action buttons */}
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => form.handleSubmit()}
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
  )
}
