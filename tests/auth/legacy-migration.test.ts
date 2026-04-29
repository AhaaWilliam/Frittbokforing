import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import Database from 'better-sqlite3'
import EncryptedDatabase from 'better-sqlite3-multiple-ciphers'
import {
  archiveLegacyDb,
  defaultArchivePath,
  hasLegacyDb,
  legacyDbDefaultPath,
  migrateLegacyToEncrypted,
} from '../../src/main/auth/legacy-migration'

let tmpRoot: string
let legacyPath: string
let encryptedPath: string
const MASTER_KEY = Buffer.alloc(32, 0x42)

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-migration-'))
  legacyPath = path.join(tmpRoot, 'legacy.db')
  encryptedPath = path.join(tmpRoot, 'encrypted.db')
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

function seedLegacy(rows: { id: number; val: string }[]): void {
  const db = new Database(legacyPath)
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)')
  const stmt = db.prepare('INSERT INTO t (id, val) VALUES (?, ?)')
  for (const r of rows) stmt.run(r.id, r.val)
  db.close()
}

// No pre-created encrypted target — migrateLegacyToEncrypted now requires
// the target NOT to exist.

describe('legacyDbDefaultPath', () => {
  it('returns <documents>/Fritt Bokföring/data.db', () => {
    expect(legacyDbDefaultPath('/Users/alice/Documents')).toBe(
      '/Users/alice/Documents/Fritt Bokföring/data.db',
    )
  })
})

describe('hasLegacyDb', () => {
  it('returns false when path does not exist', () => {
    expect(hasLegacyDb('/nonexistent/path.db')).toBe(false)
  })

  it('returns true for an existing regular file', () => {
    seedLegacy([{ id: 1, val: 'hej' }])
    expect(hasLegacyDb(legacyPath)).toBe(true)
  })

  it('returns false for a directory at the path', () => {
    fs.mkdirSync(legacyPath, { recursive: true })
    expect(hasLegacyDb(legacyPath)).toBe(false)
  })
})

