import { describe, it, expect } from 'vitest'
import {
  addOneDay,
  addMonthsMinusOneDay,
  isLeapYear,
  addDays,
  pluralDays,
} from '../src/shared/date-utils'

describe('addOneDay', () => {
  it('normal day', () => {
    expect(addOneDay('2026-01-15')).toBe('2026-01-16')
  })
  it('month boundary', () => {
    expect(addOneDay('2026-01-31')).toBe('2026-02-01')
  })
  it('year boundary', () => {
    expect(addOneDay('2026-12-31')).toBe('2027-01-01')
  })
})

describe('addMonthsMinusOneDay', () => {
  it('calendar year', () => {
    expect(addMonthsMinusOneDay('2026-01-01', 12)).toBe('2026-12-31')
  })
  it('leap year feb', () => {
    expect(addMonthsMinusOneDay('2024-03-01', 12)).toBe('2025-02-28')
  })
  it('from leap day', () => {
    // Feb 29 (m=2) + 12 months → target month Feb 2025, minus one day = last day of Jan 2025
    expect(addMonthsMinusOneDay('2024-02-29', 12)).toBe('2025-01-31')
  })
})

describe('isLeapYear', () => {
  it('2024 is leap', () => {
    expect(isLeapYear(2024)).toBe(true)
  })
  it('2026 is not leap', () => {
    expect(isLeapYear(2026)).toBe(false)
  })
})

describe('addDays', () => {
  it('+30 days', () => {
    expect(addDays('2026-03-01', 30)).toBe('2026-03-31')
  })
  it('negative days', () => {
    expect(addDays('2026-03-31', -1)).toBe('2026-03-30')
  })
})

// VS-136: svensk pluralisering "dag/dagar"
describe('pluralDays', () => {
  it('singular vid 1', () => {
    expect(pluralDays(1)).toBe('1 dag')
  })
  it('singular vid -1', () => {
    expect(pluralDays(-1)).toBe('-1 dag')
  })
  it('plural vid 0', () => {
    expect(pluralDays(0)).toBe('0 dagar')
  })
  it('plural vid 2', () => {
    expect(pluralDays(2)).toBe('2 dagar')
  })
  it('plural vid -3 (försent)', () => {
    expect(pluralDays(-3)).toBe('-3 dagar')
  })
  it('plural vid större tal', () => {
    expect(pluralDays(45)).toBe('45 dagar')
  })
})
