import { dialog, BrowserWindow, app } from 'electron'
import BetterSqlite3 from 'better-sqlite3'
import type Database from 'better-sqlite3'
import fs from 'fs'
import { getE2EFilePath, getE2EMockOpenFile } from '../utils/e2e-helpers'
import { todayLocalFromNow, localTimestampFromNow } from '../utils/now'
import { migrations, NEEDS_FK_OFF } from '../migrations'
import { closeDb } from '../db'
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
      const needsFkOff = NEEDS_FK_OFF.has(i)
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

  // E2E dialog bypass — use E2E_MOCK_OPEN_FILE for arbitrary-filename open
  // dialogs (same pattern as SIE4 import, M147).
  const e2eOpenPath = getE2EMockOpenFile()
  let selectedPath: string

  if (e2eOpenPath) {
    selectedPath = e2eOpenPath
  } else {
    const result = await dialog.showOpenDialog(win!, {
      title: 'Välj säkerhetskopia att återställa',
      filters: [{ name: 'SQLite-databas', extensions: ['db', 'sqlite'] }],
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

  // Use db.name (the actual open connection path) not getDbPath() (legacy path).
  // After Sprint T auth, db is always the per-user vault DB at
  // <userData>/auth/users/<userId>/app.db — not the legacy Documents/data.db.
  const dbPath = db.name
  const walPath = `${dbPath}-wal`
  const shmPath = `${dbPath}-shm`
  const restoringPath = `${dbPath}.restoring`
  const timestamp = localTimestampFromNow().replace(/[:.]/g, '-')
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

    // Step 4: Pre-restore backup of current database via db.backup() (B1)
    // db.backup() använder better-sqlite3:s online-backup-API som tar ett
    // konsekvent snapshot utan att behöva stänga DB-handtaget. Detta är
    // säkrare än copyFileSync + WAL/SHM-kopiering som riskerar inkonsekvent
    // state om WAL inte är checkpointad.
    await db.backup(preRestorePath)

    // Step 5: Close app DB handle
    closeDb()

    // Step 6: Atomic rename
    fs.renameSync(restoringPath, dbPath)
    // Clean up WAL/SHM from old DB (new DB starts fresh)
    try {
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath)
    } catch (err) {
      log.warn('[backup] WAL cleanup failed:', err)
    }
    try {
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath)
    } catch (err) {
      log.warn('[backup] SHM cleanup failed:', err)
    }

    log.info('[backup] Restore complete, relaunching app')

    // Step 7: Relaunch
    app.relaunch()
    app.exit(0)

    // Unreachable after exit, but satisfies return type
    return { restored: true }
  } catch (err) {
    // Lämna kvar .restoring-filen för manuell återhämtning (B1).
    // Om closeDb() hann köras men rename misslyckades finns .restoring-filen
    // kvar som enda kopia av backup-databasen — ta inte bort den.
    // Filen kan återställas manuellt av användaren eller supporten.
    log.warn(
      '[backup] Restore failed — leaving .restoring file for manual recovery:',
      restoringPath,
    )

    log.error('[backup] Restore failed:', err)
    return {
      restored: false,
      message:
        'Återställningen misslyckades. Se applikationsloggen för detaljer.',
    }
  }
}
