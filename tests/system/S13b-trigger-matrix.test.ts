/**
 * Sprint 13b — Fas 5: TRIGGER-MATRIX
 *
 * Semantisk matris för de 5 triggers (av 7) som har opening_balance-undantag.
 * Trigger 6 (trg_check_balance_on_booking) och 7 (trg_check_period_on_booking)
 * har INGA undantag — medvetet designval, dokumenterat som fynd för Sprint 14-övervägande.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import {
  type SystemTestContext,
  createTemplateDb,
  destroyTemplateDb,
  createSystemTestContext,
  destroyContext,
} from './helpers/system-test-context'

let ctx: SystemTestContext

beforeAll(() => createTemplateDb())
afterAll(() => destroyTemplateDb())
beforeEach(() => { ctx = createSystemTestContext() })
afterEach(() => destroyContext(ctx))

/**
 * Create a booked opening_balance journal entry with balanced lines.
 * Returns the journal_entry_id.
 */
function createBookedOpeningBalance(): number {
  const fy = ctx.db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  const entry = ctx.db.prepare(
    `INSERT INTO journal_entries (
      company_id, fiscal_year_id, verification_number, verification_series,
      journal_date, description, status, source_type
    ) VALUES (
      (SELECT id FROM companies LIMIT 1), ?, 9800, 'O',
      '2026-01-01', 'IB test', 'draft', 'opening_balance'
    )`,
  ).run(fy.id)
  const jeId = Number(entry.lastInsertRowid)

  ctx.db.prepare(
    `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
     VALUES (?, 1, '1930', 50000, 0, 'IB kassa')`,
  ).run(jeId)
  ctx.db.prepare(
    `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
     VALUES (?, 2, '2081', 0, 50000, 'IB eget kapital')`,
  ).run(jeId)

  // Book it
  ctx.db.prepare("UPDATE journal_entries SET status = 'booked' WHERE id = ?").run(jeId)
  return jeId
}

/**
 * Create a booked manual journal entry (non-opening_balance).
 */
function createBookedManualEntry(): number {
  const fy = ctx.db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  const entry = ctx.db.prepare(
    `INSERT INTO journal_entries (
      company_id, fiscal_year_id, verification_number, verification_series,
      journal_date, description, status, source_type
    ) VALUES (
      (SELECT id FROM companies LIMIT 1), ?, 9801, 'A',
      '2026-03-15', 'Manual test', 'draft', 'manual'
    )`,
  ).run(fy.id)
  const jeId = Number(entry.lastInsertRowid)

  ctx.db.prepare(
    `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
     VALUES (?, 1, '1930', 30000, 0, 'Manual debet')`,
  ).run(jeId)
  ctx.db.prepare(
    `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
     VALUES (?, 2, '2081', 0, 30000, 'Manual kredit')`,
  ).run(jeId)

  ctx.db.prepare("UPDATE journal_entries SET status = 'booked' WHERE id = ?").run(jeId)
  return jeId
}

// ── Trigger 1: trg_immutable_booked_entry_update ──────────────────

describe('trg_immutable_booked_entry_update', () => {
  it('tillåter UPDATE på booked opening_balance entry', () => {
    const jeId = createBookedOpeningBalance()
    // Can update description on opening_balance
    expect(() => {
      ctx.db.prepare("UPDATE journal_entries SET description = 'IB uppdaterad' WHERE id = ?").run(jeId)
    }).not.toThrow()
  })

  it('blockerar UPDATE på booked manual entry', () => {
    const jeId = createBookedManualEntry()
    expect(() => {
      ctx.db.prepare("UPDATE journal_entries SET description = 'Ändrad' WHERE id = ?").run(jeId)
    }).toThrow(/Bokförd verifikation kan inte ändras/)
  })
})

// ── Trigger 2: trg_immutable_booked_entry_delete ──────────────────

describe('trg_immutable_booked_entry_delete', () => {
  it('tillåter DELETE på booked opening_balance entry', () => {
    const jeId = createBookedOpeningBalance()
    // Must delete lines first (FK constraint)
    ctx.db.prepare('DELETE FROM journal_entry_lines WHERE journal_entry_id = ?').run(jeId)
    expect(() => {
      ctx.db.prepare('DELETE FROM journal_entries WHERE id = ?').run(jeId)
    }).not.toThrow()
  })

  it('blockerar DELETE på booked manual entry', () => {
    const jeId = createBookedManualEntry()
    expect(() => {
      ctx.db.prepare('DELETE FROM journal_entries WHERE id = ?').run(jeId)
    }).toThrow(/Bokförd verifikation kan inte raderas/)
  })
})

// ── Trigger 3: trg_immutable_booked_line_update ───────────────────

describe('trg_immutable_booked_line_update', () => {
  it('tillåter line UPDATE på booked opening_balance', () => {
    const jeId = createBookedOpeningBalance()
    expect(() => {
      ctx.db.prepare(
        "UPDATE journal_entry_lines SET description = 'Uppdaterad IB' WHERE journal_entry_id = ? AND line_number = 1",
      ).run(jeId)
    }).not.toThrow()
  })

  it('blockerar line UPDATE på booked manual entry', () => {
    const jeId = createBookedManualEntry()
    expect(() => {
      ctx.db.prepare(
        "UPDATE journal_entry_lines SET description = 'Ändrad' WHERE journal_entry_id = ? AND line_number = 1",
      ).run(jeId)
    }).toThrow(/Rader på bokförd verifikation kan inte ändras/)
  })
})

// ── Trigger 4: trg_immutable_booked_line_delete ───────────────────

describe('trg_immutable_booked_line_delete', () => {
  it('tillåter line DELETE på booked opening_balance', () => {
    const jeId = createBookedOpeningBalance()
    expect(() => {
      ctx.db.prepare(
        'DELETE FROM journal_entry_lines WHERE journal_entry_id = ? AND line_number = 2',
      ).run(jeId)
    }).not.toThrow()
  })

  it('blockerar line DELETE på booked manual entry', () => {
    const jeId = createBookedManualEntry()
    expect(() => {
      ctx.db.prepare(
        'DELETE FROM journal_entry_lines WHERE journal_entry_id = ? AND line_number = 2',
      ).run(jeId)
    }).toThrow(/Rader på bokförd verifikation kan inte raderas/)
  })
})

// ── Trigger 5: trg_immutable_booked_line_insert ───────────────────

describe('trg_immutable_booked_line_insert', () => {
  it('tillåter line INSERT på booked opening_balance', () => {
    const jeId = createBookedOpeningBalance()
    expect(() => {
      ctx.db.prepare(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
         VALUES (?, 3, '1510', 1000, 0, 'Extra IB rad')`,
      ).run(jeId)
    }).not.toThrow()
  })

  it('blockerar line INSERT på booked manual entry', () => {
    const jeId = createBookedManualEntry()
    expect(() => {
      ctx.db.prepare(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
         VALUES (?, 3, '1510', 1000, 0, 'Extra rad')`,
      ).run(jeId)
    }).toThrow(/Kan inte lägga till rader på bokförd verifikation/)
  })
})
