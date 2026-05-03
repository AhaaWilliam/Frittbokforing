/**
 * VS-149: Mappa en date-range (from/to ISO-8601 dates) till en
 * fiscal-period inom det aktiva räkenskapsåret.
 *
 * Pure-funktion — ingen React, inga sidoeffekter. Testbar isolerat.
 *
 * Mapping-regler:
 *  - Returnerar perioden om from/to **exakt** ligger inom EN periods bounds
 *    (`from >= start_date && to <= end_date`).
 *  - Returnerar `null` om from/to spänner flera perioder, ligger utanför
 *    samtliga öppna perioder, eller om periods-arrayen är tom.
 *  - Strängjämförelse på ISO-8601-dates (YYYY-MM-DD) är lexikografiskt
 *    korrekt — ingen Date-parsning behövs.
 */

export interface PeriodLike {
  id: number
  period_number: number
  start_date: string
  end_date: string
}

export interface MappedPeriod {
  periodId: number
  periodNumber: number
}

export function mapDateRangeToPeriod(
  from: string,
  to: string,
  periods: ReadonlyArray<PeriodLike>,
): MappedPeriod | null {
  if (periods.length === 0) return null
  if (!from || !to) return null

  const candidates = periods.filter(
    (p) => from >= p.start_date && to <= p.end_date,
  )
  if (candidates.length !== 1) return null
  const match = candidates[0]
  return { periodId: match.id, periodNumber: match.period_number }
}
