import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../helpers/create-test-db'

/**
 * M95 — Fiscal year overlap protection via SQLite-triggers.
 *
 * `trg_fiscal_year_no_overlap_insert` + `trg_fiscal_year_no_overlap_update`
 * enforcar att två FY för samma bolag inte får överlappa i datum.
 */

function seedCompany(db: ReturnType<typeof createTestDb>, orgNr: string) {
  db.exec(`
    INSERT INTO companies (id, org_number, name, fiscal_rule, share_capital, registration_date)
    VALUES (1, '${orgNr}', 'Test AB', 'K2', 2500000, '2025-01-15');
  `)
}

describe('M95 — FY overlap-triggers', () => {
  it('triggrarna finns i schemat', () => {
    const db = createTestDb()
    for (const name of [
      'trg_fiscal_year_no_overlap_insert',
      'trg_fiscal_year_no_overlap_update',
    ]) {
      const trg = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='trigger' AND name = ?`,
        )
        .get(name)
      expect(trg, `${name} saknas`).toBeDefined()
    }
  })

  it('INSERT av överlappande FY för samma bolag blockeras', () => {
    const db = createTestDb()
    seedCompany(db, '556036-0793')
    db.exec(
      `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
       VALUES (1, '2026', '2026-01-01', '2026-12-31')`,
    )
    expect(() => {
      db.exec(
        `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
         VALUES (1, '2026b', '2026-06-01', '2027-05-31')`,
      )
    }).toThrow(/över.*lapp|overlap/i)
  })

  it('INSERT av angränsande men INTE överlappande FY är OK', () => {
    const db = createTestDb()
    seedCompany(db, '556036-0793')
    db.exec(
      `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
       VALUES (1, '2026', '2026-01-01', '2026-12-31')`,
    )
    // Nästa år startar 2027-01-01 — ingen overlap
    expect(() => {
      db.exec(
        `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
         VALUES (1, '2027', '2027-01-01', '2027-12-31')`,
      )
    }).not.toThrow()
  })

  it('överlapp OK för OLIKA bolag', () => {
    const db = createTestDb()
    seedCompany(db, '556036-0793')
    db.exec(`
      INSERT INTO companies (id, org_number, name, fiscal_rule, share_capital, registration_date)
      VALUES (2, '559123-4560', 'Andra AB', 'K2', 2500000, '2025-01-15');
    `)
    db.exec(
      `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
       VALUES (1, '2026', '2026-01-01', '2026-12-31')`,
    )
    expect(() => {
      db.exec(
        `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
         VALUES (2, '2026', '2026-01-01', '2026-12-31')`,
      )
    }).not.toThrow()
  })
})
