/**
 * VS-145c: Fuzzy-match OCR supplier_hint against counterparty list.
 *
 * Pure function — testable in isolation, no React/IPC deps.
 *
 * Algoritm:
 *  1. Normalisera hint + kandidat-namn (lowercase, trim, strip svenska
 *     bolagssuffix som "AB", "Aktiebolag", interpunktion).
 *  2. Substring-träff (hint ⊂ name eller name ⊂ hint) → score 1.0.
 *  3. Levenshtein-distance fallback för typos:
 *     score = 1 - distance / max(hintLen, nameLen).
 *  4. Returnera bästa match med score >= 0.7, annars null.
 *
 * Vid lika score: alfabetisk första (deterministiskt val per spec).
 *
 * Skip-villkor: tom hint, tom kandidat-lista, för korta normaliserade
 * strängar (< 3 chars) — för osäkert.
 */

const THRESHOLD = 0.7
const MIN_LEN = 3

export type SupplierCandidate = { id: number; name: string }
export type SupplierMatch = { id: number; name: string; score: number }

/**
 * Strip svenska bolagsformer och interpunktion. lowercase + trim.
 *
 * Exempel:
 *  - "Acme AB"          → "acme"
 *  - "Acme Aktiebolag"  → "acme"
 *  - "Acme AB."         → "acme"
 *  - "Acme, AB"         → "acme"
 */
export function normalizeSupplierName(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[.,;:]/g, ' ')
      // Svenska bolagsformer som hela ord (efter punktion-strip).
      .replace(/\b(aktiebolag|ab|hb|kb|ek\s*för|enskild\s*firma)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/**
 * Klassisk Levenshtein-distance (edit distance). O(n*m) tid, O(min) minne.
 * Inga deps — ~25 rader.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  // Säkerställ att b är den kortare strängen → mindre row-buffer.
  if (a.length < b.length) {
    const tmp = a
    a = b
    b = tmp
  }
  let prev = new Array<number>(b.length + 1)
  let curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1, // insert
        prev[j] + 1, // delete
        prev[j - 1] + cost, // substitute
      )
    }
    const tmp = prev
    prev = curr
    curr = tmp
  }
  return prev[b.length]
}

/**
 * Returnera bästa matchande counterparty (eller null).
 *
 * Vid flera kandidater med samma score: alfabetisk första (sort på
 * normaliserat namn för stabilitet).
 */
export function matchSupplier(
  hint: string,
  candidates: SupplierCandidate[],
): SupplierMatch | null {
  if (!hint || candidates.length === 0) return null
  const normHint = normalizeSupplierName(hint)
  if (normHint.length < MIN_LEN) return null

  type Scored = { c: SupplierCandidate; norm: string; score: number }
  const scored: Scored[] = []

  for (const c of candidates) {
    const norm = normalizeSupplierName(c.name)
    if (norm.length < MIN_LEN) continue

    let score: number
    if (norm.includes(normHint) || normHint.includes(norm)) {
      score = 1.0
    } else {
      const dist = levenshtein(normHint, norm)
      const maxLen = Math.max(normHint.length, norm.length)
      score = maxLen > 0 ? 1 - dist / maxLen : 0
    }

    if (score >= THRESHOLD) scored.push({ c, norm, score })
  }

  if (scored.length === 0) return null

  // Sortera på (score desc, normaliserat namn asc) för deterministisk vinst.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.norm.localeCompare(b.norm)
  })

  const winner = scored[0]
  return { id: winner.c.id, name: winner.c.name, score: winner.score }
}
