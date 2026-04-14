import type { InvoiceWithLines } from '../../../../src/shared/types'

// ── Factory ─────────────────────────────────────────────────────────

export function makeInvoiceDraft(
  overrides?: Partial<InvoiceWithLines>,
): InvoiceWithLines {
  return {
    id: 101,
    counterparty_id: 1,
    counterparty_name: 'Acme AB',
    fiscal_year_id: 1,
    invoice_type: 'outgoing',
    invoice_number: 'F-1001',
    invoice_date: '2026-01-15',
    due_date: '2026-02-14',
    status: 'draft',
    net_amount_ore: 125000,
    vat_amount_ore: 31250,
    total_amount_ore: 156250,
    currency: 'SEK',
    paid_amount_ore: 0,
    journal_entry_id: null,
    ocr_number: null,
    notes: null,
    payment_terms: 30,
    version: 1,
    created_at: '2026-01-15T12:00:00Z',
    updated_at: '2026-01-15T12:00:00Z',
    lines: [
      {
        id: 1,
        invoice_id: 101,
        product_id: null,
        description: 'Konsulttimme',
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
