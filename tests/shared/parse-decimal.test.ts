import { describe, it, expect } from 'vitest'
import { parseDecimal } from '../../src/shared/money'

describe('parseDecimal — locale-safe decimal parsing (F68)', () => {
  it('parses Swedish comma format', () => {
    expect(parseDecimal('99,50')).toBe(99.5)
    expect(parseDecimal('1234,56')).toBe(1234.56)
    expect(parseDecimal('0,01')).toBe(0.01)
  })

  it('parses English dot format', () => {
    expect(parseDecimal('99.50')).toBe(99.5)
    expect(parseDecimal('1234.56')).toBe(1234.56)
  })

  it('parses integer strings', () => {
    expect(parseDecimal('42')).toBe(42)
    expect(parseDecimal('0')).toBe(0)
  })

  it('handles negative numbers', () => {
    expect(parseDecimal('-99,50')).toBe(-99.5)
    expect(parseDecimal('-12.34')).toBe(-12.34)
  })

  it('trims whitespace', () => {
    expect(parseDecimal('  99,50  ')).toBe(99.5)
    expect(parseDecimal('\t42\n')).toBe(42)
  })

  it('returns NaN for empty string', () => {
    expect(parseDecimal('')).toBeNaN()
    expect(parseDecimal('   ')).toBeNaN()
  })

  it('returns NaN for non-numeric input', () => {
    expect(parseDecimal('abc')).toBeNaN()
    expect(parseDecimal(',')).toBeNaN()
  })

  it('regression: old parseFloat tolkar "99,50" som 99 — denna helper returnerar 99.5', () => {
    expect(parseFloat('99,50')).toBe(99) // dokumenterar bugg
    expect(parseDecimal('99,50')).toBe(99.5) // korrekt
  })
})
