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
 * Helger/röda dagar: SKV flyttar deadline till närmsta vardag. Vi
 * approximerar och returnerar det formella datumet — UI:n kan ändå
 * visa "förfallit" först efter den formella dagen utan att skada.
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
      const dueIso = isoDate(dl.year, dl.month, 26)
      if (daysBetween(input.asOf, dueIso) >= 0) {
        // Detta är nästa kommande. Gå EN tillbaka för att se om en
        // tidigare period också är aktuell — vi vill ha den period
        // vars deadline är *närmast* utan att vara passerad.
        const prev = addMonths(pYear, pMonth, -1)
        const prevDl = addMonths(prev.year, prev.month, 2)
        const prevDueIso = isoDate(prevDl.year, prevDl.month, 26)
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
      const dueIso = isoDate(dl.year, dl.month, 12)
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
  const dueIso = isoDate(dl.year, dl.month, 26)
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
