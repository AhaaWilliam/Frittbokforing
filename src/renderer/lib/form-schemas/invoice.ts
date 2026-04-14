import { z } from 'zod'
import { SaveDraftInputSchema } from '../../../shared/ipc-schemas'
import { MAX_QTY_INVOICE, ERR_MSG_MAX_QTY_INVOICE } from '../../../shared/constants'
import { toOre } from '../format'

export const InvoiceLineFormSchema = z.object({
  temp_id: z.string(),
  product_id: z.number().nullable(),
  description: z.string(),
  quantity: z.number()
    .min(0.01, { message: 'Antal måste vara minst 0,01' })
    .max(MAX_QTY_INVOICE, { message: ERR_MSG_MAX_QTY_INVOICE })
    .refine(
      (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9,
      { message: 'Quantity kan ha högst 2 decimaler' },
    ),
  unit_price_kr: z.number(),
  vat_code_id: z.number(),
  vat_rate: z.number(),
  unit: z.string(),
  account_number: z.string().nullable(),
})

export type InvoiceLineForm = z.infer<typeof InvoiceLineFormSchema>

export const InvoiceFormStateSchema = z.object({
  _customer: z.object({ id: z.number(), name: z.string() }).nullable()
    .refine(v => v !== null, 'Välj en kund'),
  invoiceDate: z.string().min(1, 'Välj fakturadatum'),
  paymentTerms: z.number(),
  dueDate: z.string().min(1),
  notes: z.string(),
  lines: z.array(InvoiceLineFormSchema).min(1, 'Lägg till minst en fakturarad'),
})

export type InvoiceFormState = z.infer<typeof InvoiceFormStateSchema>

export const INVOICE_DEFAULTS: InvoiceFormState = {
  _customer: null as unknown as InvoiceFormState['_customer'],
  invoiceDate: '',
  paymentTerms: 30,
  dueDate: '',
  notes: '',
  lines: [],
}

export const InvoiceSavePayloadSchema = SaveDraftInputSchema
export type InvoiceSavePayload = z.infer<typeof InvoiceSavePayloadSchema>

export function transformInvoiceForm(
  form: InvoiceFormState,
  fiscalYearId: number,
): InvoiceSavePayload {
  return {
    counterparty_id: form._customer!.id,
    fiscal_year_id: fiscalYearId,
    invoice_date: form.invoiceDate,
    due_date: form.dueDate,
    payment_terms: form.paymentTerms,
    notes: form.notes.trim() || null,
    currency: 'SEK' as const,
    lines: form.lines.map((line, i) => ({
      product_id: line.product_id,
      description: line.description,
      quantity: line.quantity,
      unit_price_ore: toOre(line.unit_price_kr),
      vat_code_id: line.vat_code_id,
      sort_order: i,
      account_number: line.product_id ? null : (line.account_number || null),
    })),
  }
}

function newTempId(): string {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function makeEmptyInvoiceLine(defaultVatCodeId: number): InvoiceLineForm {
  return {
    temp_id: newTempId(),
    product_id: null,
    description: '',
    quantity: 1,
    unit_price_kr: 0,
    vat_code_id: defaultVatCodeId,
    vat_rate: 0.25,
    unit: 'styck',
    account_number: null,
  }
}
