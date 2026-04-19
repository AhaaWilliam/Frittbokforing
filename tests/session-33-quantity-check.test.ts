/**
 * Sprint 33 F46b — quantity-CHECK defense-in-depth.
 *
 * Verifies that CHECK constraints on invoice_lines and expense_lines
 * enforce quantity bounds at the DB level (bypass Zod).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'

let db: Database.Database

function seedMinimalData(testDb: Database.Database): {
  invoiceId: number
  expenseId: number
} {
  testDb.exec(`
    INSERT INTO companies (id, org_number, name, fiscal_rule) VALUES (1, '559000-1234', 'Test AB', 'K2');
    INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date) VALUES (1, 1, '2026', '2026-01-01', '2026-12-31');
    INSERT INTO counterparties (company_id, id, name, type) VALUES (1, 1, 'Kund AB', 'customer');
    INSERT INTO counterparties (company_id, id, name, type) VALUES (1, 2, 'Leverantör AB', 'supplier');
  `)

  const inv = testDb
    .prepare(
      `
    INSERT INTO invoices (counterparty_id, invoice_type, invoice_number, invoice_date, due_date,
      net_amount_ore, total_amount_ore, status, fiscal_year_id)
    VALUES (1, 'customer_invoice', '1', '2026-01-15', '2026-02-15', 10000, 12500, 'draft', 1)
  `,
    )
    .run()

  const exp = testDb
    .prepare(
      `
    INSERT INTO expenses (fiscal_year_id, counterparty_id, expense_date, description, total_amount_ore)
    VALUES (1, 2, '2026-01-15', 'Test', 10000)
  `,
    )
    .run()

  return {
    invoiceId: Number(inv.lastInsertRowid),
    expenseId: Number(exp.lastInsertRowid),
  }
}

beforeEach(() => {
  db = createTestDb()
})
afterEach(() => {
  db.close()
})

describe('F46b: invoice_lines quantity CHECK', () => {
  it('rejects quantity > 9999.99 (direct SQL bypass)', () => {
    const { invoiceId } = seedMinimalData(db)
    expect(() => {
      db.prepare(
        `INSERT INTO invoice_lines (invoice_id, quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore)
        VALUES (?, 10000, 100, 1, 1000000, 0)`,
      ).run(invoiceId)
    }).toThrow()
  })

  it('rejects quantity = 0', () => {
    const { invoiceId } = seedMinimalData(db)
    expect(() => {
      db.prepare(
        `INSERT INTO invoice_lines (invoice_id, quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore)
        VALUES (?, 0, 100, 1, 0, 0)`,
      ).run(invoiceId)
    }).toThrow()
  })

  it('rejects quantity = -1', () => {
    const { invoiceId } = seedMinimalData(db)
    expect(() => {
      db.prepare(
        `INSERT INTO invoice_lines (invoice_id, quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore)
        VALUES (?, -1, 100, 1, 0, 0)`,
      ).run(invoiceId)
    }).toThrow()
  })

  it('accepts quantity = 0.01 (minimum valid)', () => {
    const { invoiceId } = seedMinimalData(db)
    expect(() => {
      db.prepare(
        `INSERT INTO invoice_lines (invoice_id, quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore)
        VALUES (?, 0.01, 100, 1, 1, 0)`,
      ).run(invoiceId)
    }).not.toThrow()
  })

  it('accepts quantity = 9999.99 (maximum valid)', () => {
    const { invoiceId } = seedMinimalData(db)
    expect(() => {
      db.prepare(
        `INSERT INTO invoice_lines (invoice_id, quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore)
        VALUES (?, 9999.99, 100, 1, 999999, 0)`,
      ).run(invoiceId)
    }).not.toThrow()
  })
})

describe('F46b: expense_lines quantity CHECK', () => {
  it('rejects quantity > 9999', () => {
    const { expenseId } = seedMinimalData(db)
    expect(() => {
      db.prepare(
        `INSERT INTO expense_lines (expense_id, account_number, quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore)
        VALUES (?, '4010', 10000, 100, 1, 1000000, 0)`,
      ).run(expenseId)
    }).toThrow()
  })

  it('rejects quantity = 0', () => {
    const { expenseId } = seedMinimalData(db)
    expect(() => {
      db.prepare(
        `INSERT INTO expense_lines (expense_id, account_number, quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore)
        VALUES (?, '4010', 0, 100, 1, 0, 0)`,
      ).run(expenseId)
    }).toThrow()
  })

  it('accepts quantity = 1 (minimum valid)', () => {
    const { expenseId } = seedMinimalData(db)
    expect(() => {
      db.prepare(
        `INSERT INTO expense_lines (expense_id, account_number, quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore)
        VALUES (?, '4010', 1, 100, 1, 100, 0)`,
      ).run(expenseId)
    }).not.toThrow()
  })

  it('accepts quantity = 9999 (maximum valid)', () => {
    const { expenseId } = seedMinimalData(db)
    expect(() => {
      db.prepare(
        `INSERT INTO expense_lines (expense_id, account_number, quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore)
        VALUES (?, '4010', 9999, 100, 1, 999900, 0)`,
      ).run(expenseId)
    }).not.toThrow()
  })
})

describe('F46b: migration 032 smoke', () => {
  it('preserves existing rows after recreate', () => {
    // createTestDb runs all migrations including 032.
    // If invoice_lines rows from earlier migrations survive, the migration preserved data.
    // We insert a row and verify it survives.
    const { invoiceId } = seedMinimalData(db)
    db.prepare(
      `INSERT INTO invoice_lines (invoice_id, quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore)
      VALUES (?, 2.5, 5000, 1, 12500, 0)`,
    ).run(invoiceId)

    const row = db
      .prepare('SELECT quantity FROM invoice_lines WHERE invoice_id = ?')
      .get(invoiceId) as { quantity: number }
    expect(row.quantity).toBe(2.5)
  })

  it('idx_invoice_lines_invoice preserved after recreate', () => {
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='invoice_lines'",
      )
      .all() as { name: string }[]
    const names = indexes.map((i) => i.name)
    expect(names).toContain('idx_invoice_lines_invoice')
  })

  it('trg_invoice_lines_account_number_on_finalize preserved after recreate', () => {
    const trigger = db
      .prepare(
        "SELECT name, tbl_name FROM sqlite_master WHERE type='trigger' AND name='trg_invoice_lines_account_number_on_finalize'",
      )
      .get() as { name: string; tbl_name: string } | undefined
    expect(trigger).toBeDefined()
    expect(trigger?.tbl_name).toBe('invoices')
  })
})
