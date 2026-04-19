import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../helpers/create-test-db'

/**
 * M151 — E-serie för avskrivningar.
 *
 * `journal_entries.verification_series` CHECK enforcar whitelist
 * ('A','B','C','E','I','O'). D-serien reserverad för framtida behov.
 *
 * Scanner verifierar:
 * 1. CHECK-constraint existerar i schemat
 * 2. Whitelist innehåller exakt dessa serier
 * 3. INSERT med okänd serie blockeras
 */

describe('M151 — verification_series CHECK-enum', () => {
  it('schema innehåller CHECK whitelist', () => {
    const db = createTestDb()
    const schema = (
      db
        .prepare(
          `SELECT sql FROM sqlite_master WHERE type='table' AND name='journal_entries'`,
        )
        .get() as { sql: string }
    ).sql
    expect(schema).toMatch(/CHECK.*verification_series.*IN\s*\(/i)
    // Verifiera att alla förväntade serier är med
    for (const s of ['A', 'B', 'C', 'E', 'I', 'O']) {
      expect(schema).toMatch(new RegExp(`'${s}'`))
    }
  })

  it('INSERT med okänd serie (ex "Z") blockeras', () => {
    const db = createTestDb()
    db.exec(`
      INSERT INTO companies (id, org_number, name, fiscal_rule, share_capital, registration_date)
      VALUES (1, '556036-0793', 'Test AB', 'K2', 2500000, '2025-01-15');
      INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
      VALUES (1, 1, '2026', '2026-01-01', '2026-12-31');
    `)
    expect(() => {
      db.exec(`INSERT INTO journal_entries
        (fiscal_year_id, company_id, verification_series, verification_number,
         journal_date, description, status, source_type)
        VALUES (1, 1, 'Z', 1, '2026-02-01', 'Test', 'draft', 'manual')`)
    }).toThrow(/CHECK|check/i)
  })

  it('E-serie (avskrivningar) accepteras', () => {
    const db = createTestDb()
    db.exec(`
      INSERT INTO companies (id, org_number, name, fiscal_rule, share_capital, registration_date)
      VALUES (1, '556036-0793', 'Test AB', 'K2', 2500000, '2025-01-15');
      INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
      VALUES (1, 1, '2026', '2026-01-01', '2026-12-31');
    `)
    expect(() => {
      db.exec(`INSERT INTO journal_entries
        (fiscal_year_id, company_id, verification_series, verification_number,
         journal_date, description, status, source_type)
        VALUES (1, 1, 'E', 1, '2026-02-01', 'Avskrivning', 'draft', 'auto_depreciation')`)
    }).not.toThrow()
  })

  it('D-serie reserverad: INSERT blockeras idag (framtida utvidgning)', () => {
    const db = createTestDb()
    db.exec(`
      INSERT INTO companies (id, org_number, name, fiscal_rule, share_capital, registration_date)
      VALUES (1, '556036-0793', 'Test AB', 'K2', 2500000, '2025-01-15');
      INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
      VALUES (1, 1, '2026', '2026-01-01', '2026-12-31');
    `)
    expect(() => {
      db.exec(`INSERT INTO journal_entries
        (fiscal_year_id, company_id, verification_series, verification_number,
         journal_date, description, status, source_type)
        VALUES (1, 1, 'D', 1, '2026-02-01', 'Test', 'draft', 'manual')`)
    }).toThrow()
  })
})
