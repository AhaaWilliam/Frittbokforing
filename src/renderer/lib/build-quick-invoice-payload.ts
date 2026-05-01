import type { SaveDraftInput } from '../../shared/types'
import { addDays } from '../../shared/date-utils'

/**
 * VS-4: Vardag-sheets — bygg en SaveDraftInput (faktura) från
 * 1-rads "snabb-faktura"-fält.
 *
 * Användaren matar in:
 *  - kund (counterparty_id)
 *  - fakturadatum + förfallodatum (eller payment_terms)
 *  - 1 rad: beskrivning, antal (default 1), à-pris (kr), momssats
 *
 * Vi bygger en single-line invoice. Multi-line hänvisas till bokförare-
 * läget. Konto sätts från `counterparties.default_revenue_account` om
 * satt, annars `null` (server-side resolverar via vat_code-lookup eller
 * default 3010 vid bokning).
 *
 * Speglar buildQuickExpensePayload (VS-2) men för utgående faktura.
 */

export interface QuickInvoiceInput {
  fiscal_year_id: number
  counterparty_id: number
  invoice_date: string // YYYY-MM-DD
  payment_terms?: number // default 30
  description: string
  quantity?: number // default 1, ≤2 decimaler
  unit_price_ore: number // pris per enhet (netto, ören)
  vat_code_id: number
  account_number?: string | null // 4-siffrig BAS, eller null
}

export function buildQuickInvoicePayload(
  input: QuickInvoiceInput,
): SaveDraftInput {
  const paymentTerms = input.payment_terms ?? 30
  const dueDate = addDays(input.invoice_date, paymentTerms)
  const quantity = input.quantity ?? 1

  return {
    fiscal_year_id: input.fiscal_year_id,
    counterparty_id: input.counterparty_id,
    invoice_date: input.invoice_date,
    due_date: dueDate,
    payment_terms: paymentTerms,
    notes: null,
    lines: [
      {
        product_id: null,
        description: input.description,
        quantity,
        unit_price_ore: input.unit_price_ore,
        vat_code_id: input.vat_code_id,
        sort_order: 0,
        account_number: input.account_number ?? null,
      },
    ],
  }
}
