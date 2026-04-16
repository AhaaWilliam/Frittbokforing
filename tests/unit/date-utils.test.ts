import { describe, it, expect } from 'vitest'
import { subtractMonths } from '../../src/shared/date-utils'
import { defaultDateFrom } from '../../src/renderer/pages/PageAccountStatement'

describe('subtractMonths', () => {
  it('normal: 2026-04-15 minus 3 → 2026-01-15', () => {
    expect(subtractMonths('2026-04-15', 3)).toBe('2026-01-15')
  })

  it('month underflow: 2026-02-15 minus 3 → 2025-11-15', () => {
    expect(subtractMonths('2026-02-15', 3)).toBe('2025-11-15')
  })

  it('day clamping Feb (non-leap): 2026-05-31 minus 3 → 2026-02-28', () => {
    expect(subtractMonths('2026-05-31', 3)).toBe('2026-02-28')
  })

  it('day clamping Feb (leap): 2028-05-31 minus 3 → 2028-02-29', () => {
    expect(subtractMonths('2028-05-31', 3)).toBe('2028-02-29')
  })

  it('day clamping Apr: 2026-07-31 minus 3 → 2026-04-30', () => {
    expect(subtractMonths('2026-07-31', 3)).toBe('2026-04-30')
  })

  it('Dec wrap: 2026-03-31 minus 3 → 2025-12-31', () => {
    expect(subtractMonths('2026-03-31', 3)).toBe('2025-12-31')
  })

  it('zero months returns input unchanged', () => {
    expect(subtractMonths('2026-04-15', 0)).toBe('2026-04-15')
  })

  it('cross-year: 2026-01-15 minus 13 → 2024-12-15', () => {
    expect(subtractMonths('2026-01-15', 13)).toBe('2024-12-15')
  })

  it('cross-year leap: 2024-02-29 minus 12 → 2023-02-28', () => {
    expect(subtractMonths('2024-02-29', 12)).toBe('2023-02-28')
  })

  it('negative months throws', () => {
    expect(() => subtractMonths('2026-04-15', -1)).toThrow()
  })
})

describe('defaultDateFrom (FY clipping)', () => {
  const FY_START = '2026-01-01'

  it('normal case: 2026-04-15 → 2026-01-15', () => {
    expect(defaultDateFrom(FY_START, '2026-04-15')).toBe('2026-01-15')
  })

  it('clips to FY start when candidate is before', () => {
    expect(defaultDateFrom(FY_START, '2026-02-15')).toBe('2026-01-01')
  })

  it('exact FY start: 2026-04-01 → 2026-01-01', () => {
    expect(defaultDateFrom(FY_START, '2026-04-01')).toBe('2026-01-01')
  })

  it('month underflow without clip: FY 2025-01-01', () => {
    expect(defaultDateFrom('2025-01-01', '2026-02-15')).toBe('2025-11-15')
  })

  it('day clamping: May 31 → Feb 28', () => {
    expect(defaultDateFrom(FY_START, '2026-05-31')).toBe('2026-02-28')
  })

  it('day clamping leap: May 31 → Feb 29', () => {
    expect(defaultDateFrom('2028-01-01', '2028-05-31')).toBe('2028-02-29')
  })

  it('Dec wrap: March 31 → Dec 31 (previous year)', () => {
    expect(defaultDateFrom('2025-01-01', '2026-03-31')).toBe('2025-12-31')
  })

  it('July 31 → April 30', () => {
    expect(defaultDateFrom(FY_START, '2026-07-31')).toBe('2026-04-30')
  })

  it('FY start clipping: result before FY start', () => {
    expect(defaultDateFrom(FY_START, '2026-01-10')).toBe('2026-01-01')
  })
})
