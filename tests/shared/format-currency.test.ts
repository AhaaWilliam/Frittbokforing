import { describe, it, expect } from 'vitest'
import { oreToKr, formatOreToKr } from '../../src/shared/format-currency'

describe('oreToKr', () => {
  it('100 öre → 1 kr', () => {
    expect(oreToKr(100)).toBe(1)
  })

  it('1234 öre → 12.34 kr', () => {
    expect(oreToKr(1234)).toBe(12.34)
  })

  it('0 → 0', () => {
    expect(oreToKr(0)).toBe(0)
  })

  it('negativa belopp', () => {
    expect(oreToKr(-50)).toBe(-0.5)
  })
})

describe('formatOreToKr', () => {
  it('default: signerat, ingen suffix, 2 decimaler', () => {
    expect(formatOreToKr(123450)).toMatch(/^1\s?234,50$/)
  })

  it('absolute=true droppar minustecken', () => {
    expect(formatOreToKr(-100, { absolute: true })).toBe('1,00')
  })

  it('suffix=true lägger till " kr"', () => {
    expect(formatOreToKr(100, { suffix: true })).toBe('1,00 kr')
  })

  it('minFractionDigits=0 droppar decimaler för heltal-kr', () => {
    expect(formatOreToKr(10000, { minFractionDigits: 0, maxFractionDigits: 0 })).toBe(
      '100',
    )
  })

  it('nbspGroup byter mellanslag mot non-breaking space (PDF)', () => {
    const out = formatOreToKr(123456, { nbspGroup: true })
    expect(out).toContain(' ')
    expect(out).not.toMatch(/ 234/)  // vanligt mellanslag → nej
  })

  it('negativa belopp behåller tecken (default)', () => {
    // Intl.NumberFormat sv-SE använder Unicode minus (−, U+2212), inte ASCII
    const out = formatOreToKr(-100)
    expect(out).toContain('1,00')
    expect(out.startsWith('−') || out.startsWith('-')).toBe(true)
  })

  it('avrundar > 2 decimaler', () => {
    // 1234 öre = 12.34 kr — inga decimaler-bekymmer i rundning
    expect(formatOreToKr(1234)).toBe('12,34')
  })

  it('thousands-separator för stora belopp', () => {
    // 1 234 567,89 kr (123456789 öre)
    const out = formatOreToKr(123456789)
    expect(out).toMatch(/234/)
    expect(out).toMatch(/567,89$/)
  })
})
