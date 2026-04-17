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

describe('Migration 025 upgrade smoke test', () => {
  it('renames default_price → default_price_ore and price → price_ore', () => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    // Run migrations 1–24
    runMigrations(db, 24)
    expect(db.pragma('user_version', { simple: true })).toBe(24)

    // Seed product data with old column names
    db.exec(`
      INSERT INTO products (id, name, unit, default_price, vat_code_id, account_id, article_type)
        VALUES (1, 'Konsulttjänst', 'timme', 95000, 1, 1, 'service');
    `)
    db.exec(`
      INSERT INTO price_lists (id, name, is_default) VALUES (1, 'Default', 1);
      INSERT INTO price_list_items (price_list_id, product_id, price) VALUES (1, 1, 85000);
    `)

    // Verify old column names exist
    const oldProdCols = (
      db.prepare('PRAGMA table_info(products)').all() as { name: string }[]
    ).map((c) => c.name)
    expect(oldProdCols).toContain('default_price')

    const oldPliCols = (
      db.prepare('PRAGMA table_info(price_list_items)').all() as {
        name: string
      }[]
    ).map((c) => c.name)
    expect(oldPliCols).toContain('price')

    // Run migration 025
    runMigrations(db, 25, 25)
    expect(db.pragma('user_version', { simple: true })).toBe(25)

    // Verify new column names
    const newProdCols = (
      db.prepare('PRAGMA table_info(products)').all() as { name: string }[]
    ).map((c) => c.name)
    expect(newProdCols).toContain('default_price_ore')
    expect(newProdCols).not.toContain('default_price')

    const newPliCols = (
      db.prepare('PRAGMA table_info(price_list_items)').all() as {
        name: string
      }[]
    ).map((c) => c.name)
    expect(newPliCols).toContain('price_ore')
    expect(newPliCols).not.toContain('price')

    // Verify data preserved
    const product = db
      .prepare('SELECT default_price_ore FROM products WHERE id = 1')
      .get() as { default_price_ore: number }
    expect(product.default_price_ore).toBe(95000)

    const pli = db
      .prepare('SELECT price_ore FROM price_list_items WHERE product_id = 1')
      .get() as { price_ore: number }
    expect(pli.price_ore).toBe(85000)
  })

  it('trigger count unchanged at 12 after migration 025', () => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    runMigrations(db, 25)

    const triggerCount = db
      .prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='trigger'")
      .get() as { cnt: number }
    expect(triggerCount.cnt).toBe(12)
  })
})
