#!/usr/bin/env node
/**
 * Sub-process worker for seedLegacyDb (e11 spec).
 *
 * Uses Node's built-in `node:sqlite` module (Node 22.5+) instead of
 * better-sqlite3 to avoid the ABI conflict: Playwright/Electron rebuilds
 * native modules for the Electron ABI, but this worker runs under plain
 * Node, which would fail to load Electron-ABI binaries.
 *
 * `node:sqlite` exposes DatabaseSync with a slightly different API than
 * better-sqlite3 — no `.pragma()` method. The shim below bridges the
 * gap for migrations.js + db-functions.js which expect better-sqlite3-
 * shaped API.
 *
 * Args (via argv):
 *   process.argv[2] — absolute path to the legacy DB to create.
 *
 * Behaviour:
 *   - Opens unencrypted DB at the path.
 *   - Runs all migrations from dist/main/main/migrations.js (compiled).
 *   - Inserts: 1 company, 1 fiscal year + 13 accounting periods + verification
 *     sequence row, 5 journal_entries (status='draft' so no balance trigger).
 *
 * Exits with code 0 on success, 1 on failure (stderr has the message).
 */
'use strict'

const path = require('path')
const fs = require('fs')
const sqlite = require('node:sqlite')

const targetPath = process.argv[2]
if (!targetPath) {
  console.error('Usage: _seed-legacy-db-worker.cjs <db-path>')
  process.exit(1)
}

/**
 * Wrap node:sqlite's DatabaseSync with a better-sqlite3-compatible
 * `.pragma()` method so migrations.js + db-functions.js work unchanged.
 */
function wrapDb(db) {
  const wrapped = {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => db.prepare(sql),
    function: (name, opts, fn) => db.function(name, opts, fn),
    close: () => db.close(),
    pragma: (stmt, opts) => {
      // Write-form: "name = value" → exec
      if (stmt.includes('=')) {
        db.exec(`PRAGMA ${stmt}`)
        return undefined
      }
      // Read-form: return rows (or simple value if opts.simple=true)
      const rows = db.prepare(`PRAGMA ${stmt}`).all()
      if (opts && opts.simple) {
        if (rows.length === 0) return undefined
        const first = rows[0]
        const keys = Object.keys(first)
        return keys.length > 0 ? first[keys[0]] : undefined
      }
      return rows
    },
  }
  return wrapped
}

try {
  const repoRoot = path.resolve(__dirname, '../../..')
  const migrationsModule = require(
    path.join(repoRoot, 'dist/main/main/migrations.js'),
  )
  const dbFunctionsModule = require(
    path.join(repoRoot, 'dist/main/main/db-functions.js'),
  )
  const migrations = migrationsModule.migrations
  const registerCustomFunctions = dbFunctionsModule.registerCustomFunctions
  if (!Array.isArray(migrations)) {
    throw new Error('migrations export not found in compiled module')
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  const rawDb = new sqlite.DatabaseSync(targetPath)
  const db = wrapDb(rawDb)
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    registerCustomFunctions(db)

    // Replicate runMigrations from src/main/db.ts. Mirror the M122
    // FK-off table-recreate guards by index.
    const needsFkOff = new Set([20, 21, 22, 37, 42, 43, 44, 46])
    const currentVersion = db.pragma('user_version', { simple: true })
    for (let i = currentVersion; i < migrations.length; i++) {
      const migration = migrations[i]
      const fkOff = needsFkOff.has(i)
      if (fkOff) db.pragma('foreign_keys = OFF')
      db.exec('BEGIN EXCLUSIVE')
      try {
        db.exec(migration.sql)
        if (typeof migration.programmatic === 'function') {
          migration.programmatic(db)
        }
        db.pragma(`user_version = ${i + 1}`)
        db.exec('COMMIT')
      } catch (err) {
        try {
          db.exec('ROLLBACK')
        } catch {
          /* ignore */
        }
        throw new Error(
          `migration ${i + 1} failed: ${err && err.message ? err.message : err}`,
        )
      }
      if (fkOff) {
        db.pragma('foreign_keys = ON')
        const fkCheck = db.pragma('foreign_key_check')
        if (Array.isArray(fkCheck) && fkCheck.length > 0) {
          throw new Error(
            `migration ${i + 1} FK integrity check failed: ${JSON.stringify(fkCheck)}`,
          )
        }
      }
    }

    // ── Seed data ────────────────────────────────────────────────────
    db.exec('BEGIN IMMEDIATE')
    try {
      const companyInsert = db.prepare(
        `INSERT INTO companies (org_number, name, fiscal_rule, legal_form)
         VALUES (?, ?, 'K2', 'ab')`,
      )
      const companyId = Number(
        companyInsert.run('556036-0793', 'E11 Legacy Co AB').lastInsertRowid,
      )

      const fyInsert = db.prepare(
        `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
         VALUES (?, '2024', '2024-01-01', '2024-12-31')`,
      )
      const fyId = Number(fyInsert.run(companyId).lastInsertRowid)

      // Accounting periods (12 months) — required by trigger 7 on booked
      // entries; we seed drafts but it's cheap insurance against future
      // strictness.
      const periodInsert = db.prepare(
        `INSERT INTO accounting_periods
           (company_id, fiscal_year_id, period_number, start_date, end_date)
         VALUES (?, ?, ?, ?, ?)`,
      )
      const month = (n) => String(n).padStart(2, '0')
      const lastDay = [
        31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
      ]
      for (let m = 1; m <= 12; m++) {
        periodInsert.run(
          companyId,
          fyId,
          m,
          `2024-${month(m)}-01`,
          `2024-${month(m)}-${month(lastDay[m - 1])}`,
        )
      }

      // verification_sequences row (some migrations expect it)
      try {
        db.prepare(
          `INSERT INTO verification_sequences (fiscal_year_id, series, last_number)
           VALUES (?, 'A', 5)`,
        ).run(fyId)
      } catch {
        /* table may not exist or row may already exist post-migration */
      }

      // 1 counterparty (minimal)
      const counterpartyInsert = db.prepare(
        `INSERT INTO counterparties (type, name, company_id)
         VALUES ('customer', ?, ?)`,
      )
      try {
        counterpartyInsert.run('Acme AB', companyId)
      } catch (err) {
        // Older counterparties schema (pre-MC3) lacks company_id NOT NULL.
        db
          .prepare(
            `INSERT INTO counterparties (type, name) VALUES ('customer', ?)`,
          )
          .run('Acme AB')
      }

      // 5 journal_entries (drafts — no balance/period trigger blockers).
      const jeInsert = db.prepare(
        `INSERT INTO journal_entries
           (company_id, fiscal_year_id, journal_date, description,
            status, source_type, verification_series)
         VALUES (?, ?, ?, ?, 'draft', 'manual', 'A')`,
      )
      for (let i = 1; i <= 5; i++) {
        jeInsert.run(
          companyId,
          fyId,
          `2024-0${i}-15`,
          `Legacy seed entry #${i}`,
        )
      }

      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  } finally {
    db.close()
  }
  process.exit(0)
} catch (err) {
  console.error('seed-legacy-db worker failed:', err && err.stack ? err.stack : err)
  process.exit(1)
}
