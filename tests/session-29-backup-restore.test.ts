import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { migrations } from '../src/main/migrations'

// Test backup validation logic directly via a temp DB
// The full restoreBackup flow requires Electron (dialog, app.relaunch)
// so we test the validation and migration upgrade paths here.

let tempDir: string

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fritt-backup-test-'))
})

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true })
})

function createValidBackup(version?: number): string {
  const dbPath = path.join(tempDir, 'backup.db')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Run all migrations up to the requested version (or all)
  const targetVersion = version ?? migrations.length
  for (let i = 0; i < targetVersion; i++) {
    const migration = migrations[i]
    const needsFkOff = i === 20 || i === 21 || i === 22
    if (needsFkOff) db.pragma('foreign_keys = OFF')

    db.exec('BEGIN EXCLUSIVE')
    try {
      db.exec(migration.sql)
      if (migration.programmatic) {
        migration.programmatic(db)
      }
      db.pragma(`user_version = ${i + 1}`)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }

    if (needsFkOff) {
      db.pragma('foreign_keys = ON')
    }
  }

  db.close()
  return dbPath
}

describe('Backup validation', () => {
  it('valid backup has correct user_version', () => {
    const backupPath = createValidBackup()
    const db = new Database(backupPath, { readonly: true })
    const version = db.pragma('user_version', { simple: true }) as number
    db.close()
    expect(version).toBe(migrations.length)
  })

  it('valid backup has companies table', () => {
    const backupPath = createValidBackup()
    const db = new Database(backupPath, { readonly: true })
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='companies'",
      )
      .all()
    db.close()
    expect(tables.length).toBe(1)
  })

  it('valid backup passes integrity check', () => {
    const backupPath = createValidBackup()
    const db = new Database(backupPath, { readonly: true })
    const integrity = db.pragma('integrity_check', { simple: true }) as string
    db.close()
    expect(integrity).toBe('ok')
  })

  it('rejects non-SQLite file', () => {
    const fakePath = path.join(tempDir, 'notadb.db')
    fs.writeFileSync(fakePath, 'this is not a database')
    // better-sqlite3 may not throw on open, but fails on first pragma/query
    let threw = false
    try {
      const db = new Database(fakePath, { readonly: true })
      db.pragma('user_version', { simple: true })
      db.close()
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })

  it('rejects file without companies table', () => {
    const dbPath = path.join(tempDir, 'empty.db')
    const db = new Database(dbPath)
    db.exec('CREATE TABLE foo (id INTEGER PRIMARY KEY)')
    db.close()

    const checkDb = new Database(dbPath, { readonly: true })
    const tables = checkDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='companies'",
      )
      .all()
    checkDb.close()
    expect(tables.length).toBe(0)
  })

  it('detects newer version backup', () => {
    const backupPath = createValidBackup()
    // Manually set user_version higher
    const db = new Database(backupPath)
    db.pragma(`user_version = ${migrations.length + 5}`)
    db.close()

    const checkDb = new Database(backupPath, { readonly: true })
    const version = checkDb.pragma('user_version', { simple: true }) as number
    checkDb.close()
    expect(version).toBeGreaterThan(migrations.length)
  })
})

describe('Backup migration upgrade', () => {
  it('older backup can be migrated to current version', () => {
    // Create a backup at version 20 (arbitrary older version)
    const olderVersion = 20
    const backupPath = createValidBackup(olderVersion)

    // Verify it starts at the older version
    let db = new Database(backupPath, { readonly: true })
    expect(db.pragma('user_version', { simple: true })).toBe(olderVersion)
    db.close()

    // Run remaining migrations
    db = new Database(backupPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    for (let i = olderVersion; i < migrations.length; i++) {
      const migration = migrations[i]
      const needsFkOff = i === 20 || i === 21 || i === 22
      if (needsFkOff) db.pragma('foreign_keys = OFF')

      db.exec('BEGIN EXCLUSIVE')
      try {
        db.exec(migration.sql)
        if (migration.programmatic) {
          migration.programmatic(db)
        }
        db.pragma(`user_version = ${i + 1}`)
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }

      if (needsFkOff) {
        db.pragma('foreign_keys = ON')
        const fkCheck = db.pragma('foreign_key_check') as unknown[]
        expect(fkCheck.length).toBe(0)
      }
    }

    // Verify upgraded to current version
    expect(db.pragma('user_version', { simple: true })).toBe(migrations.length)

    // Verify integrity
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok')

    db.close()
  })
})

describe('Pre-restore backup creation', () => {
  it('fs.copyFileSync creates exact copy', () => {
    const originalPath = createValidBackup()
    const copyPath = path.join(tempDir, 'pre-restore-copy.db')

    fs.copyFileSync(originalPath, copyPath)

    // Both should be valid and have same user_version
    const origDb = new Database(originalPath, { readonly: true })
    const copyDb = new Database(copyPath, { readonly: true })

    expect(origDb.pragma('user_version', { simple: true })).toBe(
      copyDb.pragma('user_version', { simple: true }),
    )
    expect(copyDb.pragma('integrity_check', { simple: true })).toBe('ok')

    origDb.close()
    copyDb.close()
  })
})
