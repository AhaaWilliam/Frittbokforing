import { describe, it, expect } from 'vitest'
import {
  todayLocal,
  addDaysLocal,
  formatDate,
} from '../src/renderer/lib/format'

describe('todayLocal', () => {
  it('returns YYYY-MM-DD format', () => {
    const result = todayLocal()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('addDaysLocal', () => {
  it('adds days correctly', () => {
    expect(addDaysLocal('2026-01-15', 30)).toBe('2026-02-14')
  })
  it('handles month boundary', () => {
    expect(addDaysLocal('2026-01-31', 1)).toBe('2026-02-01')
  })
  it('handles year boundary', () => {
    expect(addDaysLocal('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('formatDate', () => {
  it('returns YYYY-MM-DD for standard date strings', () => {
    expect(formatDate('2026-01-15')).toBe('2026-01-15')
  })
})
