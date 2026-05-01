import type { z } from 'zod'
import { SaveExpenseDraftSchema } from '../../shared/ipc-schemas'
import { addDays } from '../../shared/date-utils'

/**
 * VS-2: Vardag-sheets — bygg en SaveExpenseDraftPayload från enkla
 * "1-rads"-fält som BokforKostnadSheet samlar in.
 *
 * Användaren matar in:
 *  - totalbelopp inkl. moms (i ören)
 *  - momssats (via vat_code_id)
 *
 * Vi delar upp i netto + moms och bygger en single-line expense:
 *  - quantity = 1 (M130: expense är heltal, alltid 1 för 1-rads-fall)
 *  - unit_price_ore = round(total / (1 + rate/100))
 *  - due_date = expense_date + payment_terms (default 30 dagar)
 *
 * `unit_price_ore` är netto. Bokföringsmoms beräknas server-side från
 * vat_code_id × unit_price_ore × quantity (existerande loadVatCodeMap-väg).
 *
 * Avrundningsstrategi: nettot avrundas till heltal ören. Eventuellt
 * öres-fel mellan (netto + moms) och (totalbelopp) hanteras av
 * öresutjämning vid betalning (M99) — inte här.
 */
export type SaveExpenseDraftPayload = z.input<typeof SaveExpenseDraftSchema>

export interface QuickExpenseInput {
  fiscal_year_id: number
  expense_date: string // YYYY-MM-DD
  amount_incl_vat_ore: number // totalbelopp inkl. moms
  vat_rate_percent: number // 0, 6, 12, 25
  counterparty_id: number
  description: string
  account_number: string // 4-siffrig BAS
  vat_code_id: number
  payment_terms?: number // default 30
  supplier_invoice_number?: string | null
}

/**
 * Beräkna netto-belopp från totalbelopp inkl. moms.
 * Heltalsaritmetik (M131-anda): banker's rounding är ej kritiskt här
 * eftersom skillnaden absorberas av öresutjämning vid betalning.
 */
export function netFromInclVatOre(
  amountInclVatOre: number,
  vatRatePercent: number,
): number {
  if (amountInclVatOre < 0) {
    throw new Error('amount_incl_vat_ore måste vara ≥ 0')
  }
  if (vatRatePercent === 0) return amountInclVatOre
  // round(total * 100 / (100 + rate))
  return Math.round((amountInclVatOre * 100) / (100 + vatRatePercent))
}

export function buildQuickExpensePayload(
  input: QuickExpenseInput,
): SaveExpenseDraftPayload {
  const paymentTerms = input.payment_terms ?? 30
  const dueDate = addDays(input.expense_date, paymentTerms)
  const unitPriceOre = netFromInclVatOre(
    input.amount_incl_vat_ore,
    input.vat_rate_percent,
  )

  return {
    fiscal_year_id: input.fiscal_year_id,
    counterparty_id: input.counterparty_id,
    expense_type: 'normal',
    supplier_invoice_number: input.supplier_invoice_number ?? null,
    expense_date: input.expense_date,
    due_date: dueDate,
    description: input.description,
    payment_terms: paymentTerms,
    notes: '',
    lines: [
      {
        description: input.description,
        account_number: input.account_number,
        quantity: 1,
        unit_price_ore: unitPriceOre,
        vat_code_id: input.vat_code_id,
        sort_order: 0,
      },
    ],
  }
}
