import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { app } from 'electron'
import log from 'electron-log/main'
import { loadSettings, saveSettings } from '../utils/settings'
import { todayLocalFromNow, getNow } from '../utils/now'

/**
 * Auto-backup-service (Sprint G).
 *
 * Ansvar:
 * 1. Vid app-start (post-unlock, när DB är öppen) — om auto-backup är
 *    aktiverat OCH senaste backup är äldre än BACKUP_INTERVAL_DAYS —
 *    skapa en tyst backup till default-mappen.
 * 2. Rotera: behåll senaste BACKUP_RETAIN .db-filer, radera äldre.
 *
 * Settings-nycklar (fritt-settings.json):
 * - auto_backup_enabled: boolean (default true)
 * - last_backup_date: ISO timestamp (uppdateras av både manuell och auto)
 * - auto_backup_folder: absolute path (default: userDocuments/Fritt Bokföring/backups)
 *
 * Principer (M150): tid via getNow()/todayLocalFromNow() för
 * deterministisk test-körning.
 */

export const BACKUP_INTERVAL_DAYS = 7
export const BACKUP_RETAIN = 30

export function getDefaultBackupFolder(): string {
  return path.join(app.getPath('documents'), 'Fritt Bokföring', 'backups')
}

/** Millisekunder sedan given ISO-timestamp till nu (getNow()). */
function msSince(iso: string): number {
  return getNow().getTime() - new Date(iso).getTime()
}

export interface AutoBackupDueResult {
  due: boolean
  reason: 'never' | 'stale' | 'recent' | 'disabled'
  lastBackup: string | null
  ageDays: number | null
}

export function isAutoBackupDue(
  settings: Record<string, unknown> = loadSettings(),
): AutoBackupDueResult {
  const enabled = settings.auto_backup_enabled !== false // default true
  if (!enabled) {
    return {
      due: false,
      reason: 'disabled',
      lastBackup: null,
      ageDays: null,
    }
  }
  const last = settings.last_backup_date
  if (typeof last !== 'string' || !last) {
    return { due: true, reason: 'never', lastBackup: null, ageDays: null }
  }
  const ageMs = msSince(last)
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24))
  if (ageDays >= BACKUP_INTERVAL_DAYS) {
    return { due: true, reason: 'stale', lastBackup: last, ageDays }
  }
  return { due: false, reason: 'recent', lastBackup: last, ageDays }
}

/**
 * Radera äldsta .db-filer i folder så bara `retain` senaste kvarstår.
 * Sorterar på mtime (stabilt för både manuella och auto-backups).
 * Returnerar antal raderade filer.
 */
export function rotateBackups(folder: string, retain = BACKUP_RETAIN): number {
  if (!fs.existsSync(folder)) return 0
  const files = fs
    .readdirSync(folder)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const full = path.join(folder, f)
      return { path: full, mtime: fs.statSync(full).mtimeMs }
    })
    .sort((a, b) => b.mtime - a.mtime) // Nyaste först

  const toDelete = files.slice(retain)
  let deleted = 0
  for (const f of toDelete) {
    try {
      fs.unlinkSync(f.path)
      deleted++
    } catch (err) {
      log.warn(
        `[auto-backup] Kunde inte radera gammal backup ${f.path}:`,
        err,
      )
    }
  }
  return deleted
}

/**
 * Dependencies som kan injekteras för testbarhet. Default-implementationer
 * läser/skriver settings från userData (kräver Electron app-runtime).
 */
export interface AutoBackupDeps {
  loadSettings?: () => Record<string, unknown>
  saveSettings?: (data: Record<string, unknown>) => void
  getDefaultFolder?: () => string
}

/**
 * Skapar en auto-backup till default-mappen om det är dags. Tyst —
 * loggar endast via electron-log och uppdaterar settings.last_backup_date.
 * Anropas efter DB är öppen (post-unlock).
 *
 * Returnerar true om backup skapades, false annars.
 *
 * Deps är injekteringsbar för vitest-testning utan Electron-runtime.
 */
export async function performAutoBackupIfDue(
  db: Database.Database,
  deps: AutoBackupDeps = {},
): Promise<boolean> {
  const loadFn = deps.loadSettings ?? loadSettings
  const saveFn = deps.saveSettings ?? saveSettings
  const defaultFolderFn = deps.getDefaultFolder ?? getDefaultBackupFolder

  const settings = loadFn()
  const check = isAutoBackupDue(settings)
  if (!check.due) {
    log.info(
      `[auto-backup] Ej dags (${check.reason}, ålder=${check.ageDays} dagar)`,
    )
    return false
  }

  const folder =
    (typeof settings.auto_backup_folder === 'string' &&
      settings.auto_backup_folder) ||
    defaultFolderFn()

  try {
    fs.mkdirSync(folder, { recursive: true })
  } catch (err) {
    log.error(
      `[auto-backup] Kunde inte skapa backup-mapp ${folder}:`,
      err,
    )
    return false
  }

  const filename = `fritt-bokforing-auto-${todayLocalFromNow()}.db`
  const filePath = path.join(folder, filename)

  try {
    await db.backup(filePath)
    const now = getNow().toISOString()
    saveFn({ ...settings, last_backup_date: now })
    log.info(`[auto-backup] Skapade backup: ${filePath}`)
  } catch (err) {
    log.error('[auto-backup] Backup misslyckades:', err)
    return false
  }

  const deleted = rotateBackups(folder)
  if (deleted > 0) {
    log.info(`[auto-backup] Roterade bort ${deleted} gamla backups`)
  }

  return true
}
