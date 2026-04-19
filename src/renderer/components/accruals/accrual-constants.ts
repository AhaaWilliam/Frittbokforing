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

export const TYPE_BADGE: Record<string, { bg: string; text: string }> = {
  prepaid_expense: { bg: 'bg-blue-100', text: 'text-blue-700' },
  accrued_expense: { bg: 'bg-orange-100', text: 'text-orange-700' },
  prepaid_income: { bg: 'bg-purple-100', text: 'text-purple-700' },
  accrued_income: { bg: 'bg-teal-100', text: 'text-teal-700' },
}

export function kronorToOre(kr: string): number {
  // F-TT-006: parseFloat("99,50") = 99 (tappar decimaler) → använd
  // .replace(',', '.') först.
  const cleaned = kr.replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : Math.round(n * 100)
}
