import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'
import { migrations } from './migrations'

import { resolveDbPath } from './db-path'

const defaultDbPath = path.join(app.getPath('documents'), 'Fritt Bokföring', 'data.db')
const DB_PATH = resolveDbPath(process.env, defaultDbPath)
const DB_DIR = path.dirname(DB_PATH)

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(DB_DIR, { recursive: true })

    db = new Database(DB_PATH)

    // KRITISKT: Dessa PRAGMA måste köras VARJE gång databasen öppnas.
    // SQLite har foreign_keys AVSTÄNGDA som default.
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    runMigrations(db)
  }
  return db
}

function runMigrations(database: Database.Database): void {
  const currentVersion = database.pragma('user_version', {
    simple: true,
  }) as number

  for (let i = currentVersion; i < migrations.length; i++) {
    const migration = migrations[i]

    // Table-recreate migrations on tables with inbound FK (M122) require
    // PRAGMA foreign_keys = OFF outside the transaction (SQLite limitation).
    // Migration 022 (index 21): invoices + payment tables öre-suffix rename.
    // Migration 023 (index 22): payment_batches FK on account_number.
    const needsFkOff = i === 21 || i === 22
    if (needsFkOff) database.pragma('foreign_keys = OFF')

    // BEGIN EXCLUSIVE förhindrar korruption vid krasch
    database.exec('BEGIN EXCLUSIVE')
    try {
      database.exec(migration.sql)
      if (migration.programmatic) {
        migration.programmatic(database)
      }
      database.pragma(`user_version = ${i + 1}`)
      database.exec('COMMIT')
    } catch (err) {
      database.exec('ROLLBACK')
      throw err
    }

    if (needsFkOff) {
      database.pragma('foreign_keys = ON')
      // Verify FK integrity after re-enabling (M122 step 4)
      const fkCheck = database.pragma('foreign_key_check') as unknown[]
      if (fkCheck.length > 0) {
        throw new Error(`Migration ${i + 1} FK integrity check failed: ${JSON.stringify(fkCheck)}`)
      }
    }
  }
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function getDbPath(): string {
  return DB_PATH
}

export function getTableCount(database: Database.Database): number {
  const result = database
    .prepare(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .get() as { count: number }
  return result.count
}
