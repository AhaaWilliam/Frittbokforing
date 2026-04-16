/**
 * SIE4 amount parser — reverse of oreToSie4Amount.
 * Converts SIE4 kronor-strings to öre integers.
 * Uses integer arithmetic only (M131 architecture rule).
 */
export function sie4AmountToOre(amount: string): number {
  const trimmed = amount.trim()
  if (!trimmed || trimmed === '0') return 0

  const negative = trimmed.startsWith('-')
  const abs = negative ? trimmed.slice(1) : trimmed
  const dotIdx = abs.indexOf('.')

  let ore: number
  if (dotIdx === -1) {
    // Whole kronor: "1234" → 123400
    ore = parseInt(abs, 10) * 100
  } else {
    const krPart = abs.slice(0, dotIdx)
    const decPart = abs.slice(dotIdx + 1).padEnd(2, '0').slice(0, 2)
    ore = parseInt(krPart || '0', 10) * 100 + parseInt(decPart, 10)
  }

  return negative ? -ore : ore
}
