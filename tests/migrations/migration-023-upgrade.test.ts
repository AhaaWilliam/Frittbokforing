import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../../src/main/migrations'

let db: Database.Database

afterEach(() => {
  if (db) db.close()
})

/** Run migrations from..upTo (1-indexed, inclusive) with FK-off handling */
function runMigrations(testDb: Database.Database, upTo: number, from = 1): void {
  for (let i = from - 1; i < upTo; i++) {
    // M122: migrations that use table-recreate on tables with inbound FK
    const needsFkOff = i === 20 || i === 21 || i === 22
    if (needsFkOff) testDb.pragma('foreign_keys = OFF')

    testDb.exec('BEGIN EXCLUSIVE')
    testDb.exec(migrations[i].sql)
    migrations[i].programmatic?.(testDb)
    testDb.pragma(`user_version = ${i + 1}`)
    testDb.exec('COMMIT')

    if (needsFkOff) {
      testDb.pragma('foreign_keys = ON')
      const fkCheck = testDb.pragma('foreign_key_check') as unknown[]
      if (fkCheck.length > 0) {
        throw new Error(`Migration ${i + 1} FK check failed: ${JSON.stringify(fkCheck)}`)
      }
    }
  }
}

describe('Migration 023 upgrade smoke test', () => {
  it('preserves data integrity and adds FK constraints', () => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    // Step 1: Run migrations 1–22 (up to migration 022)
    runMigrations(db, 22)
    expect(db.pragma('user_version', { simple: true })).toBe(22)

    // Step 2: Seed data — company, fiscal year, accounts, manual entries, payment batches
    db.exec(`
      INSERT INTO companies (id, org_number, name, fiscal_rule) VALUES (1, '559000-1234', 'Test AB', 'K2');
      INSERT INTO users (id, name, email) VALUES (1, 'Testare', 'test@test.se');
      INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
        VALUES (1, 1, '2025', '2025-01-01', '2025-12-31');
      INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date)
        VALUES (1, 1, 1, '2025-01-01', '2025-01-31');
      INSERT INTO verification_sequences (fiscal_year_id, series, last_number)
        VALUES (1, 'A', 0);
    `)

    // Seed manual entries with lines using known account numbers from seed data
    db.exec(`
      INSERT INTO manual_entries (id, fiscal_year_id, description, status)
        VALUES (1, 1, 'Test manual entry 1', 'draft');
      INSERT INTO manual_entries (id, fiscal_year_id, description, status)
        VALUES (2, 1, 'Test manual entry 2', 'draft');
      INSERT INTO manual_entries (id, fiscal_year_id, description, status)
        VALUES (3, 1, 'Test manual entry 3', 'draft');

      INSERT INTO manual_entry_lines (id, manual_entry_id, line_number, account_number, debit_ore, credit_ore)
        VALUES (1, 1, 1, '1930', 10000, 0);
      INSERT INTO manual_entry_lines (id, manual_entry_id, line_number, account_number, debit_ore, credit_ore)
        VALUES (2, 1, 2, '3001', 0, 10000);
      INSERT INTO manual_entry_lines (id, manual_entry_id, line_number, account_number, debit_ore, credit_ore)
        VALUES (3, 2, 1, '2440', 5000, 0);
      INSERT INTO manual_entry_lines (id, manual_entry_id, line_number, account_number, debit_ore, credit_ore)
        VALUES (4, 2, 2, '1930', 0, 5000);
      INSERT INTO manual_entry_lines (id, manual_entry_id, line_number, account_number, debit_ore, credit_ore)
        VALUES (5, 3, 1, '6570', 200, 0);
      INSERT INTO manual_entry_lines (id, manual_entry_id, line_number, account_number, debit_ore, credit_ore)
        VALUES (6, 3, 2, '1930', 0, 200);
    `)

    // Seed payment batches with known account numbers
    db.exec(`
      INSERT INTO payment_batches (id, fiscal_year_id, batch_type, payment_date, account_number, bank_fee_ore, status)
        VALUES (1, 1, 'invoice', '2025-01-15', '1930', 0, 'completed');
      INSERT INTO payment_batches (id, fiscal_year_id, batch_type, payment_date, account_number, bank_fee_ore, status)
        VALUES (2, 1, 'expense', '2025-01-20', '1930', 5000, 'partial');
    `)

    // Step 3: Run migration 023 only
    runMigrations(db, 23, 23)
    expect(db.pragma('user_version', { simple: true })).toBe(23)

    // Step 4: Verify all 6 manual_entry_lines are intact
    const melCount = db.prepare('SELECT COUNT(*) as cnt FROM manual_entry_lines').get() as { cnt: number }
    expect(melCount.cnt).toBe(6)

    // Verify specific values
    const mel1 = db.prepare('SELECT * FROM manual_entry_lines WHERE id = 1').get() as Record<string, unknown>
    expect(mel1.account_number).toBe('1930')
    expect(mel1.debit_ore).toBe(10000)
    expect(mel1.credit_ore).toBe(0)
    expect(mel1.manual_entry_id).toBe(1)

    const mel5 = db.prepare('SELECT * FROM manual_entry_lines WHERE id = 5').get() as Record<string, unknown>
    expect(mel5.account_number).toBe('6570')
    expect(mel5.debit_ore).toBe(200)

    // Step 5: Verify all 2 payment_batches are intact
    const pbCount = db.prepare('SELECT COUNT(*) as cnt FROM payment_batches').get() as { cnt: number }
    expect(pbCount.cnt).toBe(2)

    const pb1 = db.prepare('SELECT * FROM payment_batches WHERE id = 1').get() as Record<string, unknown>
    expect(pb1.account_number).toBe('1930')
    expect(pb1.batch_type).toBe('invoice')
    expect(pb1.bank_fee_ore).toBe(0)

    const pb2 = db.prepare('SELECT * FROM payment_batches WHERE id = 2').get() as Record<string, unknown>
    expect(pb2.account_number).toBe('1930')
    expect(pb2.status).toBe('partial')
    expect(pb2.bank_fee_ore).toBe(5000)

    // Step 6: Verify FK actively blocks insert with non-existent account_number
    expect(() => {
      db.prepare(
        "INSERT INTO manual_entry_lines (manual_entry_id, line_number, account_number, debit_ore, credit_ore) VALUES (1, 99, '9999', 100, 0)"
      ).run()
    }).toThrow(/FOREIGN KEY constraint failed/)

    expect(() => {
      db.prepare(
        "INSERT INTO payment_batches (fiscal_year_id, batch_type, payment_date, account_number) VALUES (1, 'invoice', '2025-01-25', '9999')"
      ).run()
    }).toThrow(/FOREIGN KEY constraint failed/)

    // Step 7: Verify schema has REFERENCES
    const melSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='manual_entry_lines'").get() as { sql: string }
    expect(melSql.sql).toContain('REFERENCES accounts(account_number)')

    const pbSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='payment_batches'").get() as { sql: string }
    expect(pbSql.sql).toContain('REFERENCES accounts(account_number)')

    // Step 8: Verify index recreated
    const pbIdx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_pb_fiscal_year'").get()
    expect(pbIdx).toBeTruthy()

    // Step 9: Verify trigger count unchanged (11)
    const triggerCount = db.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='trigger'").get() as { cnt: number }
    expect(triggerCount.cnt).toBe(11)

    // Step 10: FK integrity check passes
    const fkCheck = db.pragma('foreign_key_check') as unknown[]
    expect(fkCheck).toHaveLength(0)
  })
})
