import { dialog, BrowserWindow, app } from 'electron'
import BetterSqlite3 from 'better-sqlite3'
import type Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { getE2EFilePath } from '../utils/e2e-helpers'
import { getNow, todayLocalFromNow } from '../utils/now'
import { migrations } from '../migrations'
import { closeDb, getDbPath } from '../db'
import log from 'electron-log/main'

export async function createBackup(
  db: Database.Database,
): Promise<{ filePath: string | null }> {
  const defaultFilename = `fritt-bokforing-backup-${todayLocalFromNow()}.db`

  // E2E dialog bypass (M63)
  const e2ePath = getE2EFilePath(defaultFilename, 'save')
  if (e2ePath) {
    await db.backup(e2ePath)
    return { filePath: e2ePath }
  }

  const win =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const result = await dialog.showSaveDialog(win!, {
    title: 'Spara säkerhetskopia',
    defaultPath: defaultFilename,
    filters: [{ name: 'SQLite Database', extensions: ['db'] }],
  })

  if (result.canceled || !result.filePath) return { filePath: null }

  await db.backup(result.filePath)

  return { filePath: result.filePath }
}

// ── Restore ─────────────────────────────────────────────────────────────

interface RestoreResult {
  restored: boolean
  message?: string
}

/**
 * Validate a potential backup file without modifying anything.
 * Opens in READ_ONLY mode. Returns error string or null if valid.
 */
function validateBackupFile(filePath: string): string | null {
  let tempDb: BetterSqlite3.Database | null = null
  try {
    tempDb = new BetterSqlite3(filePath, { readonly: true })
  } catch {
    return 'Filen är inte en giltig SQLite-databas.'
  }

  try {
    // Check user_version
    const version = tempDb.pragma('user_version', { simple: true }) as number
    if (version > migrations.length) {
      return `Backupen är från en nyare version av appen (version ${version}, aktuell: ${migrations.length}). Uppgradera appen först.`
    }

    // Check it's a Fritt Bokföring database
    const tables = tempDb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='companies'",
      )
      .all()
    if (tables.length === 0) {
      return 'Filen är inte en Fritt Bokföring-databas (saknar companies-tabell).'
    }

    // Integrity check
    const integrity = tempDb.pragma('integrity_check', {
      simple: true,
    }) as string
    if (integrity !== 'ok') {
      return 'Databasfilen är korrupt.'
    }

    return null // valid
  } finally {
    tempDb.close()
  }
}

/**
 * Run migrations on a database file opened read-write.
 * Used for upgrading older backups to current schema.
 */
function runMigrationsOnFile(filePath: string): void {
  const tempDb = new BetterSqlite3(filePath)
  try {
    tempDb.pragma('journal_mode = WAL')
    tempDb.pragma('foreign_keys = ON')

    const currentVersion = tempDb.pragma('user_version', {
      simple: true,
    }) as number

    for (let i = currentVersion; i < migrations.length; i++) {
      const migration = migrations[i]
      const needsFkOff = i === 20 || i === 21 || i === 22
      if (needsFkOff) tempDb.pragma('foreign_keys = OFF')

      tempDb.exec('BEGIN EXCLUSIVE')
      try {
        tempDb.exec(migration.sql)
        if (migration.programmatic) {
          migration.programmatic(tempDb)
        }
        tempDb.pragma(`user_version = ${i + 1}`)
        tempDb.exec('COMMIT')
      } catch (err) {
        tempDb.exec('ROLLBACK')
        throw err
      }

      if (needsFkOff) {
        tempDb.pragma('foreign_keys = ON')
        const fkCheck = tempDb.pragma('foreign_key_check') as unknown[]
        if (fkCheck.length > 0) {
          throw new Error(
            `Migration ${i + 1} FK check failed: ${JSON.stringify(fkCheck)}`,
          )
        }
      }
    }
  } finally {
    tempDb.close()
  }
}

/**
 * Full restore flow:
 * 1. Show open dialog (file selection in main process — F52 security)
 * 2. Validate the selected file
 * 3. Create pre-restore backup
 * 4. Copy to .restoring temp file
 * 5. Run migrations if needed
 * 6. WAL checkpoint + close app DB
 * 7. Atomic rename
 * 8. Relaunch app
 */
export async function restoreBackup(
  db: Database.Database,
): Promise<RestoreResult> {
  const win =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

  // E2E dialog bypass
  const e2ePath = getE2EFilePath('', 'open')
  let selectedPath: string | null = null

  if (e2ePath) {
    selectedPath = e2ePath
  } else {
    const result = await dialog.showOpenDialog(win!, {
      title: 'Välj säkerhetskopia att återställa',
      filters: [
        { name: 'SQLite-databas', extensions: ['db', 'sqlite'] },
      ],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { restored: false }
    }
    selectedPath = result.filePaths[0]
  }

  // Step 1: Validate
  const validationError = validateBackupFile(selectedPath)
  if (validationError) {
    return { restored: false, message: validationError }
  }

  const dbPath = getDbPath()
  const restoringPath = `${dbPath}.restoring`
  const timestamp = getNow()
    .toISOString()
    .slice(0, 19)
    .replace(/[:.]/g, '-')
  const preRestorePath = `${dbPath}.pre-restore-${timestamp}.db`

  try {
    // Step 2: Copy backup to temp
    fs.copyFileSync(selectedPath, restoringPath)

    // Step 3: Run migrations on temp if needed
    const tempDb = new BetterSqlite3(restoringPath, { readonly: true })
    const backupVersion = tempDb.pragma('user_version', {
      simple: true,
    }) as number
    tempDb.close()

    if (backupVersion < migrations.length) {
      log.info(
        `[backup] Upgrading backup from version ${backupVersion} to ${migrations.length}`,
      )
      runMigrationsOnFile(restoringPath)
    }

    // Step 4: Pre-restore backup of current database
    db.pragma('wal_checkpoint(TRUNCATE)')
    fs.copyFileSync(dbPath, preRestorePath)
    // Also copy WAL/SHM if they exist
    const walPath = `${dbPath}-wal`
    const shmPath = `${dbPath}-shm`
    if (fs.existsSync(walPath)) {
      fs.copyFileSync(walPath, `${preRestorePath}-wal`)
    }
    if (fs.existsSync(shmPath)) {
      fs.copyFileSync(shmPath, `${preRestorePath}-shm`)
    }

    // Step 5: Close app DB handle
    closeDb()

    // Step 6: Atomic rename
    fs.renameSync(restoringPath, dbPath)
    // Clean up WAL/SHM from old DB (new DB starts fresh)
    try {
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath)
    } catch { /* best effort */ }
    try {
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath)
    } catch { /* best effort */ }

    log.info('[backup] Restore complete, relaunching app')

    // Step 7: Relaunch
    app.relaunch()
    app.exit(0)

    // Unreachable after exit, but satisfies return type
    return { restored: true }
  } catch (err) {
    // Cleanup temp file
    try {
      if (fs.existsSync(restoringPath)) fs.unlinkSync(restoringPath)
    } catch { /* best effort */ }

    const msg =
      err instanceof Error ? err.message : 'Okänt fel vid återställning'
    log.error('[backup] Restore failed:', msg)
    return { restored: false, message: `Återställningen misslyckades: ${msg}` }
  }
}
