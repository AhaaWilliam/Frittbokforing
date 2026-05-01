import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { buildUpdate } from '../../src/main/utils/build-update'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT,
      email TEXT,
      role TEXT,
      updated_at TEXT
    )
  `)
  db.prepare(`INSERT INTO users (id, name, email, role) VALUES (1, 'a', 'a@x', 'admin')`).run()
})

afterEach(() => {
  db.close()
})

const ALLOWED = new Set(['name', 'email'])

describe('buildUpdate — security boundary (whitelist + bound params)', () => {
  it('uppdaterar tillåtna fält', () => {
    const built = buildUpdate(
      db,
      'users',
      { name: 'b', email: 'b@x' },
      { allowedColumns: ALLOWED },
    )
    expect(built).not.toBeNull()
    expect(built?.fieldCount).toBe(2)
    built!.run('id = ?', [1])
    const row = db.prepare('SELECT name, email FROM users WHERE id = 1').get()
    expect(row).toEqual({ name: 'b', email: 'b@x' })
  })

  it('blockerar fält utanför whitelist (role kan inte uppdateras)', () => {
    const built = buildUpdate(
      db,
      'users',
      { name: 'b', role: 'super-admin' },
      { allowedColumns: ALLOWED },
    )
    expect(built?.fieldCount).toBe(1) // bara name
    built!.run('id = ?', [1])
    const row = db.prepare('SELECT role FROM users WHERE id = 1').get() as { role: string }
    expect(row.role).toBe('admin') // oförändrat
  })

  it('returnerar null om inga tillåtna fält finns', () => {
    const built = buildUpdate(
      db,
      'users',
      { role: 'super-admin' },
      { allowedColumns: ALLOWED },
    )
    expect(built).toBeNull()
  })

  it('hoppar över undefined-värden (sparar dem som de var)', () => {
    const built = buildUpdate(
      db,
      'users',
      { name: 'b', email: undefined },
      { allowedColumns: ALLOWED },
    )
    expect(built?.fieldCount).toBe(1)
    built!.run('id = ?', [1])
    const row = db.prepare('SELECT email FROM users WHERE id = 1').get() as { email: string }
    expect(row.email).toBe('a@x') // oförändrat
  })

  it('null-värde sätts som NULL (skiljer sig från undefined)', () => {
    const built = buildUpdate(
      db,
      'users',
      { name: null },
      { allowedColumns: ALLOWED },
    )
    expect(built?.fieldCount).toBe(1)
    built!.run('id = ?', [1])
    const row = db.prepare('SELECT name FROM users WHERE id = 1').get() as { name: string | null }
    expect(row.name).toBeNull()
  })

  it('fieldMap mappar input-key → db-column', () => {
    const built = buildUpdate(
      db,
      'users',
      { fullName: 'Bobby' },
      {
        allowedColumns: ALLOWED,
        fieldMap: { fullName: 'name' },
      },
    )
    expect(built?.fieldCount).toBe(1)
    built!.run('id = ?', [1])
    expect((db.prepare('SELECT name FROM users WHERE id = 1').get() as { name: string }).name).toBe('Bobby')
  })

  it('touchUpdatedAt lägger till updated_at = datetime("now","localtime")', () => {
    const built = buildUpdate(
      db,
      'users',
      { name: 'b' },
      { allowedColumns: ALLOWED, touchUpdatedAt: true },
    )
    built!.run('id = ?', [1])
    const row = db.prepare('SELECT updated_at FROM users WHERE id = 1').get() as { updated_at: string }
    expect(row.updated_at).toBeTruthy()
    expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })

  it('utan touchUpdatedAt → updated_at oförändrad', () => {
    const built = buildUpdate(
      db,
      'users',
      { name: 'b' },
      { allowedColumns: ALLOWED },
    )
    built!.run('id = ?', [1])
    const row = db.prepare('SELECT updated_at FROM users WHERE id = 1').get() as { updated_at: string | null }
    expect(row.updated_at).toBeNull()
  })

  it('SQL-injection i värde är harmlös (binds via ?)', () => {
    const built = buildUpdate(
      db,
      'users',
      { name: "'; DROP TABLE users; --" },
      { allowedColumns: ALLOWED },
    )
    built!.run('id = ?', [1])
    // Tabellen finns kvar, värdet sparades som-är
    const row = db.prepare('SELECT name FROM users WHERE id = 1').get() as { name: string }
    expect(row.name).toBe("'; DROP TABLE users; --")
    // Verifiera att tabellen finns kvar
    expect(db.prepare('SELECT COUNT(*) as c FROM users').get()).toEqual({ c: 1 })
  })
})
