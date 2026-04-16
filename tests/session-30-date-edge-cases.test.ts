import { describe, it, expect } from 'vitest'
import { defaultDateFrom } from '../src/renderer/pages/PageAccountStatement'

describe('defaultDateFrom edge cases (V4)', () => {
  const FY_START = '2026-01-01'

  it('normal case: 2026-04-15 → 2026-01-15', () => {
    expect(defaultDateFrom(FY_START, '2026-04-15')).toBe('2026-01-15')
  })

  it('month underflow: 2026-02-15 → 2025-11-15, clipped to FY start', () => {
    // 2 - 3 = -1 → month 11, year 2025
    // But FY starts 2026-01-01, so clipped
    expect(defaultDateFrom(FY_START, '2026-02-15')).toBe('2026-01-01')
  })

  it('month underflow without FY clip: 2026-02-15, FY 2025-01-01', () => {
    expect(defaultDateFrom('2025-01-01', '2026-02-15')).toBe('2025-11-15')
  })

  it('day clamping: May 31 → Feb 28 (non-leap)', () => {
    // 2026-05-31, month - 3 = 2, day 31 → Feb 28 (2026 is not a leap year)
    expect(defaultDateFrom(FY_START, '2026-05-31')).toBe('2026-02-28')
  })

  it('day clamping: May 31 → Feb 29 (leap year 2028)', () => {
    expect(defaultDateFrom('2028-01-01', '2028-05-31')).toBe('2028-02-29')
  })

  it('day clamping: March 31 → Dec 31 (previous year)', () => {
    // 2026-03-31, month - 3 = 0 → month 12, year 2025, day 31 → Dec has 31 days, OK
    expect(defaultDateFrom('2025-01-01', '2026-03-31')).toBe('2025-12-31')
  })

  it('day clamping: July 31 → April 30', () => {
    expect(defaultDateFrom(FY_START, '2026-07-31')).toBe('2026-04-30')
  })

  it('FY start clipping: result before FY start', () => {
    // 2026-01-10, month - 3 = Oct 2025, but FY starts 2026-01-01
    expect(defaultDateFrom(FY_START, '2026-01-10')).toBe('2026-01-01')
  })

  it('exact FY start: no clipping needed', () => {
    expect(defaultDateFrom(FY_START, '2026-04-01')).toBe('2026-01-01')
  })
})
