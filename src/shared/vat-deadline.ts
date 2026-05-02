/**
 * VAT-deadline-utility (Sprint VS-115b).
 *
 * Beräknar nästa moms-deklarations-deadline enligt Skatteverkets regler:
 *
 *   - 'monthly':   26:e i andra månaden efter perioden.
 *                  Exempel: maj-perioden → 26 juli.
 *   - 'quarterly': 12:e i andra månaden efter kvartalets slut.
 *                  Exempel: Q2 (apr–jun) → 12 augusti.
 *                  Q1 (jan–mar) → 12 maj
 *                  Q2 (apr–jun) → 12 augusti
 *                  Q3 (jul–sep) → 12 november
 *                  Q4 (okt–dec) → 12 februari
 *   - 'yearly':    26:e i andra månaden efter räkenskapsårets slut.
 *                  Standard kalenderår: 26 februari året efter.
 *                  Brutet räkenskapsår: 26:e andra månaden efter end_date.
 *
 * Helger/röda dagar: SKV flyttar deadline till nästa vardag (måndag-fredag,
 * inte röd dag). VS-129 implementerar bump till nästa vardag via svensk
 * helgkalender (Easter-derived + statiska helgdagar).
 *
 * Returnerar `null` om input är inkomplett (saknad fiscal_year_end vid
 * yearly-frekvens).
 */

export type VatFrequency = 'monthly' | 'quarterly' | 'yearly'

export interface VatDeadlineInput {
  frequency: VatFrequency
  /** Datum att räkna ifrån (typiskt idag eller en period-start). ISO yyyy-mm-dd. */
  asOf: string
  /** Räkenskapsårets slutdatum (krävs för yearly). ISO yyyy-mm-dd. */
  fiscal_year_end?: string
}

export interface VatDeadlineResult {
  /** Den period som deklarationen avser (mänsklig text, sv-SE). */
  periodLabel: string
  /** Deadline-datum (ISO yyyy-mm-dd). */
  dueDate: string
  /** Antal hela dagar kvar. Negativ om deadline passerats. */
  daysUntil: number
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

function isoDate(year: number, month1Indexed: number, day: number): string {
  return `${year}-${pad2(month1Indexed)}-${pad2(day)}`
}

function daysBetween(fromIso: string, toIso: string): number {
  // UTC-baserad beräkning — undviker DST-shifts vid lokal-tid-arithmetik.
  const f = new Date(`${fromIso}T00:00:00Z`).getTime()
  const t = new Date(`${toIso}T00:00:00Z`).getTime()
  return Math.round((t - f) / (24 * 60 * 60 * 1000))
}

/**
 * VS-129 — svensk helg-bump för VAT-deadline.
 *
 * Computus (Anonymous Gregorian) för påskdag, sen derivat för rörliga
 * helger. Statiska helger inkluderas. Returnerar Set<'YYYY-MM-DD'>.
 */
function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const L = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * L) / 451)
  const month = Math.floor((h + L - 7 * m + 114) / 31)
  const day = ((h + L - 7 * m + 114) % 31) + 1
  return { month, day }
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

function saturdayInRange(
  year: number,
  month1: number,
  fromDay: number,
  toDay: number,
): string {
  for (let d = fromDay; d <= toDay; d++) {
    const date = new Date(Date.UTC(year, month1 - 1, d))
    if (date.getUTCDay() === 6) return isoDate(year, month1, d)
  }
  return isoDate(year, month1, fromDay) // safety
}

const holidayCache = new Map<number, Set<string>>()

function swedishBankHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year)
  if (cached) return cached
  const out = new Set<string>()
  // Statiska
  out.add(isoDate(year, 1, 1)) // Nyårsdagen
  out.add(isoDate(year, 1, 6)) // Trettondedag jul
  out.add(isoDate(year, 5, 1)) // Första maj
  out.add(isoDate(year, 6, 6)) // Sveriges nationaldag
  out.add(isoDate(year, 12, 24)) // Julafton (de facto)
  out.add(isoDate(year, 12, 25)) // Juldagen
  out.add(isoDate(year, 12, 26)) // Annandag jul
  out.add(isoDate(year, 12, 31)) // Nyårsafton (de facto)
  // Påsk-relaterade
  const easter = easterSunday(year)
  const easterIso = isoDate(year, easter.month, easter.day)
  out.add(addDaysIso(easterIso, -2)) // Långfredagen
  // Påskdagen söndag — räknas som söndag, behöver inte addas
  out.add(addDaysIso(easterIso, 1)) // Annandag påsk
  out.add(addDaysIso(easterIso, 39)) // Kristi himmelsfärds dag (torsdag)
  // Midsommardagen — lördagen mellan 20-26 juni
  out.add(saturdayInRange(year, 6, 20, 26))
  // Alla helgons dag — lördagen mellan 31 okt och 6 nov
  // (kan spilla från okt till nov; testa båda månaderna)
  let allSaints = ''
  for (let d = 31; d <= 31; d++) {
    const date = new Date(Date.UTC(year, 9, d))
    if (date.getUTCDay() === 6) {
      allSaints = isoDate(year, 10, d)
      break
    }
  }
  if (!allSaints) allSaints = saturdayInRange(year, 11, 1, 6)
  out.add(allSaints)
  holidayCache.set(year, out)
  return out
}

/**
 * Bumpa ett ISO-datum framåt till närmsta vardag (mån-fre) som inte är
 * svensk röd dag. SKV-praxis: deadline som infaller på helg/röd dag
 * flyttas till nästa vardag.
 */
export function bumpToNextWorkday(iso: string): string {
  let cur = iso
  for (let i = 0; i < 14; i++) {
    const d = new Date(`${cur}T00:00:00Z`)
    const dow = d.getUTCDay() // 0=sön, 6=lör
    const year = d.getUTCFullYear()
    const isWeekend = dow === 0 || dow === 6
    const isHoliday = swedishBankHolidays(year).has(cur)
    if (!isWeekend && !isHoliday) return cur
    cur = addDaysIso(cur, 1)
  }
  return cur // safety — bör aldrig nås
}

const SV_MONTHS = [
  'januari',
  'februari',
  'mars',
  'april',
  'maj',
  'juni',
  'juli',
  'augusti',
  'september',
  'oktober',
  'november',
  'december',
]

function monthName(idx0: number): string {
  return SV_MONTHS[((idx0 % 12) + 12) % 12]
}

function addMonths(
  year: number,
  month1Indexed: number,
  delta: number,
): {
  year: number
  month: number
} {
  const idx = month1Indexed - 1 + delta
  const yDelta = Math.floor(idx / 12)
  const m = ((idx % 12) + 12) % 12
  return { year: year + yDelta, month: m + 1 }
}

/**
 * Beräknar nästa moms-deadline för en given frekvens.
 *
 * För 'monthly': hittar perioden som senast slutade FÖRE asOf, plus en månad
 * hjälp om asOf själv ligger inom en aktiv period — vi vill alltid visa
 * NÄSTA kommande deadline. Implementation: deadline för månad m = 26:e i
 * månad m+2. Vi börjar med periodens slut = asOf, och bumpar tills deadline
 * ligger >= asOf.
 */
