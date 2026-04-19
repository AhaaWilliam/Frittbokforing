import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../helpers/create-test-db'

/**
 * M120 — company_id-denormalisering är intentionell på journal_entries
 * och accounting_periods (query-performance). Scanner verifierar att
 * kolumnerna finns och NOT NULL.
 */

describe('M120 — company_id kvarstår på journal_entries + accounting_periods', () => {
  it('journal_entries har NOT NULL company_id', () => {
    const db = createTestDb()
    const cols = db.pragma('table_info(journal_entries)') as Array<{
      name: string
      notnull: number
    }>
    const col = cols.find((c) => c.name === 'company_id')
    expect(col).toBeDefined()
    expect(col?.notnull).toBe(1)
  })

  it('accounting_periods har NOT NULL company_id', () => {
    const db = createTestDb()
    const cols = db.pragma('table_info(accounting_periods)') as Array<{
      name: string
      notnull: number
    }>
    const col = cols.find((c) => c.name === 'company_id')
    expect(col).toBeDefined()
    expect(col?.notnull).toBe(1)
  })

  it('idx_ap_dates använder company_id (performance-intent)', () => {
    const db = createTestDb()
    const idx = db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_ap_dates'`,
      )
      .get() as { sql: string } | undefined
    expect(idx).toBeDefined()
    expect(idx?.sql).toContain('company_id')
  })
})
