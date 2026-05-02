/**
 * Sprint VS-115b — vat-deadline-utility.
 */
import { describe, it, expect } from 'vitest'
import {
  computeVatDeadline,
  vatDeadlineTone,
  bumpToNextWorkday,
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

  // VS-129: 26 juli 2025 är lördag → bumped till 28 juli (måndag).
  it('precis efter formell deadline (helg-bumped): 27 juli 2025 → 28 juli', () => {
    // 27 juli 2025 (söndag): formell maj-deadline=26 juli (lör), bumped
    // till 28 juli (mån). asOf är fortfarande FÖRE bumped deadline →
    // maj-perioden är aktuell, daysUntil=1.
    const r = computeVatDeadline({
      frequency: 'monthly',
      asOf: '2025-07-27',
    })
    expect(r!.dueDate).toBe('2025-07-28')
    expect(r!.periodLabel).toContain('maj')
    expect(r!.daysUntil).toBe(1)
  })

  it('VS-129 deadline-dagen helg-bumpas: 26 juli (lör) → 28 juli (mån)', () => {
    const r = computeVatDeadline({
      frequency: 'monthly',
      asOf: '2025-07-26',
    })
    expect(r!.dueDate).toBe('2025-07-28')
    expect(r!.daysUntil).toBe(2)
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

describe('VS-129 bumpToNextWorkday — svensk helgkalender', () => {
  it('vardag (mån) hålls som är', () => {
    expect(bumpToNextWorkday('2025-07-28')).toBe('2025-07-28') // måndag
  })

  it('lördag bumpas till måndag', () => {
    expect(bumpToNextWorkday('2025-07-26')).toBe('2025-07-28')
  })

  it('söndag bumpas till måndag', () => {
    expect(bumpToNextWorkday('2025-07-27')).toBe('2025-07-28')
  })

  it('Nyårsdagen (1 jan) bumpas — 2025 är onsdag → torsdag', () => {
    expect(bumpToNextWorkday('2025-01-01')).toBe('2025-01-02')
  })

  it('Trettondedag jul (6 jan 2025 mån) → tisdag', () => {
    expect(bumpToNextWorkday('2025-01-06')).toBe('2025-01-07')
  })

  it('Långfredagen 2025 (18 apr fre) → måndag (annandag påsk = 21 apr)', () => {
    // 18 apr fre (Långfredag) → 19 lör → 20 sön (Påskdag) → 21 mån (Annandag) → 22 tis
    expect(bumpToNextWorkday('2025-04-18')).toBe('2025-04-22')
  })

  it('Första maj 2025 (tor) → fredag', () => {
    expect(bumpToNextWorkday('2025-05-01')).toBe('2025-05-02')
  })

  it('Kristi himmelsfärds dag 2025 (29 maj tor) → fredag', () => {
    expect(bumpToNextWorkday('2025-05-29')).toBe('2025-05-30')
  })

  it('Sveriges nationaldag 2025 (6 jun fre) → måndag', () => {
    // 6 juni 2025 fredag → 7 lör → 8 sön → 9 mån
    expect(bumpToNextWorkday('2025-06-06')).toBe('2025-06-09')
  })

  it('Midsommarafton är ej helgdag — 20 juni 2025 (fre) hålls', () => {
    // Midsommarafton är de facto ledigt men inte i SKVs lista — vi
    // räknar bara midsommardagen (lördagen 21 juni 2025).
    expect(bumpToNextWorkday('2025-06-20')).toBe('2025-06-20')
  })

  it('Julafton 2025 (24 dec ons) bumpas — 25/26 också helgdag → 29 dec mån', () => {
    expect(bumpToNextWorkday('2025-12-24')).toBe('2025-12-29')
  })

  it('Nyårsafton 2025 (31 dec ons) bumpas till första vardag 2026', () => {
    // 31 dec ons (helg) → 1 jan tor (Nyårsdag) → 2 jan fre (vardag)
    expect(bumpToNextWorkday('2025-12-31')).toBe('2026-01-02')
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
