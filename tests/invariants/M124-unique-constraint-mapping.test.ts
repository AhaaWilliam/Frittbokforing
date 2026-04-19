import { describe, it, expect } from 'vitest'
import { createTestDb } from '../helpers/create-test-db'
import { createCompany } from '../../src/main/services/company-service'
import { createCounterparty } from '../../src/main/services/counterparty-service'

/**
 * M124 — Dublettdetektion via SQLITE_CONSTRAINT_UNIQUE.
 *
 * `mapUniqueConstraintError` mappar SqliteError med code SQLITE_CONSTRAINT_UNIQUE
 * till specifika ErrorCode-värden per service. Substring-match gör den robust
 * mot compound-index-format.
 */

function ok<T>(
  r:
    | { success: true; data: T }
    | { success: false; error: string; code?: string },
): T {
  if (!r.success) throw new Error(`${r.code}: ${r.error}`)
  return r.data
}

function seed() {
  const db = createTestDb()
  ok(
    createCompany(db, {
      name: 'Test AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2',
      share_capital: 2_500_000,
      registration_date: '2025-01-15',
      fiscal_year_start: '2026-01-01',
      fiscal_year_end: '2026-12-31',
    }),
  )
  const companyId = (
    db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: number }
  ).id
  return { db, companyId }
}

describe('M124 — UNIQUE constraint → structured error', () => {
  it('dublett org_number på counterparty ger strukturerad {code, error, field}', () => {
    const { db, companyId } = seed()
    ok(
      createCounterparty(db, {
        company_id: companyId,
        name: 'Kund A',
        type: 'customer',
        org_number: '559123-4560',
      }),
    )
    // Andra gången samma org_number → konflikt
    const r = createCounterparty(db, {
      company_id: companyId,
      name: 'Kund A-dubbel',
      type: 'customer',
      org_number: '559123-4560',
    })
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBeDefined()
    expect(r.error).toContain('org')
    // Strukturerat svar har field-pekaren
    expect((r as { field?: string }).field).toBeDefined()
  })

  it('samma org_number i olika bolag → tillåtet (M158 compound-unique)', () => {
    const { db } = seed()
    // Skapa andra företag
    ok(
      createCompany(db, {
        name: 'Test 2 AB',
        org_number: '559123-4561',
        fiscal_rule: 'K2',
        share_capital: 2_500_000,
        registration_date: '2025-01-15',
        fiscal_year_start: '2026-01-01',
        fiscal_year_end: '2026-12-31',
      }),
    )
    const companies = db
      .prepare('SELECT id FROM companies ORDER BY id')
      .all() as Array<{ id: number }>
    ok(
      createCounterparty(db, {
        company_id: companies[0].id,
        name: 'Delad motpart',
        type: 'customer',
        org_number: '999999-9999',
      }),
    )
    // Samma org_number i annat bolag — ska gå
    const r = createCounterparty(db, {
      company_id: companies[1].id,
      name: 'Delad motpart',
      type: 'customer',
      org_number: '999999-9999',
    })
    expect(r.success).toBe(true)
  })
})
