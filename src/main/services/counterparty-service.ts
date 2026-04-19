import type Database from 'better-sqlite3'
import { escapeLikePattern } from '../../shared/escape-like'
import type { Counterparty, IpcResult, ErrorCode } from '../../shared/types'
import {
  CreateCounterpartyInputSchema,
  UpdateCounterpartyInputSchema,
} from '../ipc-schemas'
import {
  mapUniqueConstraintError,
  COUNTERPARTY_UNIQUE_MAPPINGS,
} from './error-helpers'
import { rebuildSearchIndex } from './search-service'
import log from 'electron-log'

// Map DB row to Counterparty type (payment_terms → default_payment_terms)
function mapRow(row: Record<string, unknown>): Counterparty {
  return {
    ...row,
    default_payment_terms:
      (row.payment_terms as number) ??
      (row.default_payment_terms as number) ??
      30,
  } as Counterparty
}

export function listCounterparties(
  db: Database.Database,
  input: {
    company_id: number
    search?: string
    type?: string
    active_only?: boolean
  },
): Counterparty[] {
  let sql = 'SELECT * FROM counterparties WHERE company_id = ?'
  const params: unknown[] = [input.company_id]

  if (input.active_only !== false) {
    sql += ' AND is_active = 1'
  }
  if (input.type) {
    if (input.type === 'customer') {
      sql += " AND type IN ('customer', 'both')"
    } else if (input.type === 'supplier') {
      sql += " AND type IN ('supplier', 'both')"
    } else {
      sql += ' AND type = ?'
      params.push(input.type)
    }
  }
  if (input.search) {
    sql +=
      " AND (name LIKE ? ESCAPE '!' OR org_number LIKE ? ESCAPE '!' OR vat_number LIKE ? ESCAPE '!')"
    const term = `%${escapeLikePattern(input.search)}%`
    params.push(term, term, term)
  }

  sql += ' ORDER BY name ASC'
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  return rows.map(mapRow)
}

export function getCounterparty(
  db: Database.Database,
  id: number,
  companyId?: number,
): Counterparty | null {
  // companyId är optional för att stödja interna anrop som redan har
  // upstream-validering (t.ex. createCounterparty:s post-INSERT-läsning).
  // IPC-handlern skickar alltid companyId — defense-in-depth-guard.
  const sql =
    companyId !== undefined
      ? 'SELECT * FROM counterparties WHERE id = ? AND company_id = ?'
      : 'SELECT * FROM counterparties WHERE id = ?'
  const params = companyId !== undefined ? [id, companyId] : [id]
  const row = db.prepare(sql).get(...params) as
    | Record<string, unknown>
    | undefined
  return row ? mapRow(row) : null
}

