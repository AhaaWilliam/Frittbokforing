import type { ExpenseWithLines, VatCode } from '../../../../src/shared/types'

export const defaultExpenseVatCodes: VatCode[] = [
  { id: 1, code: '25', description: 'Moms 25%', rate_percent: 25, vat_type: 'incoming', report_box: null },
  { id: 2, code: '12', description: 'Moms 12%', rate_percent: 12, vat_type: 'incoming', report_box: null },
  { id: 3, code: '06', description: 'Moms 6%', rate_percent: 6, vat_type: 'incoming', report_box: null },
]

export function makeExpenseDraft(overrides?: Partial<ExpenseWithLines>): ExpenseWithLines {
  return {
    id: 42,
    fiscal_year_id: 1,
    counterparty_id: 3,
    counterparty_name: 'Leverantör Ett AB',
    expense_type: 'normal',
    credits_expense_id: null,
    supplier_invoice_number: 'LF-001',
    expense_date: '2025-12-15',
    due_date: '2026-01-14',
    description: 'Kontorsmaterial',
    status: 'draft',
    payment_terms: 30,
    journal_entry_id: null,
    total_amount_ore: 125000,
    paid_amount_ore: 0,
    notes: 'Testanteckning',
    created_at: '2025-12-15T12:00:00Z',
    updated_at: '2025-12-15T12:00:00Z',
    lines: [
      {
        id: 1,
        expense_id: 42,
        description: 'Pennor',
        account_number: '5410',
        quantity: 1,
        unit_price_ore: 125000,
        vat_code_id: 1,
        line_total_ore: 125000,
        vat_amount_ore: 31250,
        sort_order: 0,
      },
    ],
    ...overrides,
  }
}
