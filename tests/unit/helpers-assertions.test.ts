/**
 * Sprint 13b — HELPER1 & HELPER2
 *
 * Meta-tests: verify that the shared assertion helpers from Sprint 13
 * actually detect the conditions they claim to detect.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import {
  type SystemTestContext,
  createTemplateDb,
  destroyTemplateDb,
  createSystemTestContext,
  destroyContext,
} from '../system/helpers/system-test-context'
import {
  assertJournalEntryBalanced,
  assertContiguousVerNumbers,
} from '../system/helpers/assertions'

let ctx: SystemTestContext

beforeAll(() => createTemplateDb())
afterAll(() => destroyTemplateDb())
beforeEach(() => { ctx = createSystemTestContext() })
afterEach(() => destroyContext(ctx))

// ── HELPER1: assertJournalEntryBalanced ────────────────────────────

describe('assertJournalEntryBalanced — meta-test', () => {
  it('kastar för obalanserad verifikation', () => {
    const entry = ctx.db.prepare(
      `INSERT INTO journal_entries (
        company_id, fiscal_year_id, verification_number, verification_series,
        journal_date, description, status, source_type
      ) VALUES (
        (SELECT id FROM companies LIMIT 1),
        (SELECT id FROM fiscal_years LIMIT 1),
        9900, 'A', '2026-06-15', 'Obalanserad test', 'draft', 'manual'
      )`,
    ).run()
    const jeId = Number(entry.lastInsertRowid)

    // Raw INSERT — unbalanced on purpose: debit 10000, credit 5000
    ctx.db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
       VALUES (?, 1, '1930', 10000, 0, 'debet')`,
    ).run(jeId)
    ctx.db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
       VALUES (?, 2, '1510', 0, 5000, 'kredit')`,
    ).run(jeId)

    expect(() => assertJournalEntryBalanced(ctx.db, jeId)).toThrow()
  })

  it('passerar för balanserad verifikation', () => {
    const entry = ctx.db.prepare(
      `INSERT INTO journal_entries (
        company_id, fiscal_year_id, verification_number, verification_series,
        journal_date, description, status, source_type
      ) VALUES (
        (SELECT id FROM companies LIMIT 1),
        (SELECT id FROM fiscal_years LIMIT 1),
        9901, 'A', '2026-06-15', 'Balanserad test', 'draft', 'manual'
      )`,
    ).run()
    const jeId = Number(entry.lastInsertRowid)

    ctx.db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
       VALUES (?, 1, '1930', 10000, 0, 'debet')`,
    ).run(jeId)
    ctx.db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
       VALUES (?, 2, '1510', 0, 10000, 'kredit')`,
    ).run(jeId)

    // Should not throw
    assertJournalEntryBalanced(ctx.db, jeId)
  })

  it('kastar för verifikation utan rader (null-check)', () => {
    // Sprint 14 S48: Fixed — assertJournalEntryBalanced now rejects entries without lines.
    // SUM() returns null for empty result, null-check catches this.
    const entry = ctx.db.prepare(
      `INSERT INTO journal_entries (
        company_id, fiscal_year_id, verification_number, verification_series,
        journal_date, description, status, source_type
      ) VALUES (
        (SELECT id FROM companies LIMIT 1),
        (SELECT id FROM fiscal_years LIMIT 1),
        9902, 'A', '2026-06-15', 'Tom test', 'draft', 'manual'
      )`,
    ).run()
    const jeId = Number(entry.lastInsertRowid)

    expect(() => assertJournalEntryBalanced(ctx.db, jeId)).toThrow()
  })
})

// ── HELPER2: assertContiguousVerNumbers ────────────────────────────

describe('assertContiguousVerNumbers — meta-test', () => {
  it('passerar för kontiguös serie (1, 2, 3)', () => {
    const fyId = (ctx.db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }).id

    // Insert 3 draft journal entries with consecutive ver numbers in Z-series
    for (let i = 1; i <= 3; i++) {
      ctx.db.prepare(
        `INSERT INTO journal_entries (
          company_id, fiscal_year_id, verification_number, verification_series,
          journal_date, description, status, source_type
        ) VALUES (
          (SELECT id FROM companies LIMIT 1), ?, ?, 'E',
          '2026-06-15', 'Kontiguös test', 'draft', 'manual'
        )`,
      ).run(fyId, i)
    }

    const nums = assertContiguousVerNumbers(ctx.db, fyId, 'E')
    expect(nums).toEqual([1, 2, 3])
  })

  it('kastar för icke-kontiguös serie (1, 3)', () => {
    const fyId = (ctx.db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }).id

    // Insert gap: 1 and 3, skip 2
    ctx.db.prepare(
      `INSERT INTO journal_entries (
        company_id, fiscal_year_id, verification_number, verification_series,
        journal_date, description, status, source_type
      ) VALUES (
        (SELECT id FROM companies LIMIT 1), ?, 1, 'I',
        '2026-06-15', 'Gap test', 'draft', 'manual'
      )`,
    ).run(fyId)
    ctx.db.prepare(
      `INSERT INTO journal_entries (
        company_id, fiscal_year_id, verification_number, verification_series,
        journal_date, description, status, source_type
      ) VALUES (
        (SELECT id FROM companies LIMIT 1), ?, 3, 'I',
        '2026-06-15', 'Gap test', 'draft', 'manual'
      )`,
    ).run(fyId)

    expect(() => assertContiguousVerNumbers(ctx.db, fyId, 'I')).toThrow()
  })

  it('returnerar tom array för serie utan verifikationer', () => {
    const fyId = (ctx.db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }).id

    // X-series has no entries
    const nums = assertContiguousVerNumbers(ctx.db, fyId, 'X')
    expect(nums).toEqual([])
  })
})
