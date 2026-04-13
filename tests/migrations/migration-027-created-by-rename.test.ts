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
    const needsFkOff = i === 21 || i === 22
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

describe('Migration 027: journal_entries.created_by → created_by_id', () => {
  it('renames created_by to created_by_id preserving data', () => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    // Run migrations 1–26
    runMigrations(db, 26)
    expect(db.pragma('user_version', { simple: true })).toBe(26)

    // Verify old column exists
    const oldCols = (db.prepare('PRAGMA table_info(journal_entries)').all() as { name: string }[]).map(c => c.name)
    expect(oldCols).toContain('created_by')
    expect(oldCols).not.toContain('created_by_id')

    // Seed: company → FY → user → journal_entry with created_by set
    db.exec(`
      INSERT INTO companies (id, org_number, name, fiscal_rule) VALUES (1, '559000-1234', 'Test AB', 'K2');
      INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
        VALUES (1, 1, '2024', '2024-01-01', '2024-12-31');
      INSERT INTO users (id, name, email) VALUES (1, 'Test User', 'test@example.com');
    `)

    // Insert two journal entries: one with created_by=1, one with NULL
    db.prepare(`
      INSERT INTO journal_entries (id, company_id, fiscal_year_id, journal_date, description, status, created_by)
        VALUES (1, 1, 1, '2024-01-15', 'Med skapare', 'draft', 1)
    `).run()
    db.prepare(`
      INSERT INTO journal_entries (id, company_id, fiscal_year_id, journal_date, description, status, created_by)
        VALUES (2, 1, 1, '2024-02-15', 'Utan skapare', 'draft', NULL)
    `).run()

    // Run migration 027
    runMigrations(db, 27, 27)
    expect(db.pragma('user_version', { simple: true })).toBe(27)

    // Verify new column exists and old is gone
    const newCols = (db.prepare('PRAGMA table_info(journal_entries)').all() as { name: string }[]).map(c => c.name)
    expect(newCols).toContain('created_by_id')
    expect(newCols).not.toContain('created_by')

    // Verify data preserved
    const row1 = db.prepare('SELECT created_by_id FROM journal_entries WHERE id = 1').get() as { created_by_id: number | null }
    expect(row1.created_by_id).toBe(1)

    const row2 = db.prepare('SELECT created_by_id FROM journal_entries WHERE id = 2').get() as { created_by_id: number | null }
    expect(row2.created_by_id).toBeNull()

    // Verify FK still works — created_by_id references users(id)
    const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='journal_entries'").get() as { sql: string }
    expect(schema.sql).toContain('created_by_id')

    // Verify FK integrity
    const fkCheck = db.pragma('foreign_key_check') as unknown[]
    expect(fkCheck).toHaveLength(0)

    // Verify integrity
    const integrity = db.pragma('integrity_check', { simple: true }) as string
    expect(integrity).toBe('ok')

    // Verify trigger count unchanged (12)
    const triggerCount = (db.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='trigger'").get() as { cnt: number }).cnt
    expect(triggerCount).toBe(12)
  })
})
