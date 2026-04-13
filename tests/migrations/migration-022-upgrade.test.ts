/**
 * Migration 022 upgrade smoke test
 *
 * Migration 022 renames 5 amount columns to add _ore suffix (M119):
 *   - invoice_payments.amount       → amount_ore     (table-recreate, has CHECK)
 *   - expense_payments.amount       → amount_ore     (table-recreate, has CHECK)
 *   - invoices.paid_amount          → paid_amount_ore (table-recreate, has CHECK)
 *   - expenses.paid_amount          → paid_amount_ore (ALTER RENAME)
 *   - opening_balances.balance      → balance_ore    (ALTER RENAME)
 *
 * Table-recreate on invoice_payments and expense_payments requires PRAGMA
 * foreign_keys = OFF outside the transaction (M122) because both tables have
 * inbound FK from payment_batches (nullable) and outbound FK to invoices/expenses,
 * journal_entries, and accounts.
 *
 * Invoices table-recreate preserves trg_prevent_invoice_delete (M121 lesson
 * from S42).
 *
 * Post-migration schema (Steg 0 verified):
 *   invoice_payments.amount_ore  CHECK (amount_ore > 0)
 *   expense_payments.amount_ore  CHECK (amount_ore > 0)
 */

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
    if (migrations[i].programmatic) migrations[i].programmatic!(testDb)
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

