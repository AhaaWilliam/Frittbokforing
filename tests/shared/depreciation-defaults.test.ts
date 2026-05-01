import { describe, it, expect } from 'vitest'
import {
  DEPRECIATION_DEFAULTS,
  findDepreciationDefaults,
} from '../../src/shared/depreciation-defaults'

describe('DEPRECIATION_DEFAULTS', () => {
  it('innehåller minst 8 mappningar', () => {
    expect(DEPRECIATION_DEFAULTS.length).toBeGreaterThanOrEqual(8)
  })

  it('varje rad har asset/accumulated/expense/label', () => {
    for (const d of DEPRECIATION_DEFAULTS) {
      expect(d.asset).toMatch(/^\d{4}$/)
      expect(d.accumulated).toMatch(/^\d{4}$/)
      expect(d.expense).toMatch(/^\d{4}$/)
      expect(d.label.length).toBeGreaterThan(0)
    }
  })

  it('asset-konton är unika (ingen duplicerad mapping)', () => {
    const assets = DEPRECIATION_DEFAULTS.map((d) => d.asset)
    expect(new Set(assets).size).toBe(assets.length)
  })

  it('accumulated-konto slutar med 9 (BAS-konvention)', () => {
    for (const d of DEPRECIATION_DEFAULTS) {
      expect(d.accumulated.endsWith('9')).toBe(true)
    }
  })

  it('alla expense-konton är klass 7 (BAS-norm för avskrivningar)', () => {
    for (const d of DEPRECIATION_DEFAULTS) {
      expect(d.expense.startsWith('7')).toBe(true)
    }
  })

  it('inkluderar 1220 Inventarier (vanligaste mapping)', () => {
    const inv = DEPRECIATION_DEFAULTS.find((d) => d.asset === '1220')
    expect(inv).toBeDefined()
    expect(inv?.accumulated).toBe('1229')
    expect(inv?.expense).toBe('7832')
  })
})

describe('findDepreciationDefaults', () => {
  it('hittar 1220 → inventarier', () => {
    const r = findDepreciationDefaults('1220')
    expect(r?.label).toBe('Inventarier och verktyg')
  })

  it('hittar 1240 → bilar', () => {
    const r = findDepreciationDefaults('1240')
    expect(r?.expense).toBe('7834')
  })

  it('okänt konto → undefined', () => {
    expect(findDepreciationDefaults('9999')).toBeUndefined()
  })

  it('tom string → undefined', () => {
    expect(findDepreciationDefaults('')).toBeUndefined()
  })
})
