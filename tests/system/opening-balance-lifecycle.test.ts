// Dokumenterar opening_balance som write-once (med trigger-undantag).
// Om framtida IB-korrigeringsflöde behövs: trigger 6/7 behöver opening_balance-undantag
// (se Sprint 13b-fynd).

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest'
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
beforeEach(() => {
  ctx = createSystemTestContext()
})
afterEach(() => destroyContext(ctx))

describe('opening_balance write-once kontrakt', () => {
  it('Test 1: draft → booked lyckas med balanserade rader', () => {
    const entry = ctx.db
      .prepare(
        `INSERT INTO journal_entries (
        company_id, fiscal_year_id, verification_number, verification_series,
        journal_date, description, status, source_type
      ) VALUES (?, ?, 1, 'O', '2026-01-01', 'IB 2026', 'draft', 'opening_balance')`,
      )
      .run(ctx.seed.companyId, ctx.seed.fiscalYearId)
    const jeId = Number(entry.lastInsertRowid)

    ctx.db
      .prepare(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
       VALUES (?, 1, '1930', 100000, 0, 'Bank')`,
      )
      .run(jeId)
    ctx.db
      .prepare(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
       VALUES (?, 2, '2099', 0, 100000, 'Eget kapital')`,
      )
      .run(jeId)

    // Book — should succeed (trigger 6 passes, trigger 7 passes)
    expect(() => {
      ctx.db
        .prepare('UPDATE journal_entries SET status = ? WHERE id = ?')
        .run('booked', jeId)
    }).not.toThrow()

    const row = ctx.db
      .prepare('SELECT status FROM journal_entries WHERE id = ?')
      .get(jeId) as { status: string }
    expect(row.status).toBe('booked')
  })

  // Test 2: BORTTAGEN — trigger 1 (trg_immutable_booked_entry_update) har explicit
  // opening_balance-undantag (WHEN OLD.source_type != 'opening_balance'), så UPDATE
  // tillbaka till 'draft' TILLÅTS för opening_balance-entries. Detta är by design för
  // att möjliggöra reTransferOpeningBalance-flödet. Trigger 1 testar vi istället via
  // kontrasttest med vanlig booked entry nedan.

  it('Kontrasttest: vanlig booked entry kan INTE gå tillbaka till draft (trigger 1)', () => {
    const entry = ctx.db
      .prepare(
        `INSERT INTO journal_entries (
        company_id, fiscal_year_id, verification_number, verification_series,
        journal_date, description, status, source_type
      ) VALUES (?, ?, 9800, 'C', '2026-06-15', 'Manuell', 'draft', 'manual')`,
      )
      .run(ctx.seed.companyId, ctx.seed.fiscalYearId)
    const jeId = Number(entry.lastInsertRowid)

    ctx.db
      .prepare(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
       VALUES (?, 1, '6110', 5000, 0, 'Kontorsmaterial')`,
      )
      .run(jeId)
    ctx.db
      .prepare(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
       VALUES (?, 2, '1930', 0, 5000, 'Bank')`,
      )
      .run(jeId)

    // Book first
    ctx.db
      .prepare('UPDATE journal_entries SET status = ? WHERE id = ?')
      .run('booked', jeId)

    // Try to go back to draft → trigger 1 fires
    expect(() => {
      ctx.db
        .prepare('UPDATE journal_entries SET status = ? WHERE id = ?')
        .run('draft', jeId)
    }).toThrow('Bokförd verifikation kan bara markeras som rättad (corrected).')
  })

  it('Test 3a: trigger 6 kastar vid bokning med obalanserade rader', () => {
    const entry = ctx.db
      .prepare(
        `INSERT INTO journal_entries (
        company_id, fiscal_year_id, verification_number, verification_series,
        journal_date, description, status, source_type
      ) VALUES (?, ?, 2, 'O', '2026-01-01', 'IB obalanserad', 'draft', 'opening_balance')`,
      )
      .run(ctx.seed.companyId, ctx.seed.fiscalYearId)
    const jeId = Number(entry.lastInsertRowid)

    // Deliberately unbalanced: debit 100000, credit 50000
    ctx.db
      .prepare(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
       VALUES (?, 1, '1930', 100000, 0, 'Bank')`,
      )
      .run(jeId)
    ctx.db
      .prepare(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
       VALUES (?, 2, '2099', 0, 50000, 'Eget kapital')`,
      )
      .run(jeId)

    // Try to book → trigger 6 (trg_check_balance_on_booking) fires
    expect(() => {
      ctx.db
        .prepare('UPDATE journal_entries SET status = ? WHERE id = ?')
        .run('booked', jeId)
    }).toThrow(
      'Verifikationen balanserar inte. Summa debet måste vara lika med summa kredit.',
    )
  })

  it('Test 3b: trigger 7 kastar vid bokning i stängt räkenskapsår', () => {
    // Create a draft opening_balance entry first (while FY is still open)
    const entry = ctx.db
      .prepare(
        `INSERT INTO journal_entries (
        company_id, fiscal_year_id, verification_number, verification_series,
        journal_date, description, status, source_type
      ) VALUES (?, ?, 3, 'O', '2026-01-01', 'IB stängt FY', 'draft', 'opening_balance')`,
      )
      .run(ctx.seed.companyId, ctx.seed.fiscalYearId)
    const jeId = Number(entry.lastInsertRowid)

    // Add balanced lines
    ctx.db
      .prepare(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
       VALUES (?, 1, '1930', 100000, 0, 'Bank')`,
      )
      .run(jeId)
    ctx.db
      .prepare(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
       VALUES (?, 2, '2099', 0, 100000, 'Eget kapital')`,
      )
      .run(jeId)

    // Close the fiscal year
    ctx.db
      .prepare('UPDATE fiscal_years SET is_closed = 1 WHERE id = ?')
      .run(ctx.seed.fiscalYearId)

    // Try to book → trigger 7 (trg_check_period_on_booking) fires
    expect(() => {
      ctx.db
        .prepare('UPDATE journal_entries SET status = ? WHERE id = ?')
        .run('booked', jeId)
    }).toThrow('Kan inte bokföra i stängt räkenskapsår.')
  })
})
