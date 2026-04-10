import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'
import { migrations } from './migrations'

const DB_DIR = process.env.DB_PATH
  ? path.dirname(process.env.DB_PATH)
  : path.join(app.getPath('documents'), 'Fritt Bokföring')
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, 'data.db')

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
