import { describe, it, expect } from 'vitest'
import { createTestDb } from '../helpers/create-test-db'
import { createCompany } from '../../src/main/services/company-service'
import {
  closePeriod,
  reopenPeriod,
  listFiscalPeriods,
} from '../../src/main/services/fiscal-service'

/**
 * M93 — closePeriod/reopenPeriod körs inom db.transaction().
 *
 * Defense-in-depth mot race conditions: alla SELECT+UPDATE i en period-
 * operation är atomära.
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
  const fyId = (
    db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  ).id
  return { db, fyId, periods: listFiscalPeriods(db, fyId) }
}

describe('M93 — period-atomicitet', () => {
  it('closePeriod är atomisk — commit eller rollback', () => {
    const { db, periods } = seed()
    const p1 = periods.find((p) => p.period_number === 1)!
    const r = ok(closePeriod(db, p1.id))
    expect(r.is_closed).toBe(1)
  })

  it('closePeriod blockeras om föregående period är öppen (ordering)', () => {
    const { db, periods } = seed()
    const p5 = periods.find((p) => p.period_number === 5)!
    // Inte stängt p1..p4 först → ska fela
    const r = closePeriod(db, p5.id)
    expect(r.success).toBe(false)
  })

  it('reopenPeriod är atomisk', () => {
    const { db, periods } = seed()
    const p1 = periods.find((p) => p.period_number === 1)!
    ok(closePeriod(db, p1.id))
    const r = ok(reopenPeriod(db, p1.id))
    expect(r.is_closed).toBe(0)
  })

  it('reopenPeriod blockeras om senare period är stängd', () => {
    const { db, periods } = seed()
    const p1 = periods.find((p) => p.period_number === 1)!
    const p2 = periods.find((p) => p.period_number === 2)!
    ok(closePeriod(db, p1.id))
    ok(closePeriod(db, p2.id))
    // Försök öppna p1 — p2 är fortfarande stängd → fel
    const r = reopenPeriod(db, p1.id)
    expect(r.success).toBe(false)
  })
})
