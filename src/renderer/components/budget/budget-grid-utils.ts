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
  const n = parseFloat(kr)
  return isNaN(n) ? 0 : Math.round(n * 100)
}

export const PERIOD_LABELS = Array.from({ length: 12 }, (_, i) => `P${i + 1}`)
