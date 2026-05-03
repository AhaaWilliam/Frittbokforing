/**
 * Pure extraction-funktioner för OCR-text från kvitton.
 *
 * VS-145a: Inga sido-effekter, ingen Tesseract-koppling. Lättestat med
 * fixture-strängar. Tröskel 70% — fält under threshold returneras inte.
 *
 * Threshold-strategi: per-fält confidence = min(ocrConfidence, regex-quality).
 * Regex-quality är 100 vid tydlig match med svensk-specifik kontext-keyword
 * (Total/Summa/Att betala/Datum), 80 vid tydlig regex-match utan kontext,
 * 60 vid svag/ambiguös match.
 */

const CONFIDENCE_THRESHOLD = 70

export type ExtractedFieldResult<T> = {
  value?: T
  confidence: number
}

export type ExtractedFields = {
  amount_kr?: number
  date?: string
  supplier_hint?: string
  confidence: number
}

const SWEDISH_MONTHS: Record<string, string> = {
  januari: '01',
  februari: '02',
  mars: '03',
  april: '04',
  maj: '05',
  juni: '06',
  juli: '07',
  augusti: '08',
  september: '09',
  oktober: '10',
  november: '11',
  december: '12',
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  okt: '10',
  nov: '11',
  dec: '12',
}

const AMOUNT_KEYWORDS =
  /(total|summa|att\s+betala|totalsumma|totalt|att\s+erl[äa]gga|brutto)/i
const DATE_KEYWORDS = /(datum|kvittodatum|k[öo]pdatum|fakturadatum)/i

/**
 * Parsa svenskt amount-format till antal kronor (number).
 * Stödjer "1 234,50", "1234.50", "1234", "1 234 kr".
 */
function parseSekAmount(raw: string): number | null {
  const cleaned = raw.replace(/(kr|sek|:-)/gi, '').trim()
  if (!cleaned) return null
  let normalized = cleaned.replace(/[\s ]+/g, '')
  const lastComma = normalized.lastIndexOf(',')
  const lastDot = normalized.lastIndexOf('.')

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, '').replace(',', '.')
    } else {
      normalized = normalized.replace(/,/g, '')
    }
  } else if (lastComma >= 0) {
    const after = normalized.length - lastComma - 1
    if (after === 1 || after === 2) {
      normalized = normalized.replace(/,/g, '.')
    } else {
      normalized = normalized.replace(/,/g, '')
    }
  } else if (lastDot >= 0) {
    const after = normalized.length - lastDot - 1
    if (after !== 1 && after !== 2) {
      normalized = normalized.replace(/\./g, '')
    }
  }

  const value = Number(normalized)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

/**
 * Sök efter SEK-belopp i text. Returnerar det största beloppet
 * (totalsumma är typiskt störst på ett kvitto).
 *
 * Confidence-bonus om beloppet följer ett amount-keyword
 * (Total, Summa, Att betala) på samma rad.
 */
export function extractAmountKr(text: string): ExtractedFieldResult<number> {
  if (!text || text.trim().length === 0) return { confidence: 0 }

  // Föredrar längsta match: heltal med tusentals-sep + decimaler först,
  // sedan rena decimaltal, sedan rena heltal.
  // [\s ] tillåter regular space och NBSP i tusentals-grupper.
  const amountSource =
    '\\b(\\d{1,3}(?:[\\s\\u00A0]\\d{3})+(?:[.,]\\d{1,2})?|\\d+[.,]\\d{1,2}|\\d+)\\s*(?:kr|sek|:-)?'

  type Candidate = { value: number; hasKeyword: boolean; hasCurrency: boolean }
  const candidates: Candidate[] = []

  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const hasKeyword = AMOUNT_KEYWORDS.test(line)
    const re = new RegExp(amountSource, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(line)) !== null) {
      const raw = m[1]
      const matchedFull = m[0]
      const hasCurrency = /kr|sek|:-/i.test(matchedFull)
      // Skippa rena heltal utan currency och utan keyword (för att undvika
      // organisationsnummer, postnummer, datum-fragment, etc.)
      if (
        !hasCurrency &&
        !hasKeyword &&
        !/[.,]/.test(raw) &&
        !/[\s ]/.test(raw)
      )
        continue
      if (raw.replace(/\D/g, '').length < 1) continue
      const value = parseSekAmount(raw)
      if (value === null) continue
      // Sanity: belopp över 10 miljoner kr är osannolikt för kvitton
      if (value > 10_000_000) continue
      candidates.push({ value, hasKeyword, hasCurrency })
    }
  }

  if (candidates.length === 0) return { confidence: 0 }

  const keyworded = candidates.filter((c) => c.hasKeyword)
  const pool = keyworded.length > 0 ? keyworded : candidates
  const best = pool.reduce((a, b) => (b.value > a.value ? b : a))

  let regexQuality: number
  if (best.hasKeyword) regexQuality = 100
  else if (best.hasCurrency) regexQuality = 80
  else regexQuality = 60

  return { value: best.value, confidence: regexQuality }
}

