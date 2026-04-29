/**
 * Integration test for the encrypted DB open path.
 *
 * Uses the real multi-ciphers driver against a temp file. Verifies:
 *   - openEncryptedDb encrypts the file on disk (no plaintext SQLite header)
 *   - re-open with same key works
 *   - re-open with wrong key throws
 *   - the DB is fully functional after open (migrations ran, PRAGMAs set)
 *
 * This test does NOT exercise db.ts's `getDb()` path (that depends on
 * Electron `app.getPath` which isn't available in vitest). We call
 * `openEncryptedDb` directly — same module, independent of Electron.
 *
 * Isolated from other tests via mkdtemp per-test + afterEach cleanup.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// Electron isn't present in vitest. Stub out `electron` before importing db.ts.
vi.mock('electron', () => ({
  app: {
    getPath: () => os.tmpdir(),
  },
}))

let tmpDir: string
let dbPath: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-enc-'))
  dbPath = path.join(tmpDir, 'encrypted.db')
})

afterEach(async () => {
  // Close any leftover DB handle held by the module-level singleton so
  // rmSync can remove the file on Windows/CI.
  const mod = await import('../../src/main/db')
  mod.closeDb()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('openEncryptedDb — encryption at rest', () => {
  it('creates a file that does not start with the SQLite magic header', async () => {
    const { openEncryptedDb } = await import('../../src/main/db')
    const key = Buffer.alloc(32, 0x42)
    const db = openEncryptedDb(dbPath, key)
    db.prepare('CREATE TABLE probe (v TEXT)').run()
    db.prepare('INSERT INTO probe VALUES (?)').run('hemlig data')
    // Force a flush by closing.
    const { closeDb } = await import('../../src/main/db')
    closeDb()

    const raw = fs.readFileSync(dbPath)
    expect(raw.slice(0, 16).toString().startsWith('SQLite format')).toBe(false)
    expect(raw.includes(Buffer.from('hemlig data'))).toBe(false)
  })
})

describe('openEncryptedDb — roundtrip with key', () => {
  it('reopens successfully with the same key', async () => {
    const { openEncryptedDb, closeDb } = await import('../../src/main/db')
    const key = Buffer.alloc(32, 0x42)
    let db = openEncryptedDb(dbPath, key)
    db.prepare('CREATE TABLE probe (v TEXT)').run()
    db.prepare('INSERT INTO probe VALUES (?)').run('kvarstar')
    closeDb()

    db = openEncryptedDb(dbPath, key)
    const row = db.prepare('SELECT v FROM probe').get() as { v: string }
    expect(row.v).toBe('kvarstar')
  })
})

describe('openEncryptedDb — wrong key rejected', () => {
  it('throws when opened with a different key', async () => {
    const { openEncryptedDb, closeDb } = await import('../../src/main/db')
    const key = Buffer.alloc(32, 0x42)
    openEncryptedDb(dbPath, key)
    closeDb()

    const wrong = Buffer.alloc(32, 0x99)
    expect(() => openEncryptedDb(dbPath, wrong)).toThrow()
  })
})

describe('openEncryptedDb — migrations and functions applied', () => {
  it('has run migrations (non-zero user_version)', async () => {
    const { openEncryptedDb } = await import('../../src/main/db')
    const db = openEncryptedDb(dbPath, Buffer.alloc(32, 0x42))
    const v = db.pragma('user_version', { simple: true }) as number
    expect(v).toBeGreaterThan(0)
  })

  it('has foreign_keys ON and WAL journal', async () => {
    const { openEncryptedDb } = await import('../../src/main/db')
    const db = openEncryptedDb(dbPath, Buffer.alloc(32, 0x42))
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
  })

  it('has lower_unicode custom function registered', async () => {
    const { openEncryptedDb } = await import('../../src/main/db')
    const db = openEncryptedDb(dbPath, Buffer.alloc(32, 0x42))
    const r = db.prepare("SELECT lower_unicode('ÅÄÖ') AS v").get() as {
      v: string
    }
    expect(r.v).toBe('åäö')
  })
})

describe('openEncryptedDb — rejects wrong key length', () => {
  it('throws on a 16-byte key', async () => {
    const { openEncryptedDb } = await import('../../src/main/db')
    expect(() => openEncryptedDb(dbPath, Buffer.alloc(16))).toThrow(/32 bytes/)
  })
})
