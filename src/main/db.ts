import Database from 'better-sqlite3-multiple-ciphers'
import type BetterSqlite3 from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'
import { migrations } from './migrations'
import { registerCustomFunctions } from './db-functions'
import { rebuildSearchIndex } from './services/search-service'

import { resolveDbPath } from './db-path'

/**
 * Type alias — services consume DB instances via this type. The structural
 * API is identical between `better-sqlite3` and `better-sqlite3-multiple-ciphers`
 * (the latter is a fork), so we keep the well-known `Database.Database` shape
 * from the original package for import stability across 150+ service files.
 */
type Db = BetterSqlite3.Database

const defaultDbPath = path.join(
  app.getPath('documents'),
  'Fritt Bokföring',
  'data.db',
)
const DB_PATH = resolveDbPath(process.env, defaultDbPath)
const DB_DIR = path.dirname(DB_PATH)

let db: Db | null = null

/**
 * Apply SQLCipher key to an open connection. No-op when key is null/undefined
 * (unencrypted mode — kept for legacy unencrypted DB paths during migration
 * and for tests using `:memory:`).
 *
 * Must be called BEFORE any SELECT/DML. `PRAGMA key` silently succeeds even
 * with a wrong key — the error surfaces on first read. Callers should verify
 * by reading a trivial row.
 */
function applyCipherKey(
  database: Db,
  keyHex: string | null | undefined,
): void {
  if (!keyHex) return
  database.pragma(`cipher='sqlcipher'`)
  database.pragma(`key="x'${keyHex}'"`)
}

/**
 * Initialize an open DB: PRAGMAs, custom functions, migrations, FTS5 rebuild.
 * Shared between legacy `getDb()` and new `openEncryptedDb()` paths.
 */
function initOpenedDb(database: Db): void {
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  registerCustomFunctions(database)
  runMigrations(database)
  try {
    rebuildSearchIndex(database)
  } catch (err) {
    console.error('FTS5 rebuild failed, falling back to LIKE search:', err) // like-exempt: log message, not SQL
  }
}

export function getDb(): Db {
  if (!db) {
    throw new Error(
      'DB not open — openEncryptedDb(path, key) must be called after auth unlock',
    )
  }
  return db
}

/** Returns true when a DB connection has been opened and not since closed. */
export function hasOpenDb(): boolean {
  return db !== null
}

/**
 * Legacy entry-point: open the unencrypted data.db at <Documents>/Fritt Bokföring.
 * Used by tests and any pre-auth path that explicitly wants the unencrypted
 * legacy DB. Prefer `openEncryptedDb` for post-auth flows.
 */
export function openLegacyDb(): Db {
  if (!db) {
    fs.mkdirSync(DB_DIR, { recursive: true })
    db = new Database(DB_PATH) as unknown as Db
    initOpenedDb(db)
  }
  return db
}

/**
 * Lazy proxy for the current DB singleton. Use inside handlers registered
 * before the DB is opened: property access forwards to `getDb()` on each
 * call, so the proxy always resolves the current connection (including a
 * different one after a logout+login cycle).
 *
 * Prepared statements and transactions bound via this proxy are bound to
 * whichever connection was current at bind-time — the project convention
 * is to prepare statements inline per-call, so this is not a concern in
 * practice.
 */
export const dbProxy: Db = new Proxy({} as Db, {
  get(_target, prop, _receiver) {
    const real = getDb() as unknown as Record<string | symbol, unknown>
    const val = real[prop as string | symbol]
    if (typeof val === 'function') {
      return (val as (...args: unknown[]) => unknown).bind(real)
    }
    return val
  },
}) as Db

/**
 * Open an encrypted DB at a given path with the given 32-byte master key.
 * Used by the auth flow post-login: key-store holds K, we open the per-user
 * app.db with it. Caller is responsible for ensuring the parent dir exists.
 *
 * Verifies the key is correct by attempting a trivial SELECT after pragma —
 * wrong key surfaces as "file is not a database" here rather than later.
 */
export function openEncryptedDb(dbPath: string, masterKey: Buffer): Db {
  if (masterKey.length !== 32) {
    throw new Error('masterKey must be 32 bytes')
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const instance = new Database(dbPath) as unknown as Db
  try {
    applyCipherKey(instance, masterKey.toString('hex'))
    // Verify key before running migrations. For a fresh DB the first read is
    // still empty; for an existing DB a wrong key triggers "file is not a
    // database".
    instance.prepare('SELECT count(*) FROM sqlite_master').get()
  } catch (err) {
    instance.close()
    throw err
  }
  initOpenedDb(instance)
  if (db) db.close()
  db = instance
  return db
}

function runMigrations(database: Db): void {
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
    // Migration 044 (index 43): bank_statements.source_format CHECK-utökning ('mt940','bgmax') T3.d.
    // Migration 045 (index 44): MC3 stamdata-scoping — counterparties/products/price_lists.
    // Migration 047 (index 46): F-TT-003 expenses table-recreate för CHECKs.
    // Migration 049 (index 48): Sprint U1 SEPA DD — payment_batches CHECK-utökning.
    const needsFkOff =
      i === 20 ||
      i === 21 ||
      i === 22 ||
      i === 37 ||
      i === 42 ||
      i === 43 ||
      i === 44 ||
      i === 46 ||
      i === 48
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

export function getTableCount(database: Db): number {
  const result = database
    .prepare(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", // like-exempt: hardcoded pattern
    )
    .get() as { count: number }
  return result.count
}
