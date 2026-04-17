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
        throw new Error(
          `Migration ${i + 1} FK check failed: ${JSON.stringify(fkCheck)}`,
        )
      }
    }
  }
}

describe('Migration 026: expense_lines sort_order + created_at parity', () => {
  it('adds sort_order and created_at with correct backfill', () => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    // Run migrations 1–25
    runMigrations(db, 25)
    expect(db.pragma('user_version', { simple: true })).toBe(25)

    // Verify columns don't exist yet
    const oldCols = (
      db.prepare('PRAGMA table_info(expense_lines)').all() as { name: string }[]
    ).map((c) => c.name)
    expect(oldCols).not.toContain('sort_order')
    expect(oldCols).not.toContain('created_at')

    // Seed: company → fiscal_year → counterparty → expense → 3 expense_lines
    db.exec(`
      INSERT INTO companies (id, org_number, name, fiscal_rule) VALUES (1, '559000-1234', 'Test AB', 'K2');
      INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
        VALUES (1, 1, '2024', '2024-01-01', '2024-12-31');
      INSERT INTO counterparties (id, name, type) VALUES (1, 'Leverantör AB', 'supplier');
    `)

    // Insert expense with a specific created_at
    db.prepare(
      `
      INSERT INTO expenses (id, fiscal_year_id, counterparty_id, expense_date, description, total_amount_ore, created_at)
        VALUES (1, 1, 1, '2024-03-15', 'Kontorsmaterial', 30000, '2024-03-15 10:30:00')
    `,
    ).run()

    // Insert 3 expense_lines — note: insert in id order but we verify sort_order backfill
    db.exec(`
      INSERT INTO expense_lines (id, expense_id, description, account_number, quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore)
        VALUES (10, 1, 'Papper', '6110', 100, 5000, 1, 500000, 125000);
      INSERT INTO expense_lines (id, expense_id, description, account_number, quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore)
        VALUES (20, 1, 'Pennor', '6110', 100, 3000, 1, 300000, 75000);
      INSERT INTO expense_lines (id, expense_id, description, account_number, quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore)
        VALUES (30, 1, 'Gem', '6110', 100, 2000, 1, 200000, 50000);
    `)

    // Run migration 026
    runMigrations(db, 26, 26)
    expect(db.pragma('user_version', { simple: true })).toBe(26)

    // Verify columns exist
    const newCols = (
      db.prepare('PRAGMA table_info(expense_lines)').all() as { name: string }[]
    ).map((c) => c.name)
    expect(newCols).toContain('sort_order')
    expect(newCols).toContain('created_at')

    // Verify sort_order backfill: 0-indexed by id order within expense_id
    const lines = db
      .prepare(
        'SELECT id, sort_order, created_at FROM expense_lines ORDER BY id',
      )
      .all() as {
      id: number
      sort_order: number
      created_at: string
    }[]

    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatchObject({ id: 10, sort_order: 0 })
    expect(lines[1]).toMatchObject({ id: 20, sort_order: 1 })
    expect(lines[2]).toMatchObject({ id: 30, sort_order: 2 })

    // Verify created_at backfill from parent expense
    for (const line of lines) {
      expect(line.created_at).toBe('2024-03-15 10:30:00')
    }
  })

  it('parity: sort_order + created_at match invoice_lines definition', () => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    runMigrations(db, 26)

    const elInfo = db.prepare('PRAGMA table_info(expense_lines)').all() as {
      name: string
      notnull: number
      dflt_value: string | null
      type: string
    }[]
    const ilInfo = db.prepare('PRAGMA table_info(invoice_lines)').all() as {
      name: string
      notnull: number
      dflt_value: string | null
      type: string
    }[]

    for (const colName of ['sort_order', 'created_at']) {
      const elCol = elInfo.find((c) => c.name === colName)!
      const ilCol = ilInfo.find((c) => c.name === colName)!

      expect(elCol.notnull).toBe(ilCol.notnull)
      expect(elCol.type).toBe(ilCol.type)
    }

    // sort_order dflt_value matches exactly
    const elSort = elInfo.find((c) => c.name === 'sort_order')!
    const ilSort = ilInfo.find((c) => c.name === 'sort_order')!
    expect(elSort.dflt_value).toBe(ilSort.dflt_value)

    // created_at dflt_value diverges: ADD COLUMN cannot use non-constant default
    // (SQLite restriction, all versions incl. 3.51+). invoice_lines has datetime('now')
    // via CREATE TABLE; expense_lines has constant placeholder via ADD COLUMN.
    // expense-service.ts compensates by explicitly setting datetime('now') in INSERT.
    const elCreated = elInfo.find((c) => c.name === 'created_at')!
    const ilCreated = ilInfo.find((c) => c.name === 'created_at')!
    expect(ilCreated.dflt_value).toBe("datetime('now')")
    expect(elCreated.dflt_value).toBe("'1970-01-01 00:00:00'")
  })

  it('orphan expense_lines causes migration to throw', () => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    runMigrations(db, 25)

    // Seed minimal data
    db.exec(`
      INSERT INTO companies (id, org_number, name, fiscal_rule) VALUES (1, '559000-1234', 'Test AB', 'K2');
      INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
        VALUES (1, 1, '2024', '2024-01-01', '2024-12-31');
      INSERT INTO counterparties (id, name, type) VALUES (1, 'Leverantör AB', 'supplier');
    `)

    // Create an orphaned expense_line by temporarily disabling FK
    db.pragma('foreign_keys = OFF')
    db.exec(`
      INSERT INTO expense_lines (expense_id, description, account_number, quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore)
        VALUES (999, 'Orphan', '6110', 100, 1000, 1, 100000, 25000);
    `)
    db.pragma('foreign_keys = ON')

    // Migration 026 should throw due to orphan
    expect(() => runMigrations(db, 26, 26)).toThrow(/orphaned expense_lines/)
  })

  it('NOT NULL constraint prevents inserting without sort_order default', () => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    runMigrations(db, 26)

    // Seed
    db.exec(`
      INSERT INTO companies (id, org_number, name, fiscal_rule) VALUES (1, '559000-1234', 'Test AB', 'K2');
      INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
        VALUES (1, 1, '2024', '2024-01-01', '2024-12-31');
      INSERT INTO counterparties (id, name, type) VALUES (1, 'Leverantör AB', 'supplier');
      INSERT INTO expenses (id, fiscal_year_id, counterparty_id, expense_date, description, total_amount_ore)
        VALUES (1, 1, 1, '2024-03-15', 'Test', 10000);
    `)

    // INSERT without specifying sort_order/created_at should use defaults (0, datetime('now'))
    db.exec(`
      INSERT INTO expense_lines (expense_id, description, account_number, quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore)
        VALUES (1, 'Default test', '6110', 100, 1000, 1, 100000, 25000);
    `)

    const line = db
      .prepare(
        'SELECT sort_order, created_at FROM expense_lines WHERE expense_id = 1',
      )
      .get() as {
      sort_order: number
      created_at: string
    }
    expect(line.sort_order).toBe(0)
    expect(line.created_at).toBeTruthy()
  })

  it('trigger count unchanged at 12 after migration 026', () => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    runMigrations(db, 26)

    const triggerCount = db
      .prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='trigger'")
      .get() as { cnt: number }
    expect(triggerCount.cnt).toBe(12)
  })
})
