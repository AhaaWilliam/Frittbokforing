import { useMemo, useRef, useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type {
  ExpenseWithLines,
  ExpenseLine,
  VatCode,
} from '../../../shared/types'
import { toKr, todayLocal, addDaysLocal } from '../../lib/format'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { errorIdFor } from '../../lib/a11y'
import { SupplierPicker } from './SupplierPicker'
import {
  useCompany,
  useVatCodes,
  useAccounts,
  useExpenseDraft,
  useSaveExpenseDraft,
  useUpdateExpenseDraft,
  useDeleteExpenseDraft,
} from '../../lib/hooks'
import { useEntityForm } from '../../lib/use-entity-form'
import {
  ExpenseFormStateSchema,
  ExpenseSavePayloadSchema,
  transformExpenseForm,
  EXPENSE_DEFAULTS,
  makeEmptyExpenseLine,
  type ExpenseFormState,
  type ExpenseSavePayload,
  type ExpenseLineForm,
} from '../../lib/form-schemas/expense'
import { ExpenseLineRow } from './ExpenseLineRow'
import { ExpenseTotals } from './ExpenseTotals'
import { ConfirmDialog } from '../ui/ConfirmDialog'

// === Helpers ===

function buildInitialData(
  draft: ExpenseWithLines,
  vatCodes: VatCode[],
): Partial<ExpenseFormState> {
  return {
    _supplier: draft.counterparty_name
      ? { id: draft.counterparty_id, name: draft.counterparty_name }
      : { id: draft.counterparty_id, name: '' },
    expense_type: (draft.expense_type as 'normal' | 'credit_note') ?? 'normal',
    credits_expense_id: draft.credits_expense_id ?? null,
    supplierInvoiceNumber: draft.supplier_invoice_number ?? '',
    expenseDate: draft.expense_date,
    paymentTerms: draft.payment_terms,
    dueDate:
      draft.due_date ?? addDaysLocal(draft.expense_date, draft.payment_terms),
    description: draft.description,
    notes: draft.notes ?? '',
    lines: draft.lines.map((l: ExpenseLine) => {
      const vc = vatCodes.find((v) => v.id === l.vat_code_id)
      return {
        temp_id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        description: l.description,
        account_number: l.account_number,
        quantity: l.quantity,
        unit_price_kr: toKr(l.unit_price_ore),
        vat_code_id: l.vat_code_id,
        vat_rate: vc ? vc.rate_percent / 100 : 0.25,
      }
    }),
  }
}

// === Component ===
interface ExpenseFormProps {
  expenseId?: number
  onSave: () => void
  onCancel: () => void
}

const PAYMENT_TERMS_OPTIONS = [10, 15, 30, 60, 90]

const inputClass =
  'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'
const readOnlyInputClass =
  'block w-full rounded-md border border-input bg-muted px-3 py-2 text-sm'

export function ExpenseForm({ expenseId, onSave, onCancel }: ExpenseFormProps) {
  const { activeFiscalYear } = useFiscalYearContext()
  const { data: company } = useCompany()
  const { data: vatCodes = [] } = useVatCodes('incoming')
  const { data: accounts4 = [] } = useAccounts(
    company?.fiscal_rule ?? 'K2',
    4,
    true,
  )
  const { data: accounts5 = [] } = useAccounts(
    company?.fiscal_rule ?? 'K2',
    5,
    true,
  )
  const { data: accounts6 = [] } = useAccounts(
    company?.fiscal_rule ?? 'K2',
    6,
    true,
  )

  const expenseAccounts = useMemo(
    () => [...accounts4, ...accounts5, ...accounts6],
    [accounts4, accounts5, accounts6],
  )

  const { data: existingDraft } = useExpenseDraft(expenseId)
  const saveDraft = useSaveExpenseDraft()
  const updateDraft = useUpdateExpenseDraft()
  const deleteDraft = useDeleteExpenseDraft()

  const isEditing = !!expenseId
  const isDeleting = deleteDraft.isPending
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const initialData = useMemo(
    () =>
      existingDraft ? buildInitialData(existingDraft, vatCodes) : undefined,
    [existingDraft?.id],
  )

  const form = useEntityForm<ExpenseFormState, ExpenseSavePayload>({
    formSchema: ExpenseFormStateSchema,
    payloadSchema: ExpenseSavePayloadSchema,
    transform: (formData) =>
      transformExpenseForm(formData, activeFiscalYear!.id),
    defaults: {
      ...EXPENSE_DEFAULTS,
      expenseDate: todayLocal(),
      dueDate: addDaysLocal(todayLocal(), 30),
    },
    initialData,
    onSubmit: async (payload) => {
      if (isEditing && expenseId) {
        const { fiscal_year_id, ...rest } = payload
        await updateDraft.mutateAsync({ id: expenseId, ...rest })
      } else {
        await saveDraft.mutateAsync(payload)
      }
    },
    onSuccess: () => onSave(),
  })

  // Array helpers
  const lines = form.getField('lines') as ExpenseLineForm[]
  const linesRef = useRef(lines)
  linesRef.current = lines

  const defaultVcId = useMemo(() => {
    const vc = vatCodes.find((v) => v.rate_percent === 25) ?? vatCodes[0]
    return vc?.id ?? 0
  }, [vatCodes])

  const defaultVcRate = useMemo(() => {
    const vc = vatCodes.find((v) => v.rate_percent === 25) ?? vatCodes[0]
    return vc ? vc.rate_percent / 100 : 0.25
  }, [vatCodes])

  const addLine = useCallback(() => {
    form.setField('lines', [
      ...linesRef.current,
      makeEmptyExpenseLine(defaultVcId, defaultVcRate),
    ] as ExpenseFormState['lines'])
  }, [defaultVcId, defaultVcRate, form.setField])

  const removeLine = useCallback(
    (index: number) => {
      form.setField(
        'lines',
        linesRef.current.filter(
          (_, i) => i !== index,
        ) as ExpenseFormState['lines'],
      )
    },
    [form.setField],
  )

  const updateLine = useCallback(
    (index: number, updates: Partial<ExpenseLineForm>) => {
      form.setField(
        'lines',
        linesRef.current.map((l, i) =>
          i === index ? { ...l, ...updates } : l,
        ) as ExpenseFormState['lines'],
      )
    },
    [form.setField],
  )

  // Derived dueDate wrappers
  function handleDateChange(date: string) {
    form.setField('expenseDate', date as ExpenseFormState['expenseDate'])
    form.setField(
      'dueDate',
      addDaysLocal(
        date,
        form.getField('paymentTerms') as number,
      ) as ExpenseFormState['dueDate'],
    )
  }

  function handlePaymentTermsChange(terms: number) {
    form.setField('paymentTerms', terms as ExpenseFormState['paymentTerms'])
    form.setField(
      'dueDate',
      addDaysLocal(
        form.getField('expenseDate') as string,
        terms,
      ) as ExpenseFormState['dueDate'],
    )
  }

  function handleSupplierChange(s: {
    id: number
    name: string
    default_payment_terms: number
  }) {
    form.setField('_supplier', {
      id: s.id,
      name: s.name,
    } as ExpenseFormState['_supplier'])
    const terms = s.default_payment_terms
    form.setField('paymentTerms', terms as ExpenseFormState['paymentTerms'])
    form.setField(
      'dueDate',
      addDaysLocal(
        form.getField('expenseDate') as string,
        terms,
      ) as ExpenseFormState['dueDate'],
    )
  }

  // Totals computed by ExpenseTotals component (per-rad avrundning, M129)

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

  async function handleDeleteConfirmed() {
    if (!expenseId) return
    setShowDeleteConfirm(false)
    try {
      await deleteDraft.mutateAsync({ id: expenseId })
      onSave()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Kunde inte ta bort utkastet',
      )
    }
  }

  return (
    <div ref={formRef} className="flex flex-1 flex-col overflow-auto">
      <div className="space-y-6 px-8 py-6">
        {form.submitError && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {form.submitError}
          </div>
        )}

        {/* Credit note indicator */}
        {(form.getField('expense_type') as string) === 'credit_note' && (
          <div className="rounded-md border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-800">
            <span className="font-medium">Leverantörskredit (utkast)</span>
            {existingDraft?.notes && (
              <span className="ml-1">&mdash; {existingDraft.notes}</span>
            )}
          </div>
        )}

        {/* Supplier */}
        <div>
          <label className="mb-1 block text-sm font-medium">
            Leverant&ouml;r
          </label>
          <SupplierPicker
            value={form.getField('_supplier') as ExpenseFormState['_supplier']}
            onChange={handleSupplierChange}
            aria-invalid={!!form.errors._supplier}
            aria-describedby={
              form.errors._supplier ? errorIdFor('expense-supplier') : undefined
            }
          />
          {form.errors._supplier && (
            <p
              role="alert"
              id={errorIdFor('expense-supplier')}
              className="mt-1 text-xs text-red-600"
            >
              {form.errors._supplier}
            </p>
          )}
        </div>

        {/* Supplier invoice number + dates */}
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label
              htmlFor="expense-supplier-invoice-number"
              className="mb-1 block text-sm font-medium"
            >
              Leverant&ouml;rsfakturanr
            </label>
            <input
              id="expense-supplier-invoice-number"
              type="text"
              value={form.getField('supplierInvoiceNumber') as string}
              onChange={(e) =>
                form.setField(
                  'supplierInvoiceNumber',
                  e.target.value as ExpenseFormState['supplierInvoiceNumber'],
                )
              }
              placeholder="Valfritt"
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="expense-date"
              className="mb-1 block text-sm font-medium"
            >
              Datum
            </label>
            <input
              id="expense-date"
              type="date"
              value={form.getField('expenseDate') as string}
              onChange={(e) => handleDateChange(e.target.value)}
              aria-invalid={!!form.errors.expenseDate}
              aria-describedby={
                form.errors.expenseDate ? 'expense-date-error' : undefined
              }
              className={inputClass}
            />
            {form.errors.expenseDate && (
              <p
                id="expense-date-error"
                role="alert"
                data-testid="expense-date-error"
                className="mt-1 text-xs text-red-600"
              >
                {form.errors.expenseDate}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="expense-payment-terms"
              className="mb-1 block text-sm font-medium"
            >
              Betalningsvillkor
            </label>
            <select
              id="expense-payment-terms"
              value={form.getField('paymentTerms') as number}
              onChange={(e) =>
                handlePaymentTermsChange(parseInt(e.target.value, 10))
              }
              className={inputClass}
            >
              {PAYMENT_TERMS_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t} dagar
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="expense-due-date"
              className="mb-1 block text-sm font-medium"
            >
              F&ouml;rfallodatum
            </label>
            <input
              id="expense-due-date"
              type="date"
              readOnly
              value={form.getField('dueDate') as string}
              className={readOnlyInputClass}
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label
            htmlFor="expense-description"
            className="mb-1 block text-sm font-medium"
          >
            Beskrivning
          </label>
          <input
            id="expense-description"
            type="text"
            value={form.getField('description') as string}
            onChange={(e) =>
              form.setField(
                'description',
                e.target.value as ExpenseFormState['description'],
              )
            }
            placeholder="T.ex. kontorsmaterial, konsulttj&auml;nst..."
            aria-invalid={form.errors.description ? true : undefined}
            aria-describedby={
              form.errors.description
                ? errorIdFor('expense-description')
                : undefined
            }
            className={inputClass}
          />
          {form.errors.description && (
            <p
              role="alert"
              id={errorIdFor('expense-description')}
              className="mt-1 text-xs text-red-600"
            >
              {form.errors.description}
            </p>
          )}
        </div>

        {/* Expense lines */}
        <div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                <th className="px-2 py-2">Beskrivning</th>
                <th className="px-2 py-2 w-44">Konto</th>
                <th className="px-2 py-2 w-20">Antal</th>
                <th className="px-2 py-2 w-24">Pris (kr)</th>
                <th className="px-2 py-2 w-32">Moms</th>
                <th className="px-2 py-2 w-24 text-right">Summa</th>
                <th className="px-2 py-2 w-10">
                  <span className="sr-only">Åtgärd</span>
                </th>
              </tr>
            </thead>
            <tbody aria-live="polite">
              {lines.map((line, i) => (
                <ExpenseLineRow
                  key={line.temp_id}
                  line={line}
                  index={i}
                  expenseAccounts={expenseAccounts}
                  vatCodes={vatCodes}
                  onUpdate={updateLine}
                  onRemove={removeLine}
                />
              ))}
            </tbody>
          </table>
          <button
            type="button"
            onClick={addLine}
            className="mt-2 rounded-md border border-dashed border-input px-3 py-1.5 text-sm text-muted-foreground hover:border-primary hover:text-primary"
          >
            L&auml;gg till rad
          </button>
          {form.errors.lines && (
            <p
              role="alert"
              id={errorIdFor('expense-lines')}
              className="mt-1 text-xs text-red-600"
            >
              {form.errors.lines}
            </p>
          )}
        </div>

        {/* Totals */}
        <ExpenseTotals lines={lines} />

        {/* Notes */}
        <div>
          <label
            htmlFor="expense-notes"
            className="mb-1 block text-sm font-medium"
          >
            Anteckningar
          </label>
          <textarea
            id="expense-notes"
            value={form.getField('notes') as string}
            onChange={(e) =>
              form.setField(
                'notes',
                e.target.value as ExpenseFormState['notes'],
              )
            }
            rows={2}
            className={`${inputClass} placeholder:text-muted-foreground`}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 border-t pt-4">
          <button
            type="button"
            onClick={() => handleSubmitWithFocus()}
            disabled={!activeFiscalYear || form.isSubmitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {form.isSubmitting ? 'Sparar...' : 'Spara utkast'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Avbryt
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              className="ml-auto rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {isDeleting ? 'Tar bort...' : 'Ta bort'}
            </button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Ta bort utkast"
        description="Vill du verkligen ta bort detta utkast? Åtgärden kan inte ångras."
        confirmLabel="Ta bort"
        variant="danger"
        onConfirm={handleDeleteConfirmed}
      />
    </div>
  )
}
