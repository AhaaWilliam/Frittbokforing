/**
 * Sprint 16 — Preview-service tests (ADR 006).
 *
 * Verifierar:
 * - Balanserat verifikat → balanced=true, inga warnings
 * - Obalanserat → balanced=false + warning som beskriver diffen
 * - Okänt kontonummer → warning men preview returneras
 * - Default entry_date sätts om input saknar
 * - Inga DB-mutations sker (read-only invariant)
 * - Expense-source returnerar VALIDATION_ERROR (inte implementerat ännu)
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import {
  previewJournalLines,
  type PreviewJournalLinesInput,
} from '../src/main/services/preview-service'

describe('previewJournalLines (manual)', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    // BAS-kontoplan seedas av migrations; ingen extra fixture-insert behövs.
    // Tester använder befintliga konton (1930, 6230) och hämtar namnen
    // dynamiskt från DB för att undvika att assertera mot specifika
    // BAS-rubrik-strängar.
  })

  function getAccountName(num: string): string {
    const row = db
      .prepare('SELECT name FROM accounts WHERE account_number = ?')
      .get(num) as { name: string } | undefined
    if (!row) throw new Error(`Test fixture: account ${num} not seeded`)
    return row.name
  }

  function makeInput(
    overrides?: Partial<
      Extract<PreviewJournalLinesInput, { source: 'manual' }>
    >,
  ): PreviewJournalLinesInput {
    return {
      source: 'manual',
      fiscal_year_id: 1,
      entry_date: '2026-04-29',
      description: 'Test',
      lines: [
        { account_number: '1930', debit_ore: 100000, credit_ore: 0 },
        { account_number: '6230', debit_ore: 0, credit_ore: 100000 },
      ],
      ...overrides,
    }
  }

  it('balanced verifikat → balanced=true, no warnings', () => {
    const result = previewJournalLines(db, makeInput())
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.balanced).toBe(true)
    expect(result.data.warnings).toEqual([])
    expect(result.data.total_debit_ore).toBe(100000)
    expect(result.data.total_credit_ore).toBe(100000)
  })

  it('decorates lines with account_name from accounts table', () => {
    const result = previewJournalLines(db, makeInput())
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.lines[0].account_name).toBe(getAccountName('1930'))
    expect(result.data.lines[1].account_name).toBe(getAccountName('6230'))
  })

  it('unbalanced verifikat → balanced=false + warning', () => {
    const result = previewJournalLines(
      db,
      makeInput({
        lines: [
          { account_number: '1930', debit_ore: 100000, credit_ore: 0 },
          { account_number: '6230', debit_ore: 0, credit_ore: 50000 },
        ],
      }),
    )
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.balanced).toBe(false)
    expect(result.data.warnings.length).toBeGreaterThan(0)
    expect(result.data.warnings[0]).toMatch(/balanserar inte/)
  })

  it('zero amounts → warning "Inga belopp"', () => {
    const result = previewJournalLines(
      db,
      makeInput({
        lines: [
          { account_number: '1930', debit_ore: 0, credit_ore: 0 },
          { account_number: '6230', debit_ore: 0, credit_ore: 0 },
        ],
      }),
    )
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.warnings.some((w) => w.includes('Inga belopp'))).toBe(
      true,
    )
  })

  it('unknown account_number → warning but preview returned', () => {
    const result = previewJournalLines(
      db,
      makeInput({
        lines: [
          { account_number: '9999', debit_ore: 100000, credit_ore: 0 },
          { account_number: '6230', debit_ore: 0, credit_ore: 100000 },
        ],
      }),
    )
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.warnings.some((w) => w.includes('9999'))).toBe(true)
    expect(result.data.lines[0].account_name).toBeNull()
  })

  it('both debit and credit > 0 on same line → warning', () => {
    const result = previewJournalLines(
      db,
      makeInput({
        lines: [
          { account_number: '1930', debit_ore: 50000, credit_ore: 50000 },
          { account_number: '6230', debit_ore: 0, credit_ore: 0 },
        ],
      }),
    )
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(
      result.data.warnings.some((w) => w.includes('både debet och kredit')),
    ).toBe(true)
  })

  it('default entry_date when input missing', () => {
    const result = previewJournalLines(db, makeInput({ entry_date: undefined }))
    expect(result.success).toBe(true)
    if (!result.success) return
    // Today's date in YYYY-MM-DD format
    expect(result.data.entry_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('user-provided entry_date is preserved', () => {
    const result = previewJournalLines(
      db,
      makeInput({ entry_date: '2025-06-15' }),
    )
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.entry_date).toBe('2025-06-15')
  })

  it('does NOT write to DB (read-only invariant)', () => {
    const beforeJournal = db
      .prepare('SELECT COUNT(*) as c FROM journal_entries')
      .get() as { c: number }
    const beforeManual = db
      .prepare('SELECT COUNT(*) as c FROM manual_entries')
      .get() as { c: number }

    previewJournalLines(db, makeInput())

    const afterJournal = db
      .prepare('SELECT COUNT(*) as c FROM journal_entries')
      .get() as { c: number }
    const afterManual = db
      .prepare('SELECT COUNT(*) as c FROM manual_entries')
      .get() as { c: number }

    expect(afterJournal.c).toBe(beforeJournal.c)
    expect(afterManual.c).toBe(beforeManual.c)
  })

  it('preserves line order in output', () => {
    const result = previewJournalLines(db, makeInput())
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.lines[0].account_number).toBe('1930')
    expect(result.data.lines[1].account_number).toBe('6230')
  })
})
