import { describe, it, expect } from 'vitest'
import {
  mapDateRangeToPeriod,
  type PeriodLike,
} from '../../../src/renderer/lib/period-mapping'

const PERIODS: PeriodLike[] = [
  { id: 101, period_number: 1, start_date: '2026-01-01', end_date: '2026-01-31' },
  { id: 102, period_number: 2, start_date: '2026-02-01', end_date: '2026-02-28' },
  { id: 103, period_number: 3, start_date: '2026-03-01', end_date: '2026-03-31' },
]

describe('mapDateRangeToPeriod (VS-149)', () => {
  it('from/to exakt på en periods bounds → matchar', () => {
    expect(mapDateRangeToPeriod('2026-02-01', '2026-02-28', PERIODS)).toEqual({
      periodId: 102,
      periodNumber: 2,
    })
  })

  it('from/to inom en periods bounds → matchar', () => {
    expect(mapDateRangeToPeriod('2026-01-10', '2026-01-20', PERIODS)).toEqual({
      periodId: 101,
      periodNumber: 1,
    })
  })

  it('from/to spänner två perioder → null', () => {
    expect(mapDateRangeToPeriod('2026-01-15', '2026-02-15', PERIODS)).toBeNull()
  })

  it('from/to spänner alla perioder → null', () => {
    expect(mapDateRangeToPeriod('2026-01-01', '2026-03-31', PERIODS)).toBeNull()
  })

  it('from/to utanför alla perioder → null', () => {
    expect(mapDateRangeToPeriod('2025-12-01', '2025-12-31', PERIODS)).toBeNull()
  })

  it('from = period.end_date (samma dag som periodens slut) → räknas som inom', () => {
    expect(mapDateRangeToPeriod('2026-01-31', '2026-01-31', PERIODS)).toEqual({
      periodId: 101,
      periodNumber: 1,
    })
  })

  it('tom periods-array → null', () => {
    expect(mapDateRangeToPeriod('2026-01-01', '2026-01-31', [])).toBeNull()
  })

  it('tom from eller to → null', () => {
    expect(mapDateRangeToPeriod('', '2026-01-31', PERIODS)).toBeNull()
    expect(mapDateRangeToPeriod('2026-01-01', '', PERIODS)).toBeNull()
    expect(mapDateRangeToPeriod('', '', PERIODS)).toBeNull()
  })

  it('from > to (ogiltig range) → null (ingen period kan omfatta inverterad range)', () => {
    // from=2026-02-15, to=2026-01-10 → ingen period har start <= from && end >= to
    expect(mapDateRangeToPeriod('2026-02-15', '2026-01-10', PERIODS)).toBeNull()
  })

  it('en enda period i array, range matchar → matchar', () => {
    const single: PeriodLike[] = [
      { id: 1, period_number: 1, start_date: '2026-01-01', end_date: '2026-12-31' },
    ]
    expect(mapDateRangeToPeriod('2026-06-01', '2026-06-30', single)).toEqual({
      periodId: 1,
      periodNumber: 1,
    })
  })
})