describe('Migration 022 upgrade smoke test', () => {
  it('preserves data and renames columns to _ore suffix', () => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    // Step 1: Run migrations 1–21
    runMigrations(db, 21)
    expect(db.pragma('user_version', { simple: true })).toBe(21)

    // Step 2: Seed data with pre-022 column names (no _ore suffix)
    db.exec(`
      INSERT INTO companies (id, org_number, name, fiscal_rule) VALUES (1, '559000-1234', 'Test AB', 'K2');
      INSERT INTO users (id, name, email) VALUES (1, 'Testare', 'test@test.se');
      INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
        VALUES (1, 1, '2025', '2025-01-01', '2025-12-31');
      INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date)
        VALUES (1, 1, 1, '2025-01-01', '2025-01-31');
      INSERT INTO verification_sequences (fiscal_year_id, series, last_number)
        VALUES (1, 'A', 1), (1, 'B', 0);
    `)

    // Seed a customer counterparty + invoice
    db.exec(`
      INSERT INTO counterparties (id, name, type) VALUES (1, 'Kund AB', 'customer');
      INSERT INTO invoices (id, counterparty_id, invoice_type, invoice_number, invoice_date,
        due_date, net_amount_ore, vat_amount_ore, total_amount_ore, status, paid_amount, fiscal_year_id)
        VALUES (1, 1, 'customer_invoice', 'F-1', '2025-01-15', '2025-02-14',
          40000, 10000, 50000, 'paid', 50000, 1);
    `)

    // Seed journal entry for invoice payment (column is journal_date at mig 021)
    db.exec(`
      INSERT INTO journal_entries (id, company_id, fiscal_year_id, verification_series,
        verification_number, journal_date, description, source_type)
        VALUES (1, 1, 1, 'A', 1, '2025-01-20', 'Betalning F-1', 'auto_payment');
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
        VALUES (1, 1, '1930', 50000, 0), (1, 2, '1510', 0, 50000);
    `)

    // Seed invoice_payment with pre-022 column name 'amount'
    db.exec(`
      INSERT INTO invoice_payments (id, invoice_id, journal_entry_id, payment_date, amount, account_number)
        VALUES (1, 1, 1, '2025-01-20', 50000, '1930');
    `)

    // Seed supplier counterparty + expense
    db.exec(`
      INSERT INTO counterparties (id, name, type) VALUES (2, 'Leverantör AB', 'supplier');
      INSERT INTO expenses (id, fiscal_year_id, counterparty_id, expense_date, due_date,
        description, status, total_amount_ore, paid_amount)
        VALUES (1, 1, 2, '2025-01-10', '2025-02-10', 'Kontorsmaterial', 'paid', 75000, 75000);
    `)

    // Seed journal entry for expense payment (column is journal_date at mig 021)
    db.exec(`
      INSERT INTO journal_entries (id, company_id, fiscal_year_id, verification_series,
        verification_number, journal_date, description, source_type)
        VALUES (2, 1, 1, 'B', 1, '2025-01-25', 'Betalning kostnad', 'auto_payment');
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
        VALUES (2, 1, '2440', 75000, 0), (2, 2, '1930', 0, 75000);
    `)

    // Seed expense_payment with pre-022 column name 'amount'
    db.exec(`
      INSERT INTO expense_payments (id, expense_id, journal_entry_id, payment_date, amount, account_number)
        VALUES (1, 1, 2, '2025-01-25', 75000, '1930');
    `)

    // Seed opening_balance with pre-022 column name 'balance'
    db.exec(`
      INSERT INTO opening_balances (id, fiscal_year_id, account_number, balance)
        VALUES (1, 1, '1930', 25000);
    `)

    // Step 3: Run migration 022
    runMigrations(db, 22, 22)
    expect(db.pragma('user_version', { simple: true })).toBe(22)

    // Step 4: Verify all 5 values are intact under new column names
    const ip = db.prepare('SELECT amount_ore FROM invoice_payments WHERE id = 1').get() as { amount_ore: number }
    expect(ip.amount_ore).toBe(50000)

    const ep = db.prepare('SELECT amount_ore FROM expense_payments WHERE id = 1').get() as { amount_ore: number }
    expect(ep.amount_ore).toBe(75000)

    const inv = db.prepare('SELECT paid_amount_ore FROM invoices WHERE id = 1').get() as { paid_amount_ore: number }
    expect(inv.paid_amount_ore).toBe(50000)

    const exp = db.prepare('SELECT paid_amount_ore FROM expenses WHERE id = 1').get() as { paid_amount_ore: number }
    expect(exp.paid_amount_ore).toBe(75000)

    const ob = db.prepare('SELECT balance_ore FROM opening_balances WHERE id = 1').get() as { balance_ore: number }
    expect(ob.balance_ore).toBe(25000)

    // Step 5: Verify trg_prevent_invoice_delete survived table-recreate (M121)
    const trigger = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_prevent_invoice_delete'"
    ).get()
    expect(trigger).toBeDefined()

    // Step 6: FK integrity check passes (proves FK-off handling worked correctly)
    const fkCheck = db.pragma('foreign_key_check') as unknown[]
    expect(fkCheck).toHaveLength(0)

    // Step 7: Trigger count unchanged (11 pre-migration-024)
    const triggerCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='trigger'"
    ).get() as { cnt: number }
    expect(triggerCount.cnt).toBe(11)
  })

  it('rejects negative amount_ore on invoice_payments (CHECK constraint)', () => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    // Run all migrations through 022
    runMigrations(db, 22)

    // Seed minimal data for FK satisfaction (post-022 column names)
    db.exec(`
      INSERT INTO companies (id, org_number, name, fiscal_rule) VALUES (1, '559000-1234', 'Test AB', 'K2');
      INSERT INTO users (id, name, email) VALUES (1, 'Testare', 'test@test.se');
      INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
        VALUES (1, 1, '2025', '2025-01-01', '2025-12-31');
      INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date)
        VALUES (1, 1, 1, '2025-01-01', '2025-01-31');
      INSERT INTO verification_sequences (fiscal_year_id, series, last_number)
        VALUES (1, 'A', 1);
      INSERT INTO counterparties (id, name, type) VALUES (1, 'Kund AB', 'customer');
      INSERT INTO invoices (id, counterparty_id, invoice_type, invoice_number, invoice_date,
        due_date, net_amount_ore, vat_amount_ore, total_amount_ore, status, paid_amount_ore, fiscal_year_id)
        VALUES (1, 1, 'customer_invoice', 'F-1', '2025-01-15', '2025-02-14',
          10000, 2500, 12500, 'unpaid', 0, 1);
      INSERT INTO journal_entries (id, company_id, fiscal_year_id, verification_series,
        verification_number, journal_date, description, source_type)
        VALUES (1, 1, 1, 'A', 1, '2025-01-20', 'Test', 'auto_payment');
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
        VALUES (1, 1, '1930', 12500, 0), (1, 2, '1510', 0, 12500);
    `)

    // Negative amount_ore should fail on CHECK (amount_ore > 0)
    expect(() => {
      db.prepare(
        `INSERT INTO invoice_payments (invoice_id, journal_entry_id, payment_date, amount_ore, account_number)
         VALUES (1, 1, '2025-01-20', -1, '1930')`
      ).run()
    }).toThrow(/CHECK/)
  })
})
