/**
 * Returns today's date in local time as YYYY-MM-DD string.
 * Use this instead of new Date().toISOString().split('T')[0]
 * which returns UTC date (wrong in Stockholm UTC+1/+2 after 22:00).
 *
 * SQL-sidan använder date('now','localtime') för samma anledning.
 */
export function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Skottårskontroll.
 */
export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

/**
 * Lägg till en dag på ett ISO-datum.
 * '2026-01-31' → '2026-02-01'
 */
export function addOneDay(dateStr: string): string {
  const y = parseInt(dateStr.substring(0, 4), 10)
  const m = parseInt(dateStr.substring(5, 7), 10)
  const d = parseInt(dateStr.substring(8, 10), 10)

  const daysInMonth = [
    0,
    31,
    isLeapYear(y) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ]

  let ny = y,
    nm = m,
    nd = d + 1
  if (nd > daysInMonth[nm]) {
    nd = 1
    nm++
    if (nm > 12) {
      nm = 1
      ny++
    }
  }
  return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`
}

/**
 * Lägg till N månader minus en dag.
 * addMonthsMinusOneDay('2026-01-01', 12) → '2026-12-31'
 */
export function addMonthsMinusOneDay(dateStr: string, months: number): string {
  const y = parseInt(dateStr.substring(0, 4), 10)
  const m = parseInt(dateStr.substring(5, 7), 10)

  const totalMonth = y * 12 + (m - 1) + months
  const ny = Math.floor(totalMonth / 12)
  const nm = (totalMonth % 12) + 1

  let ey = ny,
    em = nm - 1
  if (em < 1) {
    em = 12
    ey--
  }
  const daysInMonth = [
    0,
    31,
    isLeapYear(ey) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ]
  const ed = daysInMonth[em]

  return `${ey}-${String(em).padStart(2, '0')}-${String(ed).padStart(2, '0')}`
}

/**
 * Subtrahera N månader från ett ISO-datum (YYYY-MM-DD).
 * Dag clampas till giltig range för målmånaden.
 * subtractMonths('2026-05-31', 3) → '2026-02-28'
 */
export function subtractMonths(dateStr: string, months: number): string {
  if (months < 0) throw new Error('months must be >= 0')
  if (months === 0) return dateStr

  const y = parseInt(dateStr.substring(0, 4), 10)
  const m = parseInt(dateStr.substring(5, 7), 10)
  const d = parseInt(dateStr.substring(8, 10), 10)

  const totalMonth = y * 12 + (m - 1) - months
  const newYear = Math.floor(totalMonth / 12)
  const newMonth = (totalMonth % 12) + 1

  const daysInMonth = [
    0,
    31,
    isLeapYear(newYear) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ]
  const clampedDay = Math.min(d, daysInMonth[newMonth])

  return `${newYear}-${String(newMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}

/**
 * Lägg till N dagar.
 * addDays('2026-03-30', 2) → '2026-04-01'
 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  const ry = date.getFullYear()
  const rm = String(date.getMonth() + 1).padStart(2, '0')
  const rd = String(date.getDate()).padStart(2, '0')
  return `${ry}-${rm}-${rd}`
}
