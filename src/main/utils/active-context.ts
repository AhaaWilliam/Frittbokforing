import type Database from 'better-sqlite3'

/**
 * Aktiv-bolag/FY-resolution för main-process.
 *
 * Sprint MC1: Avskaffar `(SELECT id FROM companies LIMIT 1)`-mönstret.
 * Helpers exporteras både för callsites som har fy_id (90% av fallen)
 * och callsites som behöver lookup mot settings (export, fixed_assets, etc.).
 */

/**
 * Hämtar company_id för ett givet fiscal_year_id.
 * Används av journal_entries-INSERTs där fy_id alltid är känd lokalt.
 *
 * Kastar om FY inte finns — det är en programmeringsbugg, inte ett valideringsfel.
 */
export function getCompanyIdForFiscalYear(
  db: Database.Database,
  fiscalYearId: number,
): number {
  const row = db
    .prepare('SELECT company_id FROM fiscal_years WHERE id = ?')
    .get(fiscalYearId) as { company_id: number } | undefined
  if (!row) {
    throw new Error(
      `[active-context] fiscal_year_id ${fiscalYearId} finns inte`,
    )
  }
  return row.company_id
}

/**
 * Hämtar aktivt company_id baserat på settings.last_company_id med fallback
 * till första bolaget i DB. Returnerar null om databasen är tom.
 *
 * Används av export, SIE-import, fixed_assets och andra callsites som inte
 * har en fiscal_year_id i sin scope.
 *
 * Bakåtkompatibel med single-company: när last_company_id saknas väljs
 * det enda existerande bolaget.
 */
export function getActiveCompanyId(
  db: Database.Database,
  settings: Record<string, unknown>,
): number | null {
  const stored = settings.last_company_id
  if (typeof stored === 'number') {
    const exists = db
      .prepare('SELECT 1 FROM companies WHERE id = ?')
      .get(stored) as { 1: number } | undefined
    if (exists) return stored
  }
  const first = db
    .prepare('SELECT id FROM companies ORDER BY id LIMIT 1')
    .get() as { id: number } | undefined
  return first?.id ?? null
}
