/**
 * Sprint VS-115b — vat-deadline-utility.
 */
import { describe, it, expect } from 'vitest'
import {
  computeVatDeadline,
  vatDeadlineTone,
} from '../src/shared/vat-deadline'

describe('VS-115b computeVatDeadline (monthly)', () => {
  it('mid-månad maj 2025 → mest imminent deadline = mars-perioden 26 maj', () => {
    // 15 maj 2025: mars-perioden (deadline 26 maj) är mest imminent.
    // Apr-perioden = 26 jun, maj-perioden = 26 jul.
    const r = computeVatDeadline({
      frequency: 'monthly',
      asOf: '2025-05-15',
    })
    expect(r).not.toBeNull()
    expect(r!.dueDate).toBe('2025-05-26')
    expect(r!.periodLabel).toContain('mars')
    expect(r!.daysUntil).toBe(11)
  })

  it('precis efter passad deadline: 27 juli 2025 → 26 augusti', () => {
    // 27 juli 2025: deadline för maj-perioden var 26 juli 2025 (passerad).
    // Nästa: juni-perioden, deadline 26 augusti 2025.
    const r = computeVatDeadline({
      frequency: 'monthly',
      asOf: '2025-07-27',
    })
    expect(r!.dueDate).toBe('2025-08-26')
    expect(r!.periodLabel).toContain('juni')
  })

  it('deadline-dagen själv räknas som "kvar idag"', () => {
    const r = computeVatDeadline({
      frequency: 'monthly',
      asOf: '2025-07-26',
    })
    expect(r!.dueDate).toBe('2025-07-26')
    expect(r!.daysUntil).toBe(0)
  })
})

describe('VS-115b computeVatDeadline (quarterly)', () => {
  it('Q2 2025 (apr–jun) → 12 augusti 2025', () => {
    const r = computeVatDeadline({
      frequency: 'quarterly',
      asOf: '2025-05-01',
    })
    expect(r!.dueDate).toBe('2025-08-12')
    expect(r!.periodLabel).toContain('Q2 2025')
  })

  it('Q4 2025 (okt–dec) → 12 februari 2026 (årsskifte)', () => {
    const r = computeVatDeadline({
      frequency: 'quarterly',
      asOf: '2025-12-01',
    })
    expect(r!.dueDate).toBe('2026-02-12')
    expect(r!.periodLabel).toContain('Q4 2025')
  })

  it('Q1 efter att Q4-deadline passerat', () => {
    // 13 feb 2026: Q4 2025 deadline (12 feb 2026) passerad. Nästa = Q1 2026, due 12 maj.
    const r = computeVatDeadline({
      frequency: 'quarterly',
      asOf: '2026-02-13',
    })
    expect(r!.dueDate).toBe('2026-05-12')
    expect(r!.periodLabel).toContain('Q1 2026')
  })
})

describe('VS-115b computeVatDeadline (yearly)', () => {
  it('kalenderår 2025-12-31 slut → 26 februari 2026', () => {
    const r = computeVatDeadline({
      frequency: 'yearly',
      asOf: '2026-01-15',
      fiscal_year_end: '2025-12-31',
    })
    expect(r!.dueDate).toBe('2026-02-26')
  })

  it('brutet räkenskapsår 2025-06-30 slut → 26 augusti 2025', () => {
    const r = computeVatDeadline({
      frequency: 'yearly',
      asOf: '2025-07-01',
      fiscal_year_end: '2025-06-30',
    })
    expect(r!.dueDate).toBe('2025-08-26')
  })

  it('returnerar null när fiscal_year_end saknas', () => {
    const r = computeVatDeadline({
      frequency: 'yearly',
      asOf: '2025-12-15',
    })
    expect(r).toBeNull()
  })
})

describe('VS-115b vatDeadlineTone', () => {
  it('lugnt 14+ dagar kvar', () => {
    expect(vatDeadlineTone(14)).toBe('mint')
    expect(vatDeadlineTone(60)).toBe('mint')
  })

  it('warning 1–13 dagar kvar', () => {
    expect(vatDeadlineTone(13)).toBe('warning')
    expect(vatDeadlineTone(1)).toBe('warning')
  })

  it('danger på/efter deadline', () => {
    expect(vatDeadlineTone(0)).toBe('danger')
    expect(vatDeadlineTone(-1)).toBe('danger')
    expect(vatDeadlineTone(-100)).toBe('danger')
  })
})
