/**
 * Convert öre integer to SIE5 amount string with 2 decimal places.
 * SIE5 defines Amount as xsd:decimal with fractionDigits=2.
 */
export function oreToSie5Amount(ore: number): string {
  const intOre = Math.round(ore)
  const sign = intOre < 0 ? '-' : ''
  const absOre = Math.abs(intOre)
  const whole = Math.trunc(absOre / 100)
  const frac = absOre % 100
  return `${sign}${whole}.${frac.toString().padStart(2, '0')}`
}

/**
 * Convert debit/credit öre pair to SIE5 net amount.
 * Positive = debit, negative = credit.
 */
export function debitCreditToSie5Amount(
  debitOre: number,
  creditOre: number,
): string {
  return oreToSie5Amount(debitOre - creditOre)
}
