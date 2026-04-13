import { dialog, BrowserWindow } from 'electron'
import type Database from 'better-sqlite3'
import { getE2EFilePath } from '../utils/e2e-helpers'
import { todayLocal } from '../../shared/date-utils'

export async function createBackup(
  db: Database.Database,
): Promise<{ filePath: string | null }> {
  const defaultFilename = `fritt-bokforing-backup-${todayLocal()}.db`

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
