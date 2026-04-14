import { useMemo, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import type { InvoiceWithLines } from '../../../shared/types'
import { toKr, todayLocal, addDaysLocal } from '../../lib/format'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import {
  useSaveDraft,
  useUpdateDraft,
  useDeleteDraft,
  useNextInvoiceNumber,
  useVatCodes,
} from '../../lib/hooks'
import { useEntityForm } from '../../lib/use-entity-form'
import {
  InvoiceFormStateSchema,
  InvoiceSavePayloadSchema,
  transformInvoiceForm,
  INVOICE_DEFAULTS,
  makeEmptyInvoiceLine,
  type InvoiceFormState,
  type InvoiceSavePayload,
  type InvoiceLineForm,
} from '../../lib/form-schemas/invoice'
import { CustomerPicker } from './CustomerPicker'
import { InvoiceLineRow } from './InvoiceLineRow'
import { InvoiceTotals } from './InvoiceTotals'

// === Helpers ===

function buildInitialData(
  draft: InvoiceWithLines,
  vatCodes: { id: number; rate_percent: number }[],
): Partial<InvoiceFormState> {
  return {
    _customer: draft.counterparty_name
      ? { id: draft.counterparty_id, name: draft.counterparty_name }
      : { id: draft.counterparty_id, name: '' },
    invoiceDate: draft.invoice_date,
    paymentTerms: draft.payment_terms,
    dueDate: draft.due_date,
    notes: draft.notes ?? '',
    lines: draft.lines.map((l) => {
      const vc = vatCodes.find((v) => v.id === l.vat_code_id)
      return {
        temp_id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        product_id: l.product_id,
        description: l.description,
        quantity: l.quantity,
        unit_price_kr: toKr(l.unit_price_ore),
        vat_code_id: l.vat_code_id,
        vat_rate: vc ? vc.rate_percent / 100 : 0.25,
        unit: 'styck',
        account_number: (l as { account_number?: string | null }).account_number ?? null,
      }
    }),
  }
}

// === Component ===
interface InvoiceFormProps {
  draft?: InvoiceWithLines
  onSave: () => void
  onCancel: () => void
}

const PAYMENT_TERMS_OPTIONS = [10, 15, 30, 60, 90]

export function InvoiceForm({ draft, onSave, onCancel }: InvoiceFormProps) {
  const { activeFiscalYear } = useFiscalYearContext()
  const { data: vatCodes = [] } = useVatCodes('outgoing')
  const saveDraft = useSaveDraft(activeFiscalYear?.id)
  const updateDraft = useUpdateDraft(activeFiscalYear?.id)
  const deleteDraft = useDeleteDraft(activeFiscalYear?.id)
  const { data: nextNum } = useNextInvoiceNumber(activeFiscalYear?.id)

  const initialData = useMemo(
    () => (draft ? buildInitialData(draft, vatCodes) : undefined),
    [draft?.id],
  )

  const form = useEntityForm<InvoiceFormState, InvoiceSavePayload>({
    formSchema: InvoiceFormStateSchema,
    payloadSchema: InvoiceSavePayloadSchema,
    transform: (formData) => transformInvoiceForm(formData, activeFiscalYear!.id),
    defaults: {
      ...INVOICE_DEFAULTS,
      invoiceDate: todayLocal(),
      dueDate: addDaysLocal(todayLocal(), 30),
    },
    initialData,
    onSubmit: async (payload) => {
      if (draft) {
        const { fiscal_year_id, ...rest } = payload
        await updateDraft.mutateAsync({ id: draft.id, ...rest })
      } else {
        await saveDraft.mutateAsync(payload)
      }
    },
    onSuccess: () => onSave(),
  })

  const isDeleting = deleteDraft.isPending

  // Array helpers
  const lines = form.getField('lines') as InvoiceLineForm[]
  const linesRef = useRef(lines)
  linesRef.current = lines

  const defaultVcId = useMemo(() => {
    const vc = vatCodes.find((v) => v.rate_percent === 25) ?? vatCodes[0]
    return vc?.id ?? 0
  }, [vatCodes])

  const addLine = useCallback(() => {
    form.setField('lines', [...linesRef.current, makeEmptyInvoiceLine(defaultVcId)] as InvoiceFormState['lines'])
  }, [defaultVcId, form.setField])

  const removeLine = useCallback((index: number) => {
    form.setField('lines', linesRef.current.filter((_, i) => i !== index) as InvoiceFormState['lines'])
  }, [form.setField])

  const updateLine = useCallback((index: number, updates: Partial<InvoiceLineForm>) => {
    form.setField('lines', linesRef.current.map((l, i) => i === index ? { ...l, ...updates } : l) as InvoiceFormState['lines'])
  }, [form.setField])

  // Derived dueDate wrappers
  function handleDateChange(date: string) {
    form.setField('invoiceDate', date as InvoiceFormState['invoiceDate'])
    form.setField('dueDate', addDaysLocal(date, form.getField('paymentTerms') as number) as InvoiceFormState['dueDate'])
  }

  function handlePaymentTermsChange(terms: number) {
    form.setField('paymentTerms', terms as InvoiceFormState['paymentTerms'])
    form.setField('dueDate', addDaysLocal(form.getField('invoiceDate') as string, terms) as InvoiceFormState['dueDate'])
  }

  function handleCustomerChange(c: { id: number; name: string; default_payment_terms: number }) {
    form.setField('_customer', { id: c.id, name: c.name } as InvoiceFormState['_customer'])
    const terms = c.default_payment_terms
    form.setField('paymentTerms', terms as InvoiceFormState['paymentTerms'])
    form.setField('dueDate', addDaysLocal(form.getField('invoiceDate') as string, terms) as InvoiceFormState['dueDate'])
  }

  async function handleDelete() {
    if (!draft) return
    const confirmed = window.confirm('Vill du verkligen ta bort detta utkast?')
    if (!confirmed) return
    try {
      await deleteDraft.mutateAsync({ id: draft.id })
      onSave()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Kunde inte ta bort utkastet')
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="space-y-6 px-8 py-6">
        {form.submitError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {form.submitError}
          </div>
        )}

        {/* Customer */}
        <div>
          <label className="mb-1 block text-sm font-medium">Kund</label>
          <CustomerPicker
            value={form.getField('_customer') as InvoiceFormState['_customer']}
            onChange={handleCustomerChange}
          />
          {form.errors._customer && (
            <p className="mt-1 text-xs text-red-600">{form.errors._customer}</p>
          )}
        </div>

        {/* Invoice details */}
        <div className="grid grid-cols-4 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Fakturanummer
            </label>
            <input
              type="text"
              readOnly
              value={
                draft
                  ? draft.invoice_number
                  : nextNum
                    ? String(nextNum.preview)
                    : ''
              }
              className="block w-full rounded-md border border-input bg-muted px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="invoice-date" className="mb-1 block text-sm font-medium">
              Fakturadatum
            </label>
            <input
              id="invoice-date"
              type="date"
              value={form.getField('invoiceDate') as string}
              onChange={(e) => handleDateChange(e.target.value)}
              aria-invalid={!!form.errors.invoiceDate}
              aria-describedby={form.errors.invoiceDate ? 'invoice-date-error' : undefined}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {form.errors.invoiceDate && (
              <p id="invoice-date-error" role="alert" data-testid="invoice-date-error" className="mt-1 text-xs text-red-600">{form.errors.invoiceDate}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Betalningsvillkor
            </label>
            <select
              value={form.getField('paymentTerms') as number}
              onChange={(e) =>
                handlePaymentTermsChange(parseInt(e.target.value, 10))
              }
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {PAYMENT_TERMS_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t} dagar
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              F&ouml;rfallodatum
            </label>
            <input
              type="date"
              readOnly
              value={form.getField('dueDate') as string}
              className="block w-full rounded-md border border-input bg-muted px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1 block text-sm font-medium">Anteckningar</label>
          <textarea
            value={form.getField('notes') as string}
            onChange={(e) =>
              form.setField('notes', e.target.value as InvoiceFormState['notes'])
            }
            rows={2}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Invoice lines */}
        <div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                <th className="px-2 py-2 w-40">Artikel</th>
                <th className="px-2 py-2">Beskrivning</th>
                <th className="px-2 py-2 w-20">Antal</th>
                <th className="px-2 py-2 w-24">Pris (kr)</th>
                <th className="px-2 py-2 w-28">Moms</th>
                <th className="px-2 py-2 w-24 text-right">Summa</th>
                <th className="px-2 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <InvoiceLineRow
                  key={line.temp_id}
                  line={line}
                  index={i}
                  counterpartyId={(form.getField('_customer') as InvoiceFormState['_customer'])?.id ?? null}
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
            <p className="mt-1 text-xs text-red-600">{form.errors.lines}</p>
          )}
        </div>

        {/* Totals */}
        <InvoiceTotals lines={lines} />

        {/* Actions */}
        <div className="flex items-center gap-3 border-t pt-4">
          <button
            type="button"
            onClick={() => form.handleSubmit()}
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
          {draft && draft.status === 'draft' && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="ml-auto rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {isDeleting ? 'Tar bort...' : 'Ta bort'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
