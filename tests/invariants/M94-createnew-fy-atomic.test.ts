import { describe, it, expect } from 'vitest'
import { createTestDb } from '../helpers/create-test-db'
import { createCompany } from '../../src/main/services/company-service'
import { createNewFiscalYear } from '../../src/main/services/fiscal-service'

/**
 * M94 — createNewFiscalYear stänger föregående FY atomärt.
 *
 * Skäl: better-sqlite3 tolererar inte nested transactions, så
 * createNewFiscalYear inlineerar close-logiken som sista steg i sin egna
 * transaktion. Antingen sker alla 3 steg (IB + ny FY + gamla stängs) eller
 * inget (rollback).
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
  const company = db
    .prepare('SELECT id FROM companies LIMIT 1')
    .get() as { id: number }
  const fy = db
    .prepare('SELECT id FROM fiscal_years LIMIT 1')
    .get() as { id: number }
  return { db, companyId: company.id, prevFyId: fy.id }
}

describe('M94 — createNewFiscalYear atomicitet', () => {
  it('success-path: gamla stängs + ny skapas + IB skapas', () => {
    const { db, companyId, prevFyId } = seed()
    const result = createNewFiscalYear(db, companyId, prevFyId)

    // Gamla FY stängt
    const prev = db
      .prepare('SELECT is_closed FROM fiscal_years WHERE id = ?')
      .get(prevFyId) as { is_closed: number }
    expect(prev.is_closed).toBe(1)

    // Ny FY skapad, öppen
    expect(result.fiscalYear.id).not.toBe(prevFyId)
    expect(result.fiscalYear.is_closed).toBe(0)

    // IB-verifikat skapat
    expect(result.openingBalance.id).toBeGreaterThan(0)
    const ib = db
      .prepare(
        `SELECT source_type, fiscal_year_id FROM journal_entries WHERE id = ?`,
      )
      .get(result.openingBalance.id) as {
      source_type: string
      fiscal_year_id: number
    }
    expect(ib.source_type).toBe('opening_balance')
    expect(ib.fiscal_year_id).toBe(result.fiscalYear.id)
  })

  it('rollback vid fel: gamla FY förblir öppet om något inom tx kastar', () => {
    const { db, companyId, prevFyId } = seed()
    // Simulera fel genom att skicka dålig bookResult (stale data)
    // (Egentlig rollback-provokation via confirmBookResult + fel netResultOre)
    expect(() =>
      createNewFiscalYear(db, companyId, prevFyId, {
        confirmBookResult: true,
        netResultOre: 99_999_999, // fel värde → STALE_DATA
      }),
    ).toThrow()

    // Gamla FY ska fortfarande vara öppet
    const prev = db
      .prepare('SELECT is_closed FROM fiscal_years WHERE id = ?')
      .get(prevFyId) as { is_closed: number }
    expect(prev.is_closed).toBe(0)

    // Ingen ny FY ska existera
    const fyCount = db
      .prepare('SELECT COUNT(*) AS c FROM fiscal_years')
      .get() as { c: number }
    expect(fyCount.c).toBe(1)
  })

  it('dubbel-kör förhindras: andra createNewFiscalYear på samma prev → fel', () => {
    const { db, companyId, prevFyId } = seed()
    createNewFiscalYear(db, companyId, prevFyId)
    expect(() => createNewFiscalYear(db, companyId, prevFyId)).toThrow()
  })
})
