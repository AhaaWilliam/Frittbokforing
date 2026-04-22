/**
 * SIE4 amount parser — reverse of oreToSie4Amount.
 * Converts SIE4 kronor-strings to öre integers.
 * Uses integer arithmetic only (M131 architecture rule).
 *
 * Strict grammar (M145 security boundary): [-]?DIGITS(.DIGITS)?
 * Invalid strings return NaN. Callers (parser+validator) surface NaN as E6.
 */

// Strict grammar: optional minus, at least one digit somewhere, optional
// single decimal point. Leading/trailing whitespace tolerated. Accepts
// ".5" and "5." as short forms. Rejects double-minus, multiple dots,
// embedded spaces, scientific notation, thousand separators, letters.
const AMOUNT_RE = /^-?(?:\d+\.?\d*|\.\d+)$/

export function sie4AmountToOre(amount: string): number {
  const trimmed = amount.trim()
  if (!trimmed || trimmed === '0' || trimmed === '-0' || trimmed === '0.00')
    return 0

  if (!AMOUNT_RE.test(trimmed)) return NaN

  const negative = trimmed.startsWith('-')
  const abs = negative ? trimmed.slice(1) : trimmed
  if (!abs) return NaN
  const dotIdx = abs.indexOf('.')

  let ore: number
  if (dotIdx === -1) {
    // Whole kronor: "1234" → 123400
    const kr = parseInt(abs, 10)
    if (!Number.isFinite(kr)) return NaN
    ore = kr * 100
  } else {
    const krPart = abs.slice(0, dotIdx)
    const decRaw = abs.slice(dotIdx + 1)
    const decPart = decRaw.padEnd(2, '0').slice(0, 2)
    const kr = krPart ? parseInt(krPart, 10) : 0
    const dec = parseInt(decPart, 10)
    if (!Number.isFinite(kr) || !Number.isFinite(dec)) return NaN
    ore = kr * 100 + dec
  }

  return negative ? -ore : ore
}
