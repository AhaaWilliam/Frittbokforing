/**
 * Matchar svenska valuta-strängar med NBSP-separatorer.
 * Används i InvoiceTotals/ExpenseTotals-tester där Intl.NumberFormat
 * producerar U+00A0 mellan tusental.
 *
 * SINGLE SOURCE. Kopiera inte inline i andra testfiler — importera härifrån.
 */
import { formatKr } from '../../../src/renderer/lib/format'

/** Match text that contains NBSP (char 160) — testing-library normalizes it */
export function byKr(ore: number): RegExp {
  const formatted = formatKr(ore)
  // formatKr uses Intl which inserts NBSP (U+00A0). Use regex to match either space type.
  const escaped = formatted.replace(/[\s\u00a0]/g, '[\\s\\u00a0]')
  return new RegExp(`^${escaped}$`)
}
