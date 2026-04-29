import type Database from 'better-sqlite3'

export interface VatCodeInfo {
  rate: number
  vatAccount: string | null
}

/**
 * Hämtar VAT-koder för en given riktning (incoming/outgoing/all) och returnerar
 * en Map för O(1)-lookup. Används av invoice-service och expense-service för att
 * undvika N+1 vid radberäkningar.
 *
 * - 'outgoing' (invoice): bara `rate_percent` behövs — vatAccount = null.
 * - 'incoming' (expense): både `rate_percent` och `vat_account` används.
 * - 'all': hämtar båda riktningar (används av UI-scheman).
 */
export function loadVatCodeMap(
  db: Database.Database,
  direction: 'incoming' | 'outgoing' | 'all',
): Map<number, VatCodeInfo> {
  let sql: string
  if (direction === 'incoming') {
    sql =
      "SELECT id, rate_percent, vat_account FROM vat_codes WHERE vat_type = 'incoming'"
  } else if (direction === 'outgoing') {
    sql = 'SELECT id, rate_percent, NULL as vat_account FROM vat_codes'
  } else {
    sql = 'SELECT id, rate_percent, vat_account FROM vat_codes'
  }
  const rows = db.prepare(sql).all() as {
    id: number
    rate_percent: number
    vat_account: string | null
  }[]
  return new Map(
    rows.map((r) => [
      r.id,
      { rate: r.rate_percent, vatAccount: r.vat_account },
    ]),
  )
}

/**
 * Beräknar moms-belopp för en rad givet netto-belopp och VAT-kod.
 *
 * `rate_percent` lagras som heltal (25, 12, 6, 0) — beräkningen går via
 * heltalsaritmetik: `Math.round(lineTotalOre * rate / 100)`.
 *
 * Om VAT-koden inte finns i mappen returneras 0 (defensivt, samma beteende
 * som tidigare i invoice-service och expense-service).
 */
export function computeLineVat(
  vatCodeMap: Map<number, VatCodeInfo>,
  vatCodeId: number,
  lineTotalOre: number,
): number {
  const info = vatCodeMap.get(vatCodeId)
  if (!info) return 0
  return Math.round((lineTotalOre * info.rate) / 100)
}
