import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import {
  listCounterparties,
  createCounterparty,
} from '../src/main/services/counterparty-service'
let db: Database.Database
let cpyId: number

const VALID_COMPANY = {
  name: 'Test AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2025-01-15',
  fiscal_year_start: '2025-01-01',
  fiscal_year_end: '2025-12-31',
}

beforeEach(() => {
  db = createTestDb()
  const cmp = createCompany(db, {
    name: 'Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 2_500_000,
    registration_date: '2025-01-15',
    fiscal_year_start: '2025-01-01',
    fiscal_year_end: '2025-12-31',
  })
  if (!cmp.success) throw new Error('seedCompany failed: ' + cmp.error)
  cpyId = cmp.data.id
  createCompany(db, VALID_COMPANY)
})

afterEach(() => {
  if (db) db.close()
})

// ── Counterparty search (Mönster 2: JS-wrapping) ───────────────────

describe('F8 — LIKE escaping: counterparty-service', () => {
  it('search with % matches literally, not as wildcard', () => {
    createCounterparty(db, {
      company_id: cpyId,
      name: '50% Rabatt AB',
      type: 'customer',
    })
    createCounterparty(db, {
      company_id: cpyId,
      name: 'Helt Annat AB',
      type: 'customer',
    })

    const result = listCounterparties(db, { company_id: cpyId, search: '50%' })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('50% Rabatt AB')
  })

  it('search with _ matches literally, not as single-char wildcard', () => {
    createCounterparty(db, {
      company_id: cpyId,
      name: 'foo_bar AB',
      type: 'customer',
    })
    createCounterparty(db, {
      company_id: cpyId,
      name: 'fooXbar AB',
      type: 'customer',
    })

    const result = listCounterparties(db, {
      company_id: cpyId,
      search: 'foo_bar',
    })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('foo_bar AB')
  })

  it('search with ! escape char works', () => {
    createCounterparty(db, {
      company_id: cpyId,
      name: 'Bang! Corp',
      type: 'customer',
    })
    createCounterparty(db, {
      company_id: cpyId,
      name: 'Bang Corp',
      type: 'customer',
    })

    const result = listCounterparties(db, {
      company_id: cpyId,
      search: 'Bang!',
    })
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Bang! Corp')
  })
})

// ── Direct SQL verification (Mönster 1: SQL-concat) ────────────────
// invoice-service and expense-service use SQL-concat with ||.
// Verify the pattern works at SQL level.

describe('F8 — LIKE escaping: SQL-level verification', () => {
  it('ESCAPE ! makes % literal in SQL-concat pattern', () => {
    db.prepare(
      "INSERT INTO counterparties (company_id, name, type) VALUES (1, ?, 'customer')",
    ).run('100% Match')
    db.prepare(
      "INSERT INTO counterparties (company_id, name, type) VALUES (1, ?, 'customer')",
    ).run('Normal')

    const rows = db
      .prepare(
        "SELECT name FROM counterparties WHERE name LIKE '%' || ? || '%' ESCAPE '!'",
      )
      .all('100!%') as { name: string }[]

    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('100% Match')
  })
})