export function createCounterparty(
  db: Database.Database,
  input: unknown,
): IpcResult<Counterparty> {
  const parsed = CreateCounterpartyInputSchema.safeParse(input)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join('; '),
      code: 'VALIDATION_ERROR',
      field: firstIssue?.path?.[0]?.toString(),
    }
  }
  const data = parsed.data

  try {
    const result = db
      .prepare(
        `INSERT INTO counterparties (company_id, name, type, org_number, vat_number, address_line1, postal_code, city, country, contact_person, email, phone, payment_terms, bankgiro, plusgiro, bank_account, bank_clearing)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.company_id,
        data.name,
        data.type,
        data.org_number ?? null,
        data.vat_number ?? null,
        data.address_line1 ?? null,
        data.postal_code ?? null,
        data.city ?? null,
        data.country,
        data.contact_person ?? null,
        data.email ?? null,
        data.phone ?? null,
        data.default_payment_terms,
        data.bankgiro ?? null,
        data.plusgiro ?? null,
        data.bank_account ?? null,
        data.bank_clearing ?? null,
      )
    const cp = getCounterparty(db, Number(result.lastInsertRowid))
    if (!cp)
      return {
        success: false,
        error: 'Kunde inte hämta skapad kund',
        code: 'UNEXPECTED_ERROR',
      }
    try {
      rebuildSearchIndex(db)
    } catch {
      /* log only */
    }
    return { success: true, data: cp }
  } catch (err: unknown) {
    const mapped = mapUniqueConstraintError(err, COUNTERPARTY_UNIQUE_MAPPINGS)
    if (mapped) return { success: false, ...mapped }
    if (err && typeof err === 'object' && 'code' in err) {
      const e = err as { code: ErrorCode; error: string; field?: string }
      return { success: false, error: e.error, code: e.code, field: e.field }
    }
    log.error('[counterparty-service] createCounterparty:', err)
    return {
      success: false,
      error: 'Ett oväntat fel uppstod vid hantering av motparten.',
      code: 'UNEXPECTED_ERROR',
    }
  }
}

export function updateCounterparty(
  db: Database.Database,
  input: unknown,
): IpcResult<Counterparty> {
  const parsed = UpdateCounterpartyInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join('; '),
      code: 'VALIDATION_ERROR',
    }
  }
  const { id, company_id: _company_id, ...data } = parsed.data

  // company_id är obligatorisk i schemat men används bara som scope-guard;
  // får inte UPDATE:as (immutability-trigger 046 fångar annars).
  const existing = getCounterparty(db, id, _company_id)
  if (!existing)
    return {
      success: false,
      error: 'Kunden hittades inte.',
      code: 'COUNTERPARTY_NOT_FOUND',
    }

  const ALLOWED_COUNTERPARTY_COLUMNS = new Set([
    'name',
    'type',
    'org_number',
    'vat_number',
    'email',
    'phone',
    'address_line1',
    'postal_code',
    'city',
    'country',
    'contact_person',
    'payment_terms',
    'bankgiro',
    'plusgiro',
    'bank_account',
    'bank_clearing',
  ])

  try {
    const sets: string[] = []
    const params: unknown[] = []

    const fieldMap: Record<string, string> = {
      default_payment_terms: 'payment_terms',
    }

    const entries = Object.entries(data).filter(([key]) => {
      const dbCol = fieldMap[key] ?? key
      return ALLOWED_COUNTERPARTY_COLUMNS.has(dbCol)
    })

    for (const [key, value] of entries) {
      if (value !== undefined) {
        const dbCol = fieldMap[key] ?? key
        sets.push(`"${dbCol}" = ?`)
        params.push(value ?? null)
      }
    }

    if (sets.length > 0) {
      sets.push("updated_at = datetime('now','localtime')")
      params.push(id)
      db.prepare(
        `UPDATE counterparties SET ${sets.join(', ')} WHERE id = ?`,
      ).run(...params)
    }

    const updated = getCounterparty(db, id, _company_id)!
    try {
      rebuildSearchIndex(db)
    } catch {
      /* log only */
    }
    return { success: true, data: updated }
  } catch (err: unknown) {
    const mapped = mapUniqueConstraintError(err, COUNTERPARTY_UNIQUE_MAPPINGS)
    if (mapped) return { success: false, ...mapped }
    if (err && typeof err === 'object' && 'code' in err) {
      const e = err as { code: ErrorCode; error: string; field?: string }
      return { success: false, error: e.error, code: e.code, field: e.field }
    }
    log.error('[counterparty-service] updateCounterparty:', err)
    return {
      success: false,
      error: 'Ett oväntat fel uppstod vid hantering av motparten.',
      code: 'UNEXPECTED_ERROR',
    }
  }
}

export function deactivateCounterparty(
  db: Database.Database,
  id: number,
  companyId: number,
): IpcResult<Counterparty> {
  const existing = getCounterparty(db, id, companyId)
  if (!existing)
    return {
      success: false,
      error: 'Kunden hittades inte.',
      code: 'COUNTERPARTY_NOT_FOUND',
    }

  db.prepare(
    "UPDATE counterparties SET is_active = 0, updated_at = datetime('now','localtime') WHERE id = ? AND company_id = ?",
  ).run(id, companyId)

  const updated = getCounterparty(db, id, companyId)!
  return { success: true, data: updated }
}
