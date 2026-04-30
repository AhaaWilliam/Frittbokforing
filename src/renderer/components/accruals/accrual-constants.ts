import type { AccrualType } from '../../../shared/types'

export const ACCRUAL_TYPES: { value: AccrualType; label: string }[] = [
  { value: 'prepaid_expense', label: 'Förutbetald kostnad' },
  { value: 'accrued_expense', label: 'Upplupen kostnad' },
  { value: 'prepaid_income', label: 'Förutbetald intäkt' },
  { value: 'accrued_income', label: 'Upplupen intäkt' },
]

export const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  ACCRUAL_TYPES.map((t) => [t.value, t.label]),
)

/**
 * H+G-9: Accrual type-badges via tokens. Fyra typer behöver fortfarande
 * vara visuellt distinkta. Mappning till semantiska tokens:
 * - prepaid_expense (förutbet kostnad, "redan betalt") → info (cool)
 * - accrued_expense (upplupen kostnad, "att betala") → warning (warm)
 * - prepaid_income (förutbet intäkt, "redan fått") → brand (plommon)
 * - accrued_income (upplupen intäkt, "väntar") → mint
 */
export const TYPE_BADGE: Record<string, { bg: string; text: string }> = {
  prepaid_expense: { bg: 'bg-info-100', text: 'text-info-700' },
  accrued_expense: { bg: 'bg-warning-100', text: 'text-warning-700' },
  prepaid_income: { bg: 'bg-brand-100', text: 'text-brand-700' },
  accrued_income: { bg: 'bg-mint-100', text: 'text-mint-700' },
}

export function kronorToOre(kr: string): number {
  // F-TT-006: parseFloat("99,50") = 99 (tappar decimaler) → använd
  // .replace(',', '.') först.
  const cleaned = kr.replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : Math.round(n * 100)
}
