import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import log from 'electron-log'
import { getDb } from './db'

/** Skapar VACUUM-backup av databasen innan auto-update installeras.
 *  Kastar exception vid fel — anroparen ansvarar för att avbryta uppdateringen. */
export function createPreUpdateBackup(): string {
  const db = getDb()
  const docsDir = path.join(
    app.getPath('documents'),
    'Fritt Bokföring',
    'backups',
  )
  fs.mkdirSync(docsDir, { recursive: true })
  const backupPath = path.join(
    docsDir,
    `pre-update-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.db`,
  )
  db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`)
  log.info('Pre-update backup skapad:', backupPath)
  return backupPath
}
