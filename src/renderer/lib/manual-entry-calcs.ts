import { parseSwedishAmount } from './form-schemas/manual-entry'
import type { ManualEntryLineForm } from './form-schemas/manual-entry'

export function calculateManualEntryTotals(lines: ManualEntryLineForm[]) {
  const totalDebit = lines.reduce(
    (sum, l) => sum + parseSwedishAmount(l.debitKr),
    0,
  )
  const totalCredit = lines.reduce(
    (sum, l) => sum + parseSwedishAmount(l.creditKr),
    0,
  )
  return { totalDebit, totalCredit, diff: totalDebit - totalCredit }
}

export function formatDiffLabel(diff: number): {
  text: string
  balanced: boolean
} {
  if (diff === 0) return { text: '', balanced: true }
  return {
    text: diff > 0 ? 'debet > kredit' : 'kredit > debet',
    balanced: false,
  }
}
