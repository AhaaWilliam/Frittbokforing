import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../../src/main/migrations'

let db: Database.Database

afterEach(() => {
  if (db) db.close()
})

/** Run migrations from..upTo (1-indexed, inclusive) with FK-off handling */
function runMigrations(
  testDb: Database.Database,
  upTo: number,
  from = 1,
): void {
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
        throw new Error(
          `Migration ${i + 1} FK check failed: ${JSON.stringify(fkCheck)}`,
        )
      }
    }
  }
}

describe('Migration 024 upgrade smoke test', () => {
  it('creates trigger and blocks finalize with NULL account_number', () => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    // Step 1: Run migrations 1–23
    runMigrations(db, 23)
    expect(db.pragma('user_version', { simple: true })).toBe(23)

    // Step 2: Seed data
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

    // Seed counterparty (accounts and vat_codes already seeded by migrations)
    db.exec(`
      INSERT INTO counterparties (id, name, type) VALUES (1, 'Kund Test', 'customer');
    `)

    // Seed a draft invoice with 2 lines: one with account, one without
    db.exec(`
      INSERT INTO invoices (id, counterparty_id, fiscal_year_id, invoice_type, invoice_number,
        invoice_date, due_date, status, total_amount_ore, vat_amount_ore, net_amount_ore, paid_amount_ore)
        VALUES (1, 1, 1, 'customer_invoice', '', '2025-01-15', '2025-02-14', 'draft', 12500, 2500, 10000, 0);
      INSERT INTO invoice_lines (id, invoice_id, description, quantity, unit_price_ore,
        line_total_ore, vat_amount_ore, vat_code_id, sort_order, account_number)
        VALUES (1, 1, 'Rad med konto', 1, 5000, 5000, 1250, 1, 0, '3001');
      INSERT INTO invoice_lines (id, invoice_id, description, quantity, unit_price_ore,
        line_total_ore, vat_amount_ore, vat_code_id, sort_order, account_number)
        VALUES (2, 1, 'Rad utan konto', 1, 5000, 5000, 1250, 1, 1, NULL);
    `)

    // Step 3: Run migration 024
    runMigrations(db, 24, 24)
    expect(db.pragma('user_version', { simple: true })).toBe(24)

    // Step 4: Verify data intact
    const lines = db
      .prepare('SELECT * FROM invoice_lines WHERE invoice_id = 1')
      .all() as Array<{ account_number: string | null }>
    expect(lines).toHaveLength(2)
    expect(lines[0].account_number).toBe('3001')
    expect(lines[1].account_number).toBeNull()

    // Step 5: Attempt finalize (draft → unpaid) — should fail
    expect(() => {
      db.prepare("UPDATE invoices SET status = 'unpaid' WHERE id = 1").run()
    }).toThrow('kontonummer')

    // Step 6: Fix the line, retry — should succeed
    db.prepare(
      "UPDATE invoice_lines SET account_number = '3001' WHERE id = 2",
    ).run()
    expect(() => {
      db.prepare("UPDATE invoices SET status = 'unpaid' WHERE id = 1").run()
    }).not.toThrow()

    const updated = db
      .prepare('SELECT status FROM invoices WHERE id = 1')
      .get() as { status: string }
    expect(updated.status).toBe('unpaid')
  })

  it('trigger count is 12 after migration 024', () => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    runMigrations(db, 24)

    const triggerCount = db
      .prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='trigger'")
      .get() as { cnt: number }
    expect(triggerCount.cnt).toBe(12)

    const trigger = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_invoice_lines_account_number_on_finalize'",
      )
      .get()
    expect(trigger).toBeTruthy()
  })
})
