import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'

const TEST_DB_DIR = path.join(os.tmpdir(), 'fritt-bokforing-test')
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test.db')

let db: Database.Database

beforeAll(() => {
  fs.mkdirSync(TEST_DB_DIR, { recursive: true })
  db = new Database(TEST_DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
})

afterAll(() => {
  if (db) db.close()
  fs.rmSync(TEST_DB_DIR, { recursive: true, force: true })
})

describe('SQLite database setup', () => {
  it('should open the database successfully', () => {
    expect(db).toBeDefined()
    expect(db.open).toBe(true)
  })

  it('should have WAL journal mode active', () => {
    const mode = db.pragma('journal_mode', { simple: true })
    expect(mode).toBe('wal')
  })

  it('should have foreign_keys enabled', () => {
    const fk = db.pragma('foreign_keys', { simple: true })
    expect(fk).toBe(1)
  })

  it('should return user_version >= 0', () => {
    const version = db.pragma('user_version', { simple: true }) as number
    expect(version).toBeGreaterThanOrEqual(0)
  })

  it('should handle INSERT + SELECT in a transaction', () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS _test_table (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        amount INTEGER NOT NULL
      )
    `)

    const insert = db.prepare(
      'INSERT INTO _test_table (name, amount) VALUES (?, ?)',
    )
    const select = db.prepare('SELECT * FROM _test_table WHERE name = ?')

    const trx = db.transaction(() => {
      insert.run('Testrad', 10000)
      const row = select.get('Testrad') as {
        id: number
        name: string
        amount: number
      }
      return row
    })

    const result = trx()
    expect(result).toBeDefined()
    expect(result.name).toBe('Testrad')
    expect(result.amount).toBe(10000)

    db.exec('DROP TABLE _test_table')
  })
})
