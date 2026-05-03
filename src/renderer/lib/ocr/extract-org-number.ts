/**
 * VS-145d: Extrahera svenskt organisationsnummer från OCR-text.
 *
 * Format: XXXXXX-XXXX (10 siffror, bindestreck efter 6:e). Accepterar även
 * varianten utan bindestreck. Validerar Luhn-kontrollsiffra (samma algoritm
 * som svenska personnummer) — endast giltiga org-nr returneras. Confidence
 * är binär: 100 vid pass, 0 vid miss.
 *
 * Output normaliseras alltid till `XXXXXX-XXXX`-format med bindestreck.
 */

const CANDIDATE_RE = /(?<![\d])(\d{6})-?(\d{4})(?![\d])/g

/**
 * Luhn-checksum för svenska 10-siffriga identifierare.
 * Vikter [2,1,2,1,2,1,2,1,2] över de 9 första siffrorna.
 * Vid produkt > 9: summera siffrorna (motsvarar (p % 10) + Math.floor(p/10)).
 * Förväntad kontrollsiffra = (10 - summa % 10) % 10.
 */
export function isValidSwedishOrgNumber(digits: string): boolean {
  if (!/^\d{10}$/.test(digits)) return false
  const weights = [2, 1, 2, 1, 2, 1, 2, 1, 2]
  let sum = 0
  for (let i = 0; i < 9; i++) {
    const product = Number(digits[i]) * weights[i]
    sum += product > 9 ? Math.floor(product / 10) + (product % 10) : product
  }
  const expected = (10 - (sum % 10)) % 10
  return expected === Number(digits[9])
}

export type ExtractedOrgNumber = { value?: string; confidence: number }

export function extractOrgNumber(text: string): ExtractedOrgNumber {
  if (!text || text.trim().length === 0) return { confidence: 0 }
  CANDIDATE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = CANDIDATE_RE.exec(text)) !== null) {
    const digits = m[1] + m[2]
    if (isValidSwedishOrgNumber(digits)) {
      return { value: `${m[1]}-${m[2]}`, confidence: 100 }
    }
  }
  return { confidence: 0 }
}

/**
 * Normalisera ett org-nr-strängvärde till `XXXXXX-XXXX`-format.
 * Returnerar null vid ogiltig form. Validerar INTE Luhn (för match-jämförelse
 * vill vi även normalisera kandidat-värden från databasen där användaren kan
 * ha matat in formatet utan validering).
 */
export function normalizeOrgNumber(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length !== 10) return null
  return `${digits.slice(0, 6)}-${digits.slice(6)}`
}
