import { describe, it, expect } from 'vitest'
import { toKr, toOre } from '../../../src/renderer/lib/format'

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
