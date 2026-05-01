import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { vacuumDatabase } from '../../src/main/services/maintenance-service'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE big (id INTEGER PRIMARY KEY, payload TEXT);
  `)
  // Lägg in lite data och radera för att skapa fragment
  const ins = db.prepare('INSERT INTO big (payload) VALUES (?)')
  for (let i = 0; i < 100; i++) {
    ins.run('a'.repeat(1024))
  }
  db.exec('DELETE FROM big WHERE id <= 50')
})

afterEach(() => {
  db.close()
})

describe('vacuumDatabase', () => {
  it('returnerar success med before/after bytes', () => {
    const result = vacuumDatabase(db)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.before_bytes).toBeGreaterThan(0)
    expect(result.data.after_bytes).toBeGreaterThan(0)
  })

  it('after_bytes <= before_bytes (VACUUM frigör eller behåller storlek)', () => {
    const result = vacuumDatabase(db)
    if (!result.success) {
      throw new Error('Expected success')
    }
    expect(result.data.after_bytes).toBeLessThanOrEqual(
      result.data.before_bytes,
    )
  })

  it('storlek är multipel av page_size', () => {
    const pageSize = db.pragma('page_size', { simple: true }) as number
    const result = vacuumDatabase(db)
    if (!result.success) throw new Error('expected success')
    expect(result.data.before_bytes % pageSize).toBe(0)
    expect(result.data.after_bytes % pageSize).toBe(0)
  })

  it('VACUUM på tom databas funkar utan fel', () => {
    db.close()
    db = new Database(':memory:')
    db.exec('CREATE TABLE x (id INTEGER PRIMARY KEY)')
    const result = vacuumDatabase(db)
    expect(result.success).toBe(true)
  })
})
