// Legacy-DB migration — detects the pre-auth unencrypted `data.db` left
// from versions before ADR 004, copies its contents into the user's
// encrypted DB via `sqlcipher_export`, and archives the original file so
// subsequent launches don't re-prompt. See ADR 004 §9.
//
// All functions here are pure given their inputs — they take explicit paths
// and keys rather than resolving from electron `app.getPath` — so they can
// be unit-tested under vitest.

import Database from 'better-sqlite3-multiple-ciphers'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Default location of the pre-ADR-004 unencrypted DB on production
 * installations. Callers pass this explicitly so tests can override.
 */
export function legacyDbDefaultPath(documentsDir: string): string {
  return path.join(documentsDir, 'Fritt Bokföring', 'data.db')
}

export function hasLegacyDb(legacyPath: string): boolean {
  return fs.existsSync(legacyPath) && fs.statSync(legacyPath).isFile()
}

/**
 * Copy an unencrypted legacy DB into a fresh encrypted DB file.
 *
 * NOTE: `better-sqlite3-multiple-ciphers` is not compiled with the
 * `sqlcipher_export` extension, so we can't use the standard one-liner
 * export. Instead we do a manual schema + data copy via ATTACH from the
 * encrypted (main) connection to the legacy (plaintext) side.
 *
 * Contract:
 *   - `legacyPath` must exist and be a plaintext SQLite DB
 *   - `encryptedPath` must NOT exist — we create a fresh encrypted file
 *     here. Caller removes any previous attempt first.
 *   - After this returns, `encryptedPath` contains a full copy of the
 *     legacy schema + data, encrypted with `masterKey`, with
 *     `user_version` preserved from the source. The caller should then
 *     open it with `openEncryptedDb` which will run any subsequent
 *     migrations forward.
 *
 * Why ATTACH from encrypted-main side: if we open the encrypted DB with
 * cipher + key FIRST, then ATTACH plaintext with `KEY ''`, the sqlcipher
 * engine correctly treats the attached DB as plaintext. Going the other
 * direction (plaintext main, attach encrypted) also works but complicates
 * schema introspection because `sqlite_master` on the attached side must
 * be qualified and DDL cannot target attached databases. Simpler to keep
 * DDL on `main` (the encrypted target).
 */
export function migrateLegacyToEncrypted(
  legacyPath: string,
  encryptedPath: string,
  masterKey: Buffer,
): void {
  if (masterKey.length !== 32) {
    throw new Error('masterKey must be 32 bytes')
  }
  if (!hasLegacyDb(legacyPath)) {
    throw new Error(`legacy DB not found at ${legacyPath}`)
  }
  if (fs.existsSync(encryptedPath)) {
    throw new Error(
      `encrypted target already exists at ${encryptedPath} — remove it first`,
    )
  }

  fs.mkdirSync(path.dirname(encryptedPath), { recursive: true })
  const keyHex = masterKey.toString('hex')

  // 1. Create a fresh encrypted DB with the right cipher + key.
  const target = new Database(encryptedPath)
  try {
    target.pragma(`cipher='sqlcipher'`)
    target.pragma(`key="x'${keyHex}'"`)
    target.pragma('journal_mode = WAL')
    target.pragma('foreign_keys = OFF') // off during bulk load — re-enabled on reopen

    // 2. Attach legacy as plaintext.
    const legacyAttachPath = legacyPath.replace(/'/g, "''")
    target.exec(`ATTACH DATABASE '${legacyAttachPath}' AS legacy KEY ''`)

    // 3. Copy schema in the order: tables → indexes → views → triggers.
    // `sqlite_autoindex_*` and `sqlite_sequence` are auto-managed — skip.
    target.exec('BEGIN IMMEDIATE')
    try {
      const objects = target
        .prepare(
          `SELECT type, name, sql
             FROM legacy.sqlite_master
            WHERE sql IS NOT NULL
              AND name NOT LIKE 'sqlite_%'
            ORDER BY CASE type
              WHEN 'table' THEN 1
              WHEN 'index' THEN 2
              WHEN 'view'  THEN 3
              WHEN 'trigger' THEN 4
              ELSE 5
            END`,
        )
        .all() as { type: string; name: string; sql: string }[]

      for (const obj of objects) {
        if (obj.type === 'table') {
          target.exec(obj.sql)
        }
      }

      // 4. Copy row data for every table (before indexes/triggers so
      // inserts don't trigger legacy triggers against the target).
      const tables = objects.filter((o) => o.type === 'table')
      for (const t of tables) {
        const ident = `"${t.name.replace(/"/g, '""')}"`
        target.exec(`INSERT INTO main.${ident} SELECT * FROM legacy.${ident}`)
      }

      // 5. Now create indexes, views, triggers (after data is in place).
      for (const obj of objects) {
        if (obj.type !== 'table') {
          target.exec(obj.sql)
        }
      }

      // 6. Preserve `user_version` so subsequent migrations start from the
      // legacy's point forward and don't re-apply completed migrations.
      // `PRAGMA <schema>.user_version` reads from the attached DB.
      const legacyVersion = target.pragma('legacy.user_version', {
        simple: true,
      }) as number
      if (typeof legacyVersion === 'number') {
        target.pragma(`user_version = ${legacyVersion}`)
      }

      target.exec('COMMIT')
    } catch (err) {
      try {
        target.exec('ROLLBACK')
      } catch {
        // ignore — main error takes priority
      }
      throw err
    }

    target.exec('DETACH DATABASE legacy')
  } finally {
    target.close()
  }
}

/**
 * Move the legacy file to the given archive path. Used to stop the
 * "migrate?" prompt from showing on subsequent launches.
 *
 * Uses rename first (cheap, atomic on same filesystem). Falls back to
 * copy+delete if rename fails (cross-filesystem — e.g. backup dir is on
 * a different mount).
 */
export function archiveLegacyDb(
  legacyPath: string,
  archivePath: string,
): void {
  fs.mkdirSync(path.dirname(archivePath), { recursive: true })
  try {
    fs.renameSync(legacyPath, archivePath)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      fs.copyFileSync(legacyPath, archivePath)
      fs.unlinkSync(legacyPath)
      return
    }
    throw err
  }
  // Archive also sidecar WAL/SHM files if present (same dir, same basename).
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = legacyPath + suffix
    if (fs.existsSync(sidecar)) {
      try {
        fs.renameSync(sidecar, archivePath + suffix)
      } catch {
        // best-effort — main file is already archived, sidecars are not
        // load-bearing for forensics
      }
    }
  }
}

/**
 * Derive the archive path for a legacy DB: same filename inside the
 * user's backups directory, suffixed with a timestamp so multiple
 * migrations don't collide (should never happen but defense-in-depth).
 */
export function defaultArchivePath(
  legacyPath: string,
  userBackupsDir: string,
  now: Date = new Date(),
): string {
  const stamp = now.toISOString().replace(/[:]/g, '-').slice(0, 19)
  return path.join(
    userBackupsDir,
    `pre-encryption-${stamp}-${path.basename(legacyPath)}`,
  )
}
