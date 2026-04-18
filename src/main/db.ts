import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'
import { migrations } from './migrations'
import { registerCustomFunctions } from './db-functions'
import { rebuildSearchIndex } from './services/search-service'

import { resolveDbPath } from './db-path'

const defaultDbPath = path.join(
  app.getPath('documents'),
  'Fritt Bokföring',
  'data.db',
)
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

    registerCustomFunctions(db)
    runMigrations(db)

    // FTS5 rebuild — best-effort, search falls back to LIKE if this fails (D2)
    try {
      rebuildSearchIndex(db)
    } catch (err) {
      console.error('FTS5 rebuild failed, falling back to LIKE search:', err) // like-exempt: log message, not SQL
    }
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
    // Migration 021 (index 20): journal_entries CHECK-rebuild (auto_bank_fee) + payment_batches.
    // Migration 022 (index 21): invoices + payment tables öre-suffix rename.
    // Migration 023 (index 22): payment_batches FK on account_number.
    // Migration 038 (index 37): journal_entries CHECK-rebuild (verification_series) + fixed_assets + depreciation_schedules.
    // Migration 043 (index 42): bank_statements.source_format CHECK-utökning ('camt.053','camt.054').
    const needsFkOff =
      i === 20 || i === 21 || i === 22 || i === 37 || i === 42
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
        throw new Error(
          `Migration ${i + 1} FK integrity check failed: ${JSON.stringify(fkCheck)}`,
        )
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
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", // like-exempt: hardcoded pattern
    )
    .get() as { count: number }
  return result.count
}
