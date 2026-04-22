/**
 * ensureFyScope — verifiera att ett fiscal_year_id tillhör förväntat bolag.
 *
 * Alla data-queries scopas till aktivt fiscal_year_id (regel 14). När en
 * service tar både fiscalYearId och companyId som explicita parametrar ska
 * sambandet verifieras — annars kan en race eller felkonfigurering låta en
 * användare agera på ett annat bolags data.
 *
 * Kastar strukturerat `{ code, error, field }`-fel (M100) vid mismatch.
 */

import type Database from 'better-sqlite3'

export interface FyScopeError {
  code:
    | 'NOT_FOUND'
    | 'VALIDATION_ERROR'
  error: string
  field?: string
}

export function ensureFyScope(
  db: Database.Database,
  fiscalYearId: number,
  expectedCompanyId: number,
): void {
  const row = db
    .prepare('SELECT company_id FROM fiscal_years WHERE id = ?')
    .get(fiscalYearId) as { company_id: number } | undefined

  if (!row) {
    const err: FyScopeError = {
      code: 'NOT_FOUND',
      error: 'Räkenskapsåret hittades inte.',
      field: 'fiscal_year_id',
    }
    throw err
  }
  if (row.company_id !== expectedCompanyId) {
    const err: FyScopeError = {
      code: 'VALIDATION_ERROR',
      error:
        'Räkenskapsåret tillhör ett annat bolag än det förväntade.',
      field: 'fiscal_year_id',
    }
    throw err
  }
}
