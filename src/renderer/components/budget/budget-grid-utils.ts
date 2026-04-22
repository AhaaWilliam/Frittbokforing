export type GridState = Record<string, Record<number, number>>

export function buildGridFromTargets(
  targets: Array<{
    line_id: string
    period_number: number
    amount_ore: number
  }>,
): GridState {
  const grid: GridState = {}
  for (const t of targets) {
    if (!grid[t.line_id]) grid[t.line_id] = {}
    grid[t.line_id][t.period_number] = t.amount_ore
  }
  return grid
}

export function oreToKr(ore: number): string {
  return (ore / 100).toFixed(0)
}

export function krToOre(kr: string): number {
  // F-TT-006: svensk komma-notation måste hanteras (parseFloat("99,50") = 99).
  const cleaned = kr.replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : Math.round(n * 100)
}

export const PERIOD_LABELS = Array.from({ length: 12 }, (_, i) => `P${i + 1}`)

/**
 * Dynamiska period-etiketter för räkenskapsår med annat antal perioder
 * än 12 (kortat eller förlängt första FY, BFL 3:3 — Sprint D/E).
 * Returnerar ['P1', 'P2', ..., 'PN'] där N = periodCount (1–13).
 */
export function makePeriodLabels(periodCount: number): string[] {
  const safeCount = Math.max(1, Math.min(13, periodCount))
  return Array.from({ length: safeCount }, (_, i) => `P${i + 1}`)
}
