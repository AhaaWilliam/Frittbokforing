import { describe, it, expect } from 'vitest'
import {
  PERIOD_LABELS,
  makePeriodLabels,
  buildGridFromTargets,
  krToOre,
  oreToKr,
} from '../../../../src/renderer/components/budget/budget-grid-utils'

describe('PERIOD_LABELS (legacy, 12 perioder)', () => {
  it('har 12 etiketter P1..P12', () => {
    expect(PERIOD_LABELS).toHaveLength(12)
    expect(PERIOD_LABELS[0]).toBe('P1')
    expect(PERIOD_LABELS[11]).toBe('P12')
  })
})

describe('makePeriodLabels', () => {
  it('12 perioder → P1..P12', () => {
    const labels = makePeriodLabels(12)
    expect(labels).toHaveLength(12)
    expect(labels[0]).toBe('P1')
    expect(labels[11]).toBe('P12')
  })

  it('13 perioder (förlängt första FY) → P1..P13', () => {
    const labels = makePeriodLabels(13)
    expect(labels).toHaveLength(13)
    expect(labels[12]).toBe('P13')
  })

  it('9 perioder (kortat första FY) → P1..P9', () => {
    const labels = makePeriodLabels(9)
    expect(labels).toHaveLength(9)
    expect(labels[8]).toBe('P9')
  })

  it('clampar till [1, 13]', () => {
    expect(makePeriodLabels(0)).toHaveLength(1) // min 1
    expect(makePeriodLabels(-5)).toHaveLength(1)
    expect(makePeriodLabels(50)).toHaveLength(13) // max 13
    expect(makePeriodLabels(14)).toHaveLength(13)
  })
})

describe('buildGridFromTargets', () => {
  it('bygger nested map från flat target-lista', () => {
    const grid = buildGridFromTargets([
      { line_id: 'revenue', period_number: 1, amount_ore: 10000 },
      { line_id: 'revenue', period_number: 2, amount_ore: 20000 },
      { line_id: 'cost', period_number: 1, amount_ore: -5000 },
    ])
    expect(grid.revenue[1]).toBe(10000)
    expect(grid.revenue[2]).toBe(20000)
    expect(grid.cost[1]).toBe(-5000)
  })
})

describe('krToOre / oreToKr roundtrip', () => {
  it('heltals-krona', () => {
    expect(krToOre('100')).toBe(10000)
    expect(oreToKr(10000)).toBe('100')
  })

  it('svensk komma-notation (F-TT-006)', () => {
    expect(krToOre('99,50')).toBe(9950)
    expect(krToOre('1 234,56')).toBe(123456) // mellanslag som tusental-sep
  })

  it('ogiltig input → 0', () => {
    expect(krToOre('abc')).toBe(0)
    expect(krToOre('')).toBe(0)
  })
})
