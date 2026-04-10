import { z } from 'zod'
import { SaveExpenseDraftSchema } from '../../../shared/ipc-schemas'
import { toOre } from '../format'

const ExpenseLineFormSchema = z.object({
  temp_id: z.string(),
  description: z.string(),
  account_number: z.string(),
  quantity: z.number().int(),
  unit_price_kr: z.number(),
  vat_code_id: z.number(),
  vat_rate: z.number(),
})

export type ExpenseLineForm = z.infer<typeof ExpenseLineFormSchema>

export const ExpenseFormStateSchema = z.object({
  _supplier: z.object({ id: z.number(), name: z.string() }).nullable()
    .refine(v => v !== null, 'Välj en leverantör'),
  supplierInvoiceNumber: z.string(),
  expenseDate: z.string().min(1, 'Välj datum'),
  paymentTerms: z.number(),
  dueDate: z.string().min(1),
  description: z.string().min(1, 'Ange en beskrivning'),
  notes: z.string(),
  lines: z.array(ExpenseLineFormSchema).min(1, 'Lägg till minst en kostnadsrad'),
})

export type ExpenseFormState = z.infer<typeof ExpenseFormStateSchema>

export const EXPENSE_DEFAULTS: ExpenseFormState = {
  _supplier: null as unknown as ExpenseFormState['_supplier'],
  supplierInvoiceNumber: '',
  expenseDate: '',
  paymentTerms: 30,
  dueDate: '',
  description: '',
  notes: '',
  lines: [],
}

export const ExpenseSavePayloadSchema = SaveExpenseDraftSchema
export type ExpenseSavePayload = z.infer<typeof ExpenseSavePayloadSchema>

export function transformExpenseForm(
  form: ExpenseFormState,
  fiscalYearId: number,
): ExpenseSavePayload {
  return {
    fiscal_year_id: fiscalYearId,
    counterparty_id: form._supplier!.id,
    supplier_invoice_number: form.supplierInvoiceNumber.trim() || null,
    expense_date: form.expenseDate,
    due_date: form.dueDate,
    payment_terms: form.paymentTerms,
    description: form.description.trim(),
    notes: form.notes.trim() || '',
    lines: form.lines.map((line, i) => ({
      description: line.description,
      account_number: line.account_number,
      quantity: line.quantity,
      unit_price_ore: toOre(line.unit_price_kr),
      vat_code_id: line.vat_code_id,
      sort_order: i,
    })),
  }
}

function newTempId(): string {
  return `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function makeEmptyExpenseLine(defaultVatCodeId: number, defaultVatRate: number): ExpenseLineForm {
  return {
    temp_id: newTempId(),
    description: '',
    account_number: '',
    quantity: 1,
    unit_price_kr: 0,
    vat_code_id: defaultVatCodeId,
    vat_rate: defaultVatRate,
  }
}
