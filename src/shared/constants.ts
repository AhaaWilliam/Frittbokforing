/**
 * Formaterar ett nummer enligt svensk konvention: mellanslag som
 * tusental-separator, komma som decimal-tecken.
 * Används i error-meddelanden för konsistent UX.
 */
export function formatSwedishNumber(n: number, decimals = 0): string {
  return n.toLocaleString('sv-SE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Max-qty för invoice-rader (F46). Float med ≤2 decimaler. */
export const MAX_QTY_INVOICE = 9999.99

/** Max-qty för expense-rader (F46). Integer — paritetsval med invoice. */
export const MAX_QTY_EXPENSE = 9999

export const ERR_MSG_MAX_QTY_INVOICE =
  `Antal kan vara högst ${formatSwedishNumber(MAX_QTY_INVOICE, 2)}`

export const ERR_MSG_MAX_QTY_EXPENSE =
  `Antal kan vara högst ${formatSwedishNumber(MAX_QTY_EXPENSE)}`
