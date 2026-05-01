import { describe, it, expect } from 'vitest'
import {
  ACCRUAL_TYPES,
  TYPE_LABELS,
  TYPE_BADGE,
  kronorToOre,
} from '../../../../src/renderer/components/accruals/accrual-constants'

describe('ACCRUAL_TYPES', () => {
  it('innehåller exakt 4 typer (BFL-grupperna)', () => {
    expect(ACCRUAL_TYPES).toHaveLength(4)
  })

  it('alla typer har value och label', () => {
    for (const t of ACCRUAL_TYPES) {
      expect(t.value).toBeTruthy()
      expect(t.label).toBeTruthy()
    }
  })

  it('innehåller alla AccrualType-varianter', () => {
    const values = ACCRUAL_TYPES.map((t) => t.value)
    expect(values).toContain('prepaid_expense')
    expect(values).toContain('accrued_expense')
    expect(values).toContain('prepaid_income')
    expect(values).toContain('accrued_income')
  })
})

describe('TYPE_LABELS', () => {
  it('mappar value → svensk label', () => {
    expect(TYPE_LABELS.prepaid_expense).toBe('Förutbetald kostnad')
    expect(TYPE_LABELS.accrued_expense).toBe('Upplupen kostnad')
    expect(TYPE_LABELS.prepaid_income).toBe('Förutbetald intäkt')
    expect(TYPE_LABELS.accrued_income).toBe('Upplupen intäkt')
  })

  it('innehåller exakt samma keys som ACCRUAL_TYPES', () => {
    expect(Object.keys(TYPE_LABELS).sort()).toEqual(
      ACCRUAL_TYPES.map((t) => t.value).sort(),
    )
  })
})

describe('TYPE_BADGE (token-baserade färger)', () => {
  it('alla 4 typer har badge-mappning', () => {
    expect(TYPE_BADGE.prepaid_expense).toBeDefined()
    expect(TYPE_BADGE.accrued_expense).toBeDefined()
    expect(TYPE_BADGE.prepaid_income).toBeDefined()
    expect(TYPE_BADGE.accrued_income).toBeDefined()
  })

  it('badge har bg- och text-classes', () => {
    for (const key of Object.keys(TYPE_BADGE)) {
      const b = TYPE_BADGE[key]
      expect(b.bg).toMatch(/^bg-/)
      expect(b.text).toMatch(/^text-/)
    }
  })

  it('alla färger är token-baserade (info/warning/brand/mint)', () => {
    // H+G-9 token-coverage milestone — inga raw-färger
    for (const key of Object.keys(TYPE_BADGE)) {
      const b = TYPE_BADGE[key]
      expect(b.bg).toMatch(/info|warning|brand|mint|success|danger|neutral/)
    }
  })
})

describe('kronorToOre (svensk decimal-parsing)', () => {
  it('"100" → 10000', () => {
    expect(kronorToOre('100')).toBe(10000)
  })

  it('"99,50" → 9950 (komma som decimal)', () => {
    expect(kronorToOre('99,50')).toBe(9950)
  })

  it('"99.50" → 9950 (punkt som decimal)', () => {
    expect(kronorToOre('99.50')).toBe(9950)
  })

  it('"1 234,50" → 123450 (mellanslag som tusentalsavskiljare)', () => {
    expect(kronorToOre('1 234,50')).toBe(123450)
  })

  it('text-skräp → 0', () => {
    expect(kronorToOre('abc')).toBe(0)
  })

  it('tom sträng → 0', () => {
    expect(kronorToOre('')).toBe(0)
  })

  it('avrundar korrekt', () => {
    expect(kronorToOre('1.235')).toBe(124)
    expect(kronorToOre('1.234')).toBe(123)
  })

  it('negativa belopp', () => {
    expect(kronorToOre('-5,50')).toBe(-550)
  })
})
