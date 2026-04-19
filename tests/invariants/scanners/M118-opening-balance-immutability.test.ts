import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../helpers/create-test-db'

/**
 * M118 — Opening-balance-verifikat är undantagna från immutability-triggers
 * 1–5. Möjliggör reTransferOpeningBalance-flödet.
 *
 * Verifiera (via trigger-body-grep) att triggers för immutable booked entry
 * har `WHEN ... AND source_type != 'opening_balance'`-villkor.
 */

describe('M118 — opening_balance undantag i immutability-triggers', () => {
  const triggerNames = [
    'trg_immutable_booked_entry_update',
    'trg_immutable_booked_entry_delete',
    'trg_immutable_booked_line_update',
    'trg_immutable_booked_line_delete',
    'trg_immutable_booked_line_insert',
  ]

  it.each(triggerNames)('%s innehåller opening_balance-undantag', (name) => {
    const db = createTestDb()
    const trg = db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type='trigger' AND name = ?`,
      )
      .get(name) as { sql: string } | undefined
    expect(trg, `trigger ${name} saknas`).toBeDefined()
    expect(trg!.sql).toMatch(/opening_balance/)
  })

  it('balance-trigger (trigger 6) har INTE opening_balance-undantag (regel)', () => {
    const db = createTestDb()
    const trg = db
      .prepare(
        `SELECT sql FROM sqlite_master WHERE type='trigger' AND name = 'trg_check_balance_on_booking'`,
      )
      .get() as { sql: string } | undefined
    expect(trg).toBeDefined()
    // M118 är explicit: IB MÅSTE balansera även om immutability undantar
    expect(trg!.sql).not.toMatch(/opening_balance/)
  })
})
