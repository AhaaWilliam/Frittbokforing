import type Database from 'better-sqlite3'

export interface BuildUpdateOptions {
  allowedColumns: ReadonlySet<string>
  fieldMap?: Readonly<Record<string, string>>
  touchUpdatedAt?: boolean
}

export interface BuiltUpdate {
  fieldCount: number
  run: (whereClause: string, whereParams: readonly unknown[]) => void
}

/**
 * Bygger UPDATE säkert: nycklar filtreras mot en whitelist, värden binds via ?.
 * Kolumn-identifierare citeras men whitelisten är den enda källan — aldrig
 * användar-input. Se CLAUDE.md regel 3 och säkerhets-granskning S-U1.
 *
 * Returnerar null om inga tillåtna fält finns att uppdatera.
 */
export function buildUpdate(
  db: Database.Database,
  table: string,
  data: Record<string, unknown>,
  opts: BuildUpdateOptions,
): BuiltUpdate | null {
  const sets: string[] = []
  const params: unknown[] = []
  const fieldMap = opts.fieldMap ?? {}

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    const dbCol = fieldMap[key] ?? key
    if (!opts.allowedColumns.has(dbCol)) continue
    sets.push(`"${dbCol}" = ?`)
    params.push(value ?? null)
  }

  if (sets.length === 0) return null

  const fieldCount = sets.length
  if (opts.touchUpdatedAt) {
    sets.push("updated_at = datetime('now','localtime')")
  }

  const setClause = sets.join(', ')
  return {
    fieldCount,
    run: (whereClause, whereParams) => {
      db.prepare(
        `UPDATE "${table}" SET ${setClause} WHERE ${whereClause}`,
      ).run(...params, ...whereParams)
    },
  }
}