export function computeVatDeadline(
  input: VatDeadlineInput,
): VatDeadlineResult | null {
  const asOfDate = new Date(`${input.asOf}T00:00:00Z`)
  const asOfYear = asOfDate.getUTCFullYear()
  const asOfMonth1 = asOfDate.getUTCMonth() + 1

  if (input.frequency === 'monthly') {
    // Hitta tidigaste period vars deadline (26:e i month+2) >= asOf.
    // Start: period = nuvarande månad, bumpa bakåt om dess deadline redan
    // passerats; bumpa framåt om vi vill skipa redan-passerade.
    let pYear = asOfYear
    let pMonth = asOfMonth1
    // Bumpa tillbaks tills periodens deadline ligger >= asOf
    // (linjär search är OK — max 12 iterationer)
    for (let i = 0; i < 24; i++) {
      const dl = addMonths(pYear, pMonth, 2)
      const dueIso = bumpToNextWorkday(isoDate(dl.year, dl.month, 26))
      if (daysBetween(input.asOf, dueIso) >= 0) {
        // Detta är nästa kommande. Gå EN tillbaka för att se om en
        // tidigare period också är aktuell — vi vill ha den period
        // vars deadline är *närmast* utan att vara passerad.
        const prev = addMonths(pYear, pMonth, -1)
        const prevDl = addMonths(prev.year, prev.month, 2)
        const prevDueIso = bumpToNextWorkday(
          isoDate(prevDl.year, prevDl.month, 26),
        )
        if (daysBetween(input.asOf, prevDueIso) >= 0) {
          pYear = prev.year
          pMonth = prev.month
          continue
        }
        return {
          periodLabel: `${monthName(pMonth - 1)} ${pYear}`,
          dueDate: dueIso,
          daysUntil: daysBetween(input.asOf, dueIso),
        }
      }
      // Deadline passerad — bumpa framåt
      const next = addMonths(pYear, pMonth, 1)
      pYear = next.year
      pMonth = next.month
    }
    return null
  }

  if (input.frequency === 'quarterly') {
    // Quarter-end-månad: 3, 6, 9, 12. Deadline = 12:e i (quarter-end+2).
    function quarterEndOf(
      year: number,
      month1: number,
    ): {
      year: number
      qEndMonth: number
    } {
      const q = Math.ceil(month1 / 3)
      return { year, qEndMonth: q * 3 }
    }
    let { year: qYear, qEndMonth } = quarterEndOf(asOfYear, asOfMonth1)
    for (let i = 0; i < 8; i++) {
      const dl = addMonths(qYear, qEndMonth, 2)
      const dueIso = bumpToNextWorkday(isoDate(dl.year, dl.month, 12))
      if (daysBetween(input.asOf, dueIso) >= 0) {
        const qStart = addMonths(qYear, qEndMonth, -2)
        const qLabel = `Q${Math.ceil(qEndMonth / 3)} ${qYear} (${monthName(qStart.month - 1)}–${monthName(qEndMonth - 1)})`
        return {
          periodLabel: qLabel,
          dueDate: dueIso,
          daysUntil: daysBetween(input.asOf, dueIso),
        }
      }
      // Bumpa till nästa kvartal
      const next = addMonths(qYear, qEndMonth, 3)
      qYear = next.year
      qEndMonth = next.month
    }
    return null
  }

  // yearly
  if (!input.fiscal_year_end) return null
  const fyEnd = new Date(`${input.fiscal_year_end}T00:00:00Z`)
  const fyEndYear = fyEnd.getUTCFullYear()
  const fyEndMonth1 = fyEnd.getUTCMonth() + 1
  // Deadline = 26:e i (fyEnd-month + 2)
  const dl = addMonths(fyEndYear, fyEndMonth1, 2)
  const dueIso = bumpToNextWorkday(isoDate(dl.year, dl.month, 26))
  return {
    periodLabel: `Räkenskapsår ${fyEndYear}`,
    dueDate: dueIso,
    daysUntil: daysBetween(input.asOf, dueIso),
  }
}

/**
 * UI-tone-mapping enligt produktbeslut (VS-115):
 *   - 'danger':  daysUntil <= 0 (förfallit eller idag)
 *   - 'warning': 1 <= daysUntil < 14 (närmar sig)
 *   - 'mint':    daysUntil >= 14 (lugnt)
 */
export function vatDeadlineTone(
  daysUntil: number,
): 'danger' | 'warning' | 'mint' {
  if (daysUntil <= 0) return 'danger'
  if (daysUntil < 14) return 'warning'
  return 'mint'
}