/**
 * Sök efter datum i text. Stödjer:
 * - ISO: 2026-05-03
 * - Slash: 03/05/2026, 3/5/26
 * - Punkt: 03.05.2026
 * - Svenska månadsnamn: 3 maj 2026
 *
 * Normaliserar till ISO yyyy-mm-dd. Returnerar första valid datum.
 */
export function extractDate(text: string): ExtractedFieldResult<string> {
  if (!text || text.trim().length === 0) return { confidence: 0 }

  type Candidate = { iso: string; hasKeyword: boolean }
  const candidates: Candidate[] = []

  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const hasKeyword = DATE_KEYWORDS.test(line)

    let m: RegExpExecArray | null
    const isoRe = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g
    while ((m = isoRe.exec(line)) !== null) {
      const iso = normalizeDate(m[1], m[2], m[3])
      if (iso) candidates.push({ iso, hasKeyword })
    }

    const slashRe = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g
    while ((m = slashRe.exec(line)) !== null) {
      const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3]
      const iso = normalizeDate(yyyy, m[2], m[1])
      if (iso) candidates.push({ iso, hasKeyword })
    }

    const dotRe = /\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/g
    while ((m = dotRe.exec(line)) !== null) {
      const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3]
      const iso = normalizeDate(yyyy, m[2], m[1])
      if (iso) candidates.push({ iso, hasKeyword })
    }

    const monthRe =
      /\b(\d{1,2})\s+(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december|jan|feb|mar|apr|jun|jul|aug|sep|okt|nov|dec)\.?\s+(\d{2,4})\b/gi
    while ((m = monthRe.exec(line)) !== null) {
      const monthKey = m[2].toLowerCase()
      const mm = SWEDISH_MONTHS[monthKey]
      if (!mm) continue
      const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3]
      const iso = normalizeDate(yyyy, mm, m[1])
      if (iso) candidates.push({ iso, hasKeyword })
    }
  }

  if (candidates.length === 0) return { confidence: 0 }

  const keyworded = candidates.find((c) => c.hasKeyword)
  const best = keyworded ?? candidates[0]
  const regexQuality = best.hasKeyword ? 100 : 80

  return { value: best.iso, confidence: regexQuality }
}

function normalizeDate(yyyy: string, mm: string, dd: string): string | null {
  const y = Number(yyyy)
  const m = Number(mm)
  const d = Number(dd)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d))
    return null
  if (y < 1900 || y > 2100) return null
  if (m < 1 || m > 12) return null
  if (d < 1 || d > 31) return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null
  }
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Heuristik: första icke-tom rad i printbart område, max 60 chars.
 *
 * Filtrerar bort rader som ser ut som adress, datum, belopp, eller
 * är för korta (<3 chars). Returnerar trimmad sträng.
 */
export function extractSupplierHint(
  text: string,
): ExtractedFieldResult<string> {
  if (!text || text.trim().length === 0) return { confidence: 0 }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  for (const line of lines) {
    if (line.length < 3) continue
    if (/^[\d\s\-/.,:]+$/.test(line)) continue
    if (AMOUNT_KEYWORDS.test(line)) continue
    if (DATE_KEYWORDS.test(line)) continue
    if (
      /\b(gatan|v[äa]gen|gata|v[äa]g|all[ée]|torget)\b/i.test(line) &&
      /\d/.test(line)
    )
      continue
    if (/^\d{6}-\d{4}$/.test(line)) continue
    const compact = line.replace(/\s+/g, '')
    if (compact.length < 3) continue

    const value = line.length > 60 ? line.slice(0, 60).trim() : line
    return { value, confidence: 80 }
  }

  return { confidence: 0 }
}

/**
 * Komponerar de tre extraktorerna. Per-fält confidence är
 * min(ocrConfidence, regex-quality). Fält under threshold returneras inte.
 */
export function extractReceiptFields(
  text: string,
  ocrConfidence: number,
): ExtractedFields {
  const amount = extractAmountKr(text)
  const date = extractDate(text)
  const supplier = extractSupplierHint(text)

  const amountConf = Math.min(ocrConfidence, amount.confidence)
  const dateConf = Math.min(ocrConfidence, date.confidence)
  const supplierConf = Math.min(ocrConfidence, supplier.confidence)

  const result: ExtractedFields = {
    confidence: ocrConfidence,
  }
  if (amount.value !== undefined && amountConf >= CONFIDENCE_THRESHOLD) {
    result.amount_kr = amount.value
  }
  if (date.value !== undefined && dateConf >= CONFIDENCE_THRESHOLD) {
    result.date = date.value
  }
  if (supplier.value !== undefined && supplierConf >= CONFIDENCE_THRESHOLD) {
    result.supplier_hint = supplier.value
  }
  return result
}
