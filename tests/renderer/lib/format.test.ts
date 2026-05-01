import { describe, it, expect } from 'vitest'
import {
  toKr,
  toOre,
  formatKr,
  formatReportAmount,
  kronorToOre,
  unitLabel,
  formatDate,
  pathBasename,
} from '../../../src/renderer/lib/format'

describe('toKr', () => {
  it('converts even öre to kr', () => {
    expect(toKr(125000)).toBe(1250)
  })

  it('converts decimal öre to kr', () => {
    expect(toKr(12345)).toBe(123.45)
  })

  it('converts small non-100-divisible öre', () => {
    expect(toKr(99)).toBe(0.99)
  })

  it('converts 1 öre', () => {
    expect(toKr(1)).toBe(0.01)
  })

  it('converts 0 öre', () => {
    expect(toKr(0)).toBe(0)
  })
})

describe('toOre', () => {
  it('converts even kr to öre', () => {
    expect(toOre(1250)).toBe(125000)
  })

  it('converts decimal kr to öre with rounding', () => {
    expect(toOre(123.45)).toBe(12345)
  })

  it('converts small kr to öre', () => {
    expect(toOre(0.99)).toBe(99)
  })

  it('handles floating point precision via Math.round', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in IEEE 754
    expect(toOre(0.1 + 0.2)).toBe(30)
  })

  it('converts 0 kr', () => {
    expect(toOre(0)).toBe(0)
  })
})

describe('kronorToOre', () => {
  it('converts string kr to öre', () => {
    expect(kronorToOre('100')).toBe(10000)
    expect(kronorToOre('9.5')).toBe(950)
  })

  it('converts number kr to öre', () => {
    expect(kronorToOre(100)).toBe(10000)
  })
})

describe('formatReportAmount', () => {
  // Node Intl may use U+00A0 or U+202F as thousands separator depending
  // on ICU version. Normalize whitespace for robust assertions.
  function normalize(s: string): string {
    return s.replace(/[\u00A0\u202F]/g, ' ')
  }

  it.each([
    [0, '0,00'],
    [10000, '100,00'],
    [1, '0,01'],
    [99, '0,99'],
    [-5000, '\u221250,00'], // U+2212 minus sign
  ])('formatReportAmount(%i) = %s', (ore, expected) => {
    expect(normalize(formatReportAmount(ore))).toBe(normalize(expected))
  })

  it('formats large amounts with thousands separator', () => {
    const result = normalize(formatReportAmount(123456789))
    expect(result).toBe('1 234 567,89')
  })

  it('handles negative large amounts', () => {
    const result = normalize(formatReportAmount(-123456789))
    expect(result).toBe('\u22121 234 567,89')
  })
})

describe('formatKr', () => {
  it('formats öre as currency with kr', () => {
    const result = formatKr(95000)
    // Intl sv-SE currency: "950 kr" — formatKr uses min 0, max 2 fractions
    expect(result).toContain('950')
    expect(result).toContain('kr')
  })

  it('formats zero öre', () => {
    const result = formatKr(0)
    expect(result).toContain('0')
    expect(result).toContain('kr')
  })
})

describe('unitLabel', () => {
  it('maps known units', () => {
    expect(unitLabel('timme')).toBe('timme')
    expect(unitLabel('styck')).toBe('st')
    expect(unitLabel('dag')).toBe('dag')
    expect(unitLabel('pauschal')).toBe('fast pris')
  })

  it('returns unknown units as-is', () => {
    expect(unitLabel('liter')).toBe('liter')
  })

  it('mappar månad → mån', () => {
    expect(unitLabel('månad')).toBe('mån')
  })

  it('km lämnas oförändrat', () => {
    expect(unitLabel('km')).toBe('km')
  })

  it('tom sträng → tom sträng', () => {
    expect(unitLabel('')).toBe('')
  })
})

describe('formatDate', () => {
  it('ISO YYYY-MM-DD passthrough utan transform', () => {
    expect(formatDate('2026-04-30')).toBe('2026-04-30')
  })

  it('ISO med tid → trimmas till YYYY-MM-DD och formatteras som sv-SE', () => {
    // Sv-SE locale = "2026-04-30" eller "2026-04-30" — beroende på node version
    const out = formatDate('2026-04-30T12:00:00Z')
    expect(out).toMatch(/2026/)
    expect(out).toMatch(/30|04/)
  })

  it('hanterar redan-formaterad ISO-datum oförändrat (snabb path)', () => {
    expect(formatDate('2025-01-01')).toBe('2025-01-01')
  })
})

describe('pathBasename (VS-13)', () => {
  it('extraherar basename från POSIX-path', () => {
    expect(pathBasename('/Users/x/y.pdf')).toBe('y.pdf')
  })

  it('extraherar basename från Windows-path', () => {
    expect(pathBasename('C:\\Users\\x\\y.pdf')).toBe('y.pdf')
  })

  it('hanterar mixed-separator-path', () => {
    expect(pathBasename('/var/www\\file.txt')).toBe('file.txt')
  })

  it('returnerar input om ingen separator', () => {
    expect(pathBasename('y.pdf')).toBe('y.pdf')
  })

  it('hanterar trailing-separator', () => {
    expect(pathBasename('/var/www/')).toBe('www')
  })
})
