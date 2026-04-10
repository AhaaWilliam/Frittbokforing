export function toOre(kr: number): number {
  return Math.round(kr * 100)
}

export function toKr(ore: number): number {
  return ore / 100
}

export function formatKr(ore: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(toKr(ore))
}

export function formatReportAmount(amountOre: number): string {
  const kr = amountOre / 100
  const absFormatted = new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(kr))
  if (kr < 0) return `\u2212${absFormatted}` // U+2212 minus sign
  return absFormatted
}

export function kronorToOre(kronor: string | number): number {
  return Math.round(Number(kronor) * 100)
}

// Re-export from shared date-utils to avoid breaking existing renderer imports
export { todayLocal, addDays as addDaysLocal } from '../../shared/date-utils'

export function formatDate(dateStr: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('sv-SE')
}

export function unitLabel(unit: string): string {
  const labels: Record<string, string> = {
    timme: 'timme',
    styck: 'st',
    dag: 'dag',
    månad: 'mån',
    km: 'km',
    pauschal: 'fast pris',
  }
  return labels[unit] ?? unit
}