describe('migrateLegacyToEncrypted', () => {
  it('copies all rows from legacy into a fresh encrypted target', () => {
    seedLegacy([
      { id: 1, val: 'alpha' },
      { id: 2, val: 'beta' },
    ])

    migrateLegacyToEncrypted(legacyPath, encryptedPath, MASTER_KEY)

    const target = new EncryptedDatabase(encryptedPath)
    target.pragma(`cipher='sqlcipher'`)
    target.pragma(`key="x'${MASTER_KEY.toString('hex')}'"`)
    const rows = target.prepare('SELECT id, val FROM t ORDER BY id').all() as {
      id: number
      val: string
    }[]
    target.close()
    expect(rows).toEqual([
      { id: 1, val: 'alpha' },
      { id: 2, val: 'beta' },
    ])
  })

  it('preserves user_version from legacy', () => {
    const db = new Database(legacyPath)
    db.exec('CREATE TABLE t(v INTEGER)')
    db.pragma('user_version = 42')
    db.close()

    migrateLegacyToEncrypted(legacyPath, encryptedPath, MASTER_KEY)

    const target = new EncryptedDatabase(encryptedPath)
    target.pragma(`cipher='sqlcipher'`)
    target.pragma(`key="x'${MASTER_KEY.toString('hex')}'"`)
    const v = target.pragma('user_version', { simple: true })
    target.close()
    expect(v).toBe(42)
  })

  it('copies indexes, views and triggers in addition to tables', () => {
    const db = new Database(legacyPath)
    db.exec(`
      CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT);
      CREATE INDEX idx_t_val ON t(val);
      CREATE VIEW v_t AS SELECT id, val FROM t;
      CREATE TRIGGER trg_t AFTER INSERT ON t BEGIN
        UPDATE t SET val = val || '!' WHERE id = NEW.id AND NEW.val NOT LIKE '%!';
      END;
    `)
    db.prepare('INSERT INTO t (val) VALUES (?)').run('hej')
    db.close()

    migrateLegacyToEncrypted(legacyPath, encryptedPath, MASTER_KEY)

    const target = new EncryptedDatabase(encryptedPath)
    target.pragma(`cipher='sqlcipher'`)
    target.pragma(`key="x'${MASTER_KEY.toString('hex')}'"`)
    const kinds = target
      .prepare(
        `SELECT type, name FROM sqlite_master
         WHERE name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all() as { type: string; name: string }[]
    target.close()
    const summary = kinds.map((k) => `${k.type}:${k.name}`)
    expect(summary).toContain('table:t')
    expect(summary).toContain('index:idx_t_val')
    expect(summary).toContain('view:v_t')
    expect(summary).toContain('trigger:trg_t')
  })

  it('leaves the legacy file intact', () => {
    seedLegacy([{ id: 1, val: 'x' }])
    const before = fs.readFileSync(legacyPath)
    migrateLegacyToEncrypted(legacyPath, encryptedPath, MASTER_KEY)
    expect(fs.existsSync(legacyPath)).toBe(true)
    expect(fs.readFileSync(legacyPath).equals(before)).toBe(true)
  })

  it('throws if legacy path does not exist', () => {
    expect(() =>
      migrateLegacyToEncrypted('/missing/path.db', encryptedPath, MASTER_KEY),
    ).toThrow(/not found/)
  })

  it('throws if encrypted target already exists', () => {
    seedLegacy([{ id: 1, val: 'x' }])
    fs.writeFileSync(encryptedPath, 'existing')
    expect(() =>
      migrateLegacyToEncrypted(legacyPath, encryptedPath, MASTER_KEY),
    ).toThrow(/already exists/)
  })

  it('throws if master key is wrong size', () => {
    seedLegacy([{ id: 1, val: 'x' }])
    expect(() =>
      migrateLegacyToEncrypted(legacyPath, encryptedPath, Buffer.alloc(16)),
    ).toThrow(/32 bytes/)
  })

  it('result cannot be opened with the wrong key', () => {
    seedLegacy([{ id: 1, val: 'hemlig' }])
    migrateLegacyToEncrypted(legacyPath, encryptedPath, MASTER_KEY)

    const wrong = new EncryptedDatabase(encryptedPath)
    wrong.pragma(`cipher='sqlcipher'`)
    wrong.pragma(`key="x'${Buffer.alloc(32, 0x99).toString('hex')}'"`)
    expect(() => wrong.prepare('SELECT * FROM t').get()).toThrow()
    wrong.close()
  })
})

describe('archiveLegacyDb', () => {
  it('moves the file to archivePath', () => {
    seedLegacy([{ id: 1, val: 'x' }])
    const archive = path.join(tmpRoot, 'archive', 'legacy.db')
    archiveLegacyDb(legacyPath, archive)
    expect(fs.existsSync(legacyPath)).toBe(false)
    expect(fs.existsSync(archive)).toBe(true)
  })

  it('creates archive parent dir if missing', () => {
    seedLegacy([{ id: 1, val: 'x' }])
    const archive = path.join(tmpRoot, 'deep', 'nested', 'dir', 'legacy.db')
    archiveLegacyDb(legacyPath, archive)
    expect(fs.existsSync(archive)).toBe(true)
  })

  it('archives WAL sidecar when present', () => {
    seedLegacy([{ id: 1, val: 'x' }])
    fs.writeFileSync(legacyPath + '-wal', Buffer.from([0, 0, 0]))
    const archive = path.join(tmpRoot, 'archive', 'legacy.db')
    archiveLegacyDb(legacyPath, archive)
    expect(fs.existsSync(archive + '-wal')).toBe(true)
    expect(fs.existsSync(legacyPath + '-wal')).toBe(false)
  })
})

describe('migrateLegacyToEncrypted — orphan trigger cleanup', () => {
  it('passerar igenom legacy-DB med orphan expense_line product trigger', () => {
    // Regressionsvakt: en tidig migration 046-variant skapade triggers
    // för expense_lines.product_id även om kolumnen aldrig fanns. När
    // schemat kopieras till target failar CREATE TRIGGER med "no such
    // column: NEW.product_id". Pre-copy-steget ska droppa de kända
    // orphan-namnen från legacy-schemat innan kopieringen.
    const db = new Database(legacyPath)
    // Skapa tabell + seeda data INNAN triggers läggs till — triggerns
    // NEW.product_id-referens skulle annars blockera INSERT.
    db.exec(`
      CREATE TABLE expense_lines (
        id INTEGER PRIMARY KEY,
        expense_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL
      );
    `)
    db.prepare(
      'INSERT INTO expense_lines (id, expense_id, quantity) VALUES (1, 1, 1)',
    ).run()
    db.exec(`
      CREATE TRIGGER trg_expense_line_product_company_match_insert
      BEFORE INSERT ON expense_lines
      WHEN NEW.product_id IS NOT NULL
      BEGIN
        SELECT RAISE(ABORT, 'orphan');
      END;
      CREATE TRIGGER trg_expense_line_product_company_match_update
      BEFORE UPDATE ON expense_lines
      WHEN NEW.product_id IS NOT NULL
      BEGIN
        SELECT RAISE(ABORT, 'orphan');
      END;
    `)
    db.close()

    expect(() =>
      migrateLegacyToEncrypted(legacyPath, encryptedPath, MASTER_KEY),
    ).not.toThrow()

    const target = new EncryptedDatabase(encryptedPath)
    target.pragma(`cipher='sqlcipher'`)
    target.pragma(`key="x'${MASTER_KEY.toString('hex')}'"`)
    const rowCount = (
      target.prepare('SELECT COUNT(*) AS c FROM expense_lines').get() as {
        c: number
      }
    ).c
    const triggerRows = target
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='trigger'
         AND name IN (
           'trg_expense_line_product_company_match_insert',
           'trg_expense_line_product_company_match_update'
         )`,
      )
      .all() as { name: string }[]
    target.close()

    expect(rowCount).toBe(1)
    expect(triggerRows).toHaveLength(0)
  })
})

describe('defaultArchivePath', () => {
  it('produces a timestamped path inside the backups dir', () => {
    const p = defaultArchivePath(
      '/docs/Fritt Bokföring/data.db',
      '/vault/users/u1/backups',
      new Date('2026-04-19T10:30:00.000Z'),
    )
    expect(p).toBe(
      '/vault/users/u1/backups/pre-encryption-2026-04-19T10-30-00-data.db',
    )
  })
})
