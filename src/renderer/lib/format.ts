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
  // F-TT-006: svensk komma-notation ("99,50") måste hanteras. Tidigare
  // gick "99,50" via `Number()` → NaN → 0 → tyst datakorruption vid
  // betalning.
  if (typeof kronor === 'number') return Math.round(kronor * 100)
  const cleaned = kronor.replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : Math.round(n * 100)
}

// Re-export from shared date-utils to avoid breaking existing renderer imports
export { todayLocal, addDays as addDaysLocal } from '../../shared/date-utils'

export function formatDate(dateStr: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('sv-SE')
}

/**
 * VS-14: Kontrollera om ett ISO-datum (YYYY-MM-DD) ligger inom ett
 * räkenskapsår-intervall. Returnerar `null` om inom, annars
 * felmeddelande på svenska redo att visa i UI.
 *
 * Tolerant mot ogiltigt input — returnerar null så form-validering inte
 * dubbelflaggar (separat regex i form-schema fångar format-fel).
 */
export function fiscalYearDateError(
  date: string,
  fyStart: string,
  fyEnd: string,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  if (date < fyStart || date > fyEnd) {
    return `Datumet ligger utanför räkenskapsåret (${fyStart} – ${fyEnd}).`
  }
  return null
}

/**
 * Extrahera basename från en absolut sökväg, plattforms-oberoende.
 * Hanterar både POSIX (`/`) och Windows (`\`) separatorer.
 *
 * Använd när renderern visar fil-sökvägar från main-process (där
 * dialog.showOpenDialog returnerar plattforms-native paths).
 *
 * Exempel:
 *   pathBasename('/Users/x/y.pdf')      → 'y.pdf'
 *   pathBasename('C:\\Users\\x\\y.pdf') → 'y.pdf'
 *   pathBasename('y.pdf')               → 'y.pdf'
 */
export function pathBasename(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p
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
