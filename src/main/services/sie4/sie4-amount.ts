/**
 * Convert öre integer to SIE4 amount string.
 * Rules: punkt som decimal, max 2 decimaler.
 * Hela kronor: "1234" (inga decimaler). Med ören: "1234.50".
 * Negativt: "-500" eller "-500.25" eller "-0.50".
 */
export function oreToSie4Amount(ore: number): string {
  const intOre = Math.round(ore)
  const isNeg = intOre < 0
  const absOre = Math.abs(intOre)
  const whole = Math.trunc(absOre / 100)
  const frac = absOre % 100
  const sign = isNeg ? '-' : ''
  if (frac === 0) return `${sign}${whole}`
  return `${sign}${whole}.${frac.toString().padStart(2, '0')}`
}
