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

export const ERR_MSG_MAX_QTY_INVOICE = `Antal kan vara högst ${formatSwedishNumber(MAX_QTY_INVOICE, 2)}`

export const ERR_MSG_MAX_QTY_EXPENSE = `Antal kan vara högst ${formatSwedishNumber(MAX_QTY_EXPENSE)}`

/** BFL 3 kap 1§: Tillåtna startmånader för brutet räkenskapsår */
export const BFL_ALLOWED_START_MONTHS = [1, 5, 7, 9, 11] as const

export const ERR_MSG_INVALID_FY_START_MONTH =
  'Brutet räkenskapsår kan bara starta 1 jan, 1 maj, 1 jul, 1 sep eller 1 nov (BFL 3 kap 1§)'

/**
 * S58 F66-d: max beloppströskel för bank-fee-klassificering via heuristik
 * (counterparty+text). BkTxCd-whitelist (CHRG/INTR) bypassar denna tröskel —
 * en bank som rapporterar en CHRG över 1000 kr är fortfarande en avgift.
 *
 * 100 000 öre = 1 000 kr. Kvalitetskontroll mot falska positiva för rena
 * text-matchningar.
 */
export const MAX_FEE_HEURISTIC_ORE = 100_000

/** S58 F66-d: tröskel för HIGH confidence i bank-fee-classifier. */
export const FEE_SCORE_HIGH = 100

/** S58 F66-d: tröskel för MEDIUM confidence. Under detta → null. */
export const FEE_SCORE_MEDIUM = 50
