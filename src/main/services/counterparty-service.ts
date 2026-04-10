import type Database from 'better-sqlite3'
import type { Counterparty, IpcResult } from '../../shared/types'
import {
  CreateCounterpartyInputSchema,
  UpdateCounterpartyInputSchema,
} from '../ipc-schemas'
import log from 'electron-log'

// Map DB row (payment_terms_days) to Counterparty type (default_payment_terms)
function mapRow(row: Record<string, unknown>): Counterparty {
  return {
    ...row,
    default_payment_terms:
      (row.payment_terms_days as number) ??
      (row.default_payment_terms as number) ??
      30,
  } as Counterparty
}

export function listCounterparties(
  db: Database.Database,
  input: { search?: string; type?: string; active_only?: boolean },
): Counterparty[] {
  let sql = 'SELECT * FROM counterparties WHERE 1=1'
  const params: unknown[] = []

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
    sql += ' AND (name LIKE ? OR org_number LIKE ? OR vat_number LIKE ?)'
    const term = `%${input.search}%`
    params.push(term, term, term)
  }

  sql += ' ORDER BY name ASC'
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
  return rows.map(mapRow)
}

export function getCounterparty(
  db: Database.Database,
  id: number,
): Counterparty | null {
  const row = db
    .prepare('SELECT * FROM counterparties WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined
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
        `INSERT INTO counterparties (name, type, org_number, vat_number, address_line1, postal_code, city, country, contact_person, email, phone, payment_terms_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
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
      )
    const cp = getCounterparty(db, Number(result.lastInsertRowid))
    if (!cp)
      return {
        success: false,
        error: 'Kunde inte hämta skapad kund',
        code: 'TRANSACTION_ERROR',
      }
    return { success: true, data: cp }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okänt fel'
    if (message.includes('UNIQUE') && message.includes('org_number')) {
      return {
        success: false,
        error: 'En motpart med detta organisationsnummer finns redan.',
        code: 'DUPLICATE_ORG_NUMBER',
        field: 'org_number',
      }
    }
    log.error(message)
    return {
      success: false,
      error: 'Ett oväntat fel uppstod vid hantering av motparten.',
      code: 'TRANSACTION_ERROR',
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
  const { id, ...data } = parsed.data

  const existing = getCounterparty(db, id)
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
    'payment_terms_days',
  ])

  try {
    const sets: string[] = []
    const params: unknown[] = []

    const fieldMap: Record<string, string> = {
      default_payment_terms: 'payment_terms_days',
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

    const updated = getCounterparty(db, id)!
    return { success: true, data: updated }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okänt fel'
    log.error(message)
    return {
      success: false,
      error: 'Ett oväntat fel uppstod vid hantering av motparten.',
      code: 'TRANSACTION_ERROR',
    }
  }
}

export function deactivateCounterparty(
  db: Database.Database,
  id: number,
): IpcResult<Counterparty> {
  const existing = getCounterparty(db, id)
  if (!existing)
    return {
      success: false,
      error: 'Kunden hittades inte.',
      code: 'COUNTERPARTY_NOT_FOUND',
    }

  db.prepare(
    "UPDATE counterparties SET is_active = 0, updated_at = datetime('now','localtime') WHERE id = ?",
  ).run(id)

  const updated = getCounterparty(db, id)!
  return { success: true, data: updated }
}
