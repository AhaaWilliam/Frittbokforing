/**
 * Session 45: Accruals (Periodiseringar) — service-level tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import {
  createAccrualSchedule,
  getAccrualSchedules,
  executeAccrualForPeriod,
  executeAllForPeriod,
  deactivateSchedule,
} from '../src/main/services/accrual-service'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  for (let i = 0; i < migrations.length; i++) {
    const m = migrations[i]
    db.exec('BEGIN EXCLUSIVE')
    if (m.sql) db.exec(m.sql)
    if (m.programmatic) m.programmatic(db)
    db.pragma(`user_version = ${i + 1}`)
    db.exec('COMMIT')
  }
  return db
}

let db: Database.Database
let fyId: number

beforeAll(() => {
  db = createTestDb()
  createCompany(db, {
    name: 'Accrual Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 50000_00,
    registration_date: '2025-01-15',
    fiscal_year_start: '2025-01-01',
    fiscal_year_end: '2025-12-31',
  })
  fyId = (
    db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  ).id
})

afterAll(() => {
  if (db) db.close()
})

describe('S45: Accrual service', () => {
  // ═══ createAccrualSchedule ═══

  it('A1: creates schedule with valid input', () => {
    const result = createAccrualSchedule(db, {
      fiscal_year_id: fyId,
      description: 'Förutbetald hyra',
      accrual_type: 'prepaid_expense',
      balance_account: '1710',
      result_account: '5010',
      total_amount_ore: 120000_00,
      period_count: 6,
      start_period: 1,
    })
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.id).toBeGreaterThan(0)
  })

  it('A2: rejects balance_account not class 1-2', () => {
    const result = createAccrualSchedule(db, {
      fiscal_year_id: fyId,
      description: 'Bad balance account',
      accrual_type: 'prepaid_expense',
      balance_account: '3001',
      result_account: '5010',
      total_amount_ore: 10000_00,
      period_count: 2,
      start_period: 1,
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected failure')
    expect(result.code).toBe('VALIDATION_ERROR')
    expect(result.field).toBe('balance_account')
  })

  it('A3: rejects result_account not class 3-8', () => {
    const result = createAccrualSchedule(db, {
      fiscal_year_id: fyId,
      description: 'Bad result account',
      accrual_type: 'prepaid_expense',
      balance_account: '1710',
      result_account: '1930',
      total_amount_ore: 10000_00,
      period_count: 2,
      start_period: 1,
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected failure')
    expect(result.code).toBe('VALIDATION_ERROR')
    expect(result.field).toBe('result_account')
  })

  it('A4: rejects period overflow (start + count > 13)', () => {
    // Sprint I: gräns höjd till 13 perioder för förlängt första FY.
    // Testfall: 10 + 5 - 1 = 14 → utanför gränsen.
    const result = createAccrualSchedule(db, {
      fiscal_year_id: fyId,
      description: 'Overflow',
      accrual_type: 'prepaid_expense',
      balance_account: '1710',
      result_account: '5010',
      total_amount_ore: 10000_00,
      period_count: 5,
      start_period: 10,
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected failure')
    expect(result.code).toBe('VALIDATION_ERROR')
  })

  // ═══ executeAccrualForPeriod ═══

  it('A5: creates balanced journal entry', () => {
    const result = executeAccrualForPeriod(db, 1, 1)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)

    // Verify balance
    const lines = db
      .prepare(
        'SELECT SUM(debit_ore) as d, SUM(credit_ore) as c FROM journal_entry_lines WHERE journal_entry_id = ?',
      )
      .get(result.data.journalEntryId) as { d: number; c: number }
    expect(lines.d).toBe(lines.c)
    expect(lines.d).toBeGreaterThan(0)
  })

  it('A6: uneven division — last period takes remainder', () => {
    // Create schedule: 100_00 / 3 periods (P7-P9)
    const create = createAccrualSchedule(db, {
      fiscal_year_id: fyId,
      description: 'Ojämn division',
      accrual_type: 'accrued_expense',
      balance_account: '2990',
      result_account: '5010',
      total_amount_ore: 100_00,
      period_count: 3,
      start_period: 7,
    })
    expect(create.success).toBe(true)
    if (!create.success) throw new Error(create.error)
    const schedId = create.data.id

    // Execute P7
    const r7 = executeAccrualForPeriod(db, schedId, 7)
    expect(r7.success).toBe(true)
    if (!r7.success) throw new Error(r7.error)
    const l7 = db
      .prepare(
        'SELECT debit_ore FROM journal_entry_lines WHERE journal_entry_id = ? AND debit_ore > 0',
      )
      .get(r7.data.journalEntryId) as { debit_ore: number }
    expect(l7.debit_ore).toBe(3333) // floor(10000/3) = 3333

    // Execute P8
    const r8 = executeAccrualForPeriod(db, schedId, 8)
    expect(r8.success).toBe(true)
    if (!r8.success) throw new Error(r8.error)

    // Execute P9 (last — takes remainder)
    const r9 = executeAccrualForPeriod(db, schedId, 9)
    expect(r9.success).toBe(true)
    if (!r9.success) throw new Error(r9.error)
    const l9 = db
      .prepare(
        'SELECT debit_ore FROM journal_entry_lines WHERE journal_entry_id = ? AND debit_ore > 0',
      )
      .get(r9.data.journalEntryId) as { debit_ore: number }
    expect(l9.debit_ore).toBe(3334) // 10000 - 3333*2 = 3334
  })

  it('A7: rejects period outside schedule range', () => {
    const result = executeAccrualForPeriod(db, 1, 12)
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected failure')
    expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('A8: rejects closed period', () => {
    // Close period 2
    db.prepare(
      'UPDATE accounting_periods SET is_closed = 1 WHERE fiscal_year_id = ? AND period_number = 2',
    ).run(fyId)

    const result = executeAccrualForPeriod(db, 1, 2)
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected failure')
    expect(result.code).toBe('VALIDATION_ERROR')

    // Reopen for subsequent tests
    db.prepare(
      'UPDATE accounting_periods SET is_closed = 0 WHERE fiscal_year_id = ? AND period_number = 2',
    ).run(fyId)
  })

  // ═══ D/K logic ═══

  it('A9: prepaid_expense debits balance, credits result', () => {
    // Schedule 1 is prepaid_expense with balance=1710, result=5010
    // Execution A5 already created P1 entry
    const schedules = getAccrualSchedules(db, fyId)
    expect(schedules.success).toBe(true)
    if (!schedules.success) throw new Error(schedules.error)
    const s1 = schedules.data.find((s) => s.id === 1)!
    const p1Entry = s1.periodStatuses.find((p) => p.periodNumber === 1)!
    expect(p1Entry.executed).toBe(true)

    const lines = db
      .prepare(
        'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
      )
      .all(p1Entry.journalEntryId!) as Array<{
      account_number: string
      debit_ore: number
      credit_ore: number
    }>

    expect(lines[0].account_number).toBe('1710') // balance = debit
    expect(lines[0].debit_ore).toBeGreaterThan(0)
    expect(lines[1].account_number).toBe('5010') // result = credit
    expect(lines[1].credit_ore).toBeGreaterThan(0)
  })

  it('A10: accrued_expense debits result, credits balance', () => {
    // Schedule 2 (ojämn division) is accrued_expense with balance=2990, result=5010
    const schedules = getAccrualSchedules(db, fyId)
    expect(schedules.success).toBe(true)
    if (!schedules.success) throw new Error(schedules.error)
    const s2 = schedules.data.find((s) => s.id === 2)!
    const p7Entry = s2.periodStatuses.find((p) => p.periodNumber === 7)!
    expect(p7Entry.executed).toBe(true)

    const lines = db
      .prepare(
        'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
      )
      .all(p7Entry.journalEntryId!) as Array<{
      account_number: string
      debit_ore: number
      credit_ore: number
    }>

    // accrued_expense: debit=result, credit=balance
    expect(lines[0].account_number).toBe('5010') // result = debit
    expect(lines[0].debit_ore).toBeGreaterThan(0)
    expect(lines[1].account_number).toBe('2990') // balance = credit
    expect(lines[1].credit_ore).toBeGreaterThan(0)
  })

  // ═══ executeAllForPeriod ═══

  it('A11: executes all applicable schedules for a period', () => {
    // Create another schedule covering P10-P11
    createAccrualSchedule(db, {
      fiscal_year_id: fyId,
      description: 'Third schedule',
      accrual_type: 'prepaid_income',
      balance_account: '1790',
      result_account: '3002',
      total_amount_ore: 20000_00,
      period_count: 2,
      start_period: 10,
    })

    // executeAll P10 — only schedule 3 covers P10
    const result = executeAllForPeriod(db, fyId, 10)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.executed).toBeGreaterThanOrEqual(1)
  })

  // ═══ deactivateSchedule ═══

  it('A12: deactivates schedule, entries preserved', () => {
    const result = deactivateSchedule(db, 1)
    expect(result.success).toBe(true)

    const schedules = getAccrualSchedules(db, fyId)
    expect(schedules.success).toBe(true)
    if (!schedules.success) throw new Error(schedules.error)
    const s1 = schedules.data.find((s) => s.id === 1)!
    expect(s1.is_active).toBe(0)
    expect(s1.executedCount).toBeGreaterThan(0) // entries preserved
  })

  it('A13: deactivate non-existent schedule returns NOT_FOUND', () => {
    const result = deactivateSchedule(db, 99999)
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected failure')
    expect(result.code).toBe('NOT_FOUND')
  })

  // ═══ getAccrualSchedules ═══

  it('A14: list returns correct period statuses', () => {
    const result = getAccrualSchedules(db, fyId)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.length).toBeGreaterThan(0)

    const s1 = result.data.find((s) => s.id === 1)!
    expect(s1.periodStatuses.length).toBe(6) // period_count = 6
    expect(s1.periodStatuses[0].executed).toBe(true) // P1 executed
  })

  // ═══ Migration ═══

  it('A15: accrual_schedules table has correct CHECK constraints', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO accrual_schedules (fiscal_year_id, description, accrual_type, balance_account, result_account, total_amount_ore, period_count, start_period)
         VALUES (?, 'test', 'invalid_type', '1710', '5010', 10000, 3, 1)`,
        )
        .run(fyId),
    ).toThrow()
  })

  it('A16: accrual_entries table has correct CHECK constraints', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO accrual_entries (accrual_schedule_id, journal_entry_id, period_number, amount_ore, entry_type)
         VALUES (1, 1, 1, -100, 'accrual')`,
        )
        .run(),
    ).toThrow() // amount_ore > 0 check
  })
})
