import { describe, it, expect } from 'vitest'
import { createTestDb } from '../helpers/create-test-db'
import { checkChronology } from '../../src/main/services/chronology-guard'

/**
 * M142 — Kronologisk datumordning inom verifikationsserie.
 *
 * Verifikationer inom samma serie och FY måste ha icke-minskande datum.
 * Samma dag är tillåtet (strict less-than). Triggas via checkChronology
 * vid alla finalize/pay-callsites (A, B, C, E-serien). Bulk-operationer
 * kan skippa check:en på per-rad-nivå (M114).
 */

function seedScenario() {
  const db = createTestDb()
  db.exec(`
    INSERT INTO companies (id, org_number, name, fiscal_rule, share_capital, registration_date)
    VALUES (1, '556036-0793', 'Test AB', 'K2', 2500000, '2025-01-15');
    INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
    VALUES (1, 1, '2026', '2026-01-01', '2026-12-31');
  `)
  return { db, fyId: 1 }
}

function insertEntry(
  db: ReturnType<typeof createTestDb>,
  fyId: number,
  series: string,
  verNum: number,
  date: string,
): void {
  db.exec(
    `INSERT INTO journal_entries
     (fiscal_year_id, company_id, verification_series, verification_number,
      journal_date, description, status, source_type)
     VALUES (${fyId}, 1, '${series}', ${verNum}, '${date}', 'Test', 'draft', 'manual')`,
  )
}

describe('M142 — chronology-guard per verifikationsserie', () => {
  it('kronologiskt korrekt: second entry samma dag → OK', () => {
    const { db, fyId } = seedScenario()
    insertEntry(db, fyId, 'A', 1, '2026-02-01')
    expect(() => {
      db.transaction(() => checkChronology(db, fyId, 'A', '2026-02-01'))()
    }).not.toThrow()
  })

  it('kronologiskt korrekt: second entry senare dag → OK', () => {
    const { db, fyId } = seedScenario()
    insertEntry(db, fyId, 'A', 1, '2026-02-01')
    expect(() => {
      db.transaction(() => checkChronology(db, fyId, 'A', '2026-02-15'))()
    }).not.toThrow()
  })

  it('kronologi-brott: second entry tidigare dag → VALIDATION_ERROR', () => {
    const { db, fyId } = seedScenario()
    insertEntry(db, fyId, 'A', 1, '2026-02-15')
    let thrown: unknown
    try {
      db.transaction(() => checkChronology(db, fyId, 'A', '2026-02-01'))()
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeDefined()
    const err = thrown as { code?: string; field?: string }
    expect(err.code).toBe('VALIDATION_ERROR')
    expect(err.field).toBe('date')
  })

  it('serier isolerade: B-serien påverkas inte av A-seriens datum', () => {
    const { db, fyId } = seedScenario()
    insertEntry(db, fyId, 'A', 1, '2026-02-15') // A är framskjuten
    // B-serien är tom → alla datum OK
    expect(() => {
      db.transaction(() => checkChronology(db, fyId, 'B', '2026-02-01'))()
    }).not.toThrow()
  })

  it('FY:er isolerade: ny FY påverkas inte av gammal FY:s datum', () => {
    const { db } = seedScenario()
    db.exec(`
      INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
      VALUES (2, 1, '2027', '2027-01-01', '2027-12-31');
    `)
    insertEntry(db, 1, 'A', 1, '2026-12-31')
    // Nya FY:n ska inte kolla mot gamla
    expect(() => {
      db.transaction(() => checkChronology(db, 2, 'A', '2027-01-01'))()
    }).not.toThrow()
  })

  it('sänker verifikationsnummer med senare datum → OK (LIMIT 1 via ver_number)', () => {
    // Guard:en använder "senaste verifikationsnumret" (ORDER BY verification_number DESC).
    // Om vi har ver 5 på 2026-03-01 och ver 3 på 2026-02-15, är det "ver 5" som gäller.
    const { db, fyId } = seedScenario()
    insertEntry(db, fyId, 'A', 3, '2026-02-15')
    insertEntry(db, fyId, 'A', 5, '2026-03-01')
    // Nästa ska inte vara < 2026-03-01
    expect(() => {
      db.transaction(() => checkChronology(db, fyId, 'A', '2026-03-15'))()
    }).not.toThrow()
    // Men om vi försöker 2026-02-28 → fel
    expect(() => {
      db.transaction(() => checkChronology(db, fyId, 'A', '2026-02-28'))()
    }).toThrow()
  })

  it('guard kräver transaktion', () => {
    const { db, fyId } = seedScenario()
    expect(() => checkChronology(db, fyId, 'A', '2026-02-01')).toThrow(
      /transaction/,
    )
  })

  it('tom serie (inga entries) → alla datum OK', () => {
    const { db, fyId } = seedScenario()
    expect(() => {
      db.transaction(() => checkChronology(db, fyId, 'E', '2026-01-01'))()
    }).not.toThrow()
  })
})
