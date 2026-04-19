import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../helpers/create-test-db'
import { createCompany } from '../../../src/main/services/company-service'

/**
 * Journal balance trigger-säkerhet (scanner).
 *
 * Kärn-invariant: trigger `trg_check_balance_on_booking` blockerar UPDATE
 * SET booked_at = ... om SUM(debit_ore) ≠ SUM(credit_ore) för entryn.
 * Detta är grunden som skyddar M118 + M137 + M142 + M151 på DB-nivå.
 *
 * Scanner använder direkt-SQL för att isolera trigger-beteendet utan
 * att behöva gå igenom service-lagrets validering.
 */

function ok<T>(
  r:
    | { success: true; data: T }
    | { success: false; error: string; code?: string },
): T {
  if (!r.success) throw new Error(r.code + ': ' + r.error)
  return r.data
}

function seedCompany(db: ReturnType<typeof createTestDb>, orgNr: string) {
  ok(
    createCompany(db, {
      name: 'Test AB',
      org_number: orgNr,
      fiscal_rule: 'K2',
      share_capital: 2_500_000,
      registration_date: '2025-01-15',
      fiscal_year_start: '2026-01-01',
      fiscal_year_end: '2026-12-31',
    }),
  )
  return db
    .prepare('SELECT id, company_id FROM fiscal_years LIMIT 1')
    .get() as { id: number; company_id: number }
}

function insertDraftEntry(
  db: ReturnType<typeof createTestDb>,
  fyId: number,
  companyId: number,
  lines: Array<{ account: string; debit: number; credit: number }>,
): number {
  db.prepare(
    `INSERT INTO journal_entries
     (fiscal_year_id, company_id, verification_series, verification_number,
      journal_date, description, status, source_type)
     VALUES (?, ?, 'C', ?, '2026-02-01', 'Test', 'draft', 'manual')`,
  ).run(fyId, companyId, Math.floor(Math.random() * 10_000) + 1000)
  const id = (db.prepare('SELECT last_insert_rowid() AS id').get() as {
    id: number
  }).id
  const insertLine = db.prepare(
    `INSERT INTO journal_entry_lines (journal_entry_id, account_number, debit_ore, credit_ore, line_number)
     VALUES (?, ?, ?, ?, ?)`,
  )
  lines.forEach((l, i) =>
    insertLine.run(id, l.account, l.debit, l.credit, i + 1),
  )
  return id
}

describe('Scanner: balance-trigger blockerar obalans vid bokföring', () => {
  it('balanserat entry får bokföras', () => {
    const db = createTestDb()
    const fy = seedCompany(db, '556036-0793')
    const jeId = insertDraftEntry(db, fy.id, fy.company_id, [
      { account: '1930', debit: 10000, credit: 0 },
      { account: '2440', debit: 0, credit: 10000 },
    ])
    expect(() => {
      db.prepare(
        `UPDATE journal_entries SET status = 'booked' WHERE id = ?`,
      ).run(jeId)
    }).not.toThrow()
  })

  it('obalanserat (10000 vs 5000) blockeras', () => {
    const db = createTestDb()
    const fy = seedCompany(db, '556036-0793')
    const jeId = insertDraftEntry(db, fy.id, fy.company_id, [
      { account: '1930', debit: 10000, credit: 0 },
      { account: '2440', debit: 0, credit: 5000 },
    ])
    expect(() => {
      db.prepare(
        `UPDATE journal_entries SET status = 'booked' WHERE id = ?`,
      ).run(jeId)
    }).toThrow()
  })

  it('obalanserat (alla debit) blockeras', () => {
    const db = createTestDb()
    const fy = seedCompany(db, '556036-0793')
    const jeId = insertDraftEntry(db, fy.id, fy.company_id, [
      { account: '1930', debit: 5000, credit: 0 },
      { account: '2440', debit: 5000, credit: 0 },
    ])
    expect(() => {
      db.prepare(
        `UPDATE journal_entries SET status = 'booked' WHERE id = ?`,
      ).run(jeId)
    }).toThrow()
  })

  it('multi-line balanserat (3+ rader) får bokföras', () => {
    const db = createTestDb()
    const fy = seedCompany(db, '556036-0793')
    const jeId = insertDraftEntry(db, fy.id, fy.company_id, [
      { account: '1930', debit: 10000, credit: 0 },
      { account: '6110', debit: 3000, credit: 0 },
      { account: '2440', debit: 0, credit: 13000 },
    ])
    expect(() => {
      db.prepare(
        `UPDATE journal_entries SET status = 'booked' WHERE id = ?`,
      ).run(jeId)
    }).not.toThrow()
  })
})
