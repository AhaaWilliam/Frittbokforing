import type Database from 'better-sqlite3'
import type { VatCode } from '../../shared/types'

export function listVatCodes(
  db: Database.Database,
  direction?: 'outgoing' | 'incoming',
): VatCode[] {
  let sql = 'SELECT * FROM vat_codes WHERE 1=1'

  if (direction === 'outgoing') {
    sql += " AND vat_type = 'outgoing'"
  } else if (direction === 'incoming') {
    sql += " AND vat_type = 'incoming'"
  }

  sql += ' ORDER BY code ASC'
  return db.prepare(sql).all() as VatCode[]
}
