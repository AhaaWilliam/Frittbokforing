import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'

let db: Database.Database

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  if (db) db.close()
})

describe('F23: invoice_lines.unit_price → unit_price_ore rename', () => {
  it('PRAGMA user_version === 16', () => {
    const v = db.pragma('user_version', { simple: true }) as number
    expect(v).toBe(38)
  })

  it('invoice_lines has unit_price_ore column (not unit_price)', () => {
    const cols = db.prepare('PRAGMA table_info(invoice_lines)').all() as { name: string }[]
    const colNames = cols.map((c) => c.name)
    expect(colNames).toContain('unit_price_ore')
    expect(colNames).not.toContain('unit_price')
  })
})
