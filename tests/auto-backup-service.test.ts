// Sprint G: auto-backup-service — isAutoBackupDue + rotateBackups
// Sprint K: integration-test för performAutoBackupIfDue
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  isAutoBackupDue,
  rotateBackups,
  performAutoBackupIfDue,
  BACKUP_INTERVAL_DAYS,
  BACKUP_RETAIN,
} from '../src/main/services/auto-backup-service'

// FRITT_NOW respekteras av getNow() (M150)
const FIXED_NOW = '2026-04-22T12:00:00Z'

beforeEach(() => {
  process.env.FRITT_TEST = '1'
  process.env.FRITT_NOW = FIXED_NOW
})

afterEach(() => {
  delete process.env.FRITT_NOW
})

describe('isAutoBackupDue', () => {
  it('reason=disabled när auto_backup_enabled=false', () => {
    const r = isAutoBackupDue({ auto_backup_enabled: false })
    expect(r.due).toBe(false)
    expect(r.reason).toBe('disabled')
  })

  it('reason=never när last_backup_date saknas', () => {
    const r = isAutoBackupDue({})
    expect(r.due).toBe(true)
    expect(r.reason).toBe('never')
    expect(r.lastBackup).toBeNull()
  })

  it('reason=never när auto enabled men ingen tidigare backup', () => {
    const r = isAutoBackupDue({ auto_backup_enabled: true })
    expect(r.due).toBe(true)
    expect(r.reason).toBe('never')
  })

  it('reason=recent när senaste backup är < 7 dagar gammal', () => {
    // 3 dagar före FIXED_NOW
    const last = '2026-04-19T12:00:00Z'
    const r = isAutoBackupDue({ last_backup_date: last })
    expect(r.due).toBe(false)
    expect(r.reason).toBe('recent')
    expect(r.ageDays).toBe(3)
  })

  it('reason=stale när senaste backup är ≥ 7 dagar gammal', () => {
    // Exakt 7 dagar
    const last = '2026-04-15T12:00:00Z'
    const r = isAutoBackupDue({ last_backup_date: last })
    expect(r.due).toBe(true)
    expect(r.reason).toBe('stale')
    expect(r.ageDays).toBe(BACKUP_INTERVAL_DAYS)
  })

  it('default: auto_backup_enabled saknas tolkas som enabled', () => {
    const r = isAutoBackupDue({ last_backup_date: '2000-01-01T00:00:00Z' })
    expect(r.due).toBe(true) // stale
    expect(r.reason).toBe('stale')
  })

  it('explicit auto_backup_enabled=true beter sig som default', () => {
    const r = isAutoBackupDue({
      auto_backup_enabled: true,
      last_backup_date: '2000-01-01T00:00:00Z',
    })
    expect(r.due).toBe(true)
    expect(r.reason).toBe('stale')
  })
})

describe('rotateBackups', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-backup-test-'))
  })

  afterEach(() => {
    if (fs.existsSync(tempDir))
      fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('returnerar 0 om mappen inte finns', () => {
    const deleted = rotateBackups(path.join(tempDir, 'nonexistent'))
    expect(deleted).toBe(0)
  })

  it('bevarar alla filer om antal ≤ retain', () => {
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(path.join(tempDir, `b-${i}.db`), '')
    }
    const deleted = rotateBackups(tempDir, 10)
    expect(deleted).toBe(0)
    expect(fs.readdirSync(tempDir).length).toBe(5)
  })

  it('raderar äldsta filer bortom retain', () => {
    // Skapa 5 filer med stigande mtime
    for (let i = 0; i < 5; i++) {
      const p = path.join(tempDir, `b-${i}.db`)
      fs.writeFileSync(p, '')
      // mtime = i timmar från nu (äldre först)
      const mtime = new Date(Date.now() - (5 - i) * 3600_000)
      fs.utimesSync(p, mtime, mtime)
    }
    const deleted = rotateBackups(tempDir, 2)
    expect(deleted).toBe(3)
    // De 2 nyaste ska kvarstå (b-3 och b-4 med högst i)
    const remaining = fs.readdirSync(tempDir).sort()
    expect(remaining).toEqual(['b-3.db', 'b-4.db'])
  })

  it('ignorerar filer utan .db-extension', () => {
    fs.writeFileSync(path.join(tempDir, 'other.txt'), '')
    fs.writeFileSync(path.join(tempDir, 'backup.db'), '')
    const deleted = rotateBackups(tempDir, 0)
    expect(deleted).toBe(1) // bara backup.db räknas
    expect(fs.existsSync(path.join(tempDir, 'other.txt'))).toBe(true)
  })

  it('default BACKUP_RETAIN är 30', () => {
    expect(BACKUP_RETAIN).toBe(30)
  })
})

describe('performAutoBackupIfDue — integration', () => {
  let tempDir: string
  let db: Database.Database
  let settingsState: Record<string, unknown>

  function makeDeps(folder: string) {
    return {
      loadSettings: () => settingsState,
      saveSettings: (data: Record<string, unknown>) => {
        settingsState = data
      },
      getDefaultFolder: () => folder,
    }
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perform-auto-backup-'))
    db = new Database(':memory:')
    db.exec(
      "CREATE TABLE marker (id INTEGER PRIMARY KEY, label TEXT); INSERT INTO marker(id, label) VALUES (1, 'hej');",
    )
    settingsState = {}
  })

  afterEach(() => {
    db.close()
    if (fs.existsSync(tempDir))
      fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('skapar backup när ingen tidigare finns (reason=never)', async () => {
    const folder = path.join(tempDir, 'backups')
    const result = await performAutoBackupIfDue(db, makeDeps(folder))
    expect(result).toBe(true)
    const files = fs.readdirSync(folder).filter((f) => f.endsWith('.db'))
    expect(files.length).toBe(1)
    expect(files[0]).toMatch(/^fritt-bokforing-auto-\d{4}-\d{2}-\d{2}\.db$/)
    expect(settingsState.last_backup_date).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    )
  })

  it('skapar backup när senaste är > 7 dagar gammal', async () => {
    settingsState = { last_backup_date: '2000-01-01T00:00:00Z' }
    const folder = path.join(tempDir, 'backups')
    const result = await performAutoBackupIfDue(db, makeDeps(folder))
    expect(result).toBe(true)
    expect(fs.readdirSync(folder).length).toBe(1)
    // last_backup_date uppdaterad till något nytt
    expect(settingsState.last_backup_date).not.toBe('2000-01-01T00:00:00Z')
  })

  it('skapar INTE backup när senaste är färsk (< 7 dagar)', async () => {
    // Simulera backup för 3 dagar sedan via FRITT_NOW
    process.env.FRITT_NOW = '2026-04-22T12:00:00Z'
    settingsState = { last_backup_date: '2026-04-19T12:00:00Z' }
    const folder = path.join(tempDir, 'backups')
    const result = await performAutoBackupIfDue(db, makeDeps(folder))
    expect(result).toBe(false)
    expect(fs.existsSync(folder)).toBe(false)
    // last_backup_date orörd
    expect(settingsState.last_backup_date).toBe('2026-04-19T12:00:00Z')
    delete process.env.FRITT_NOW
  })

  it('skapar INTE backup när auto_backup_enabled=false', async () => {
    settingsState = { auto_backup_enabled: false }
    const folder = path.join(tempDir, 'backups')
    const result = await performAutoBackupIfDue(db, makeDeps(folder))
    expect(result).toBe(false)
    expect(fs.existsSync(folder)).toBe(false)
  })

  it('respekterar settings.auto_backup_folder om satt', async () => {
    const customFolder = path.join(tempDir, 'custom-backups')
    settingsState = { auto_backup_folder: customFolder }
    const defaultFolder = path.join(tempDir, 'default-unused')
    const result = await performAutoBackupIfDue(db, makeDeps(defaultFolder))
    expect(result).toBe(true)
    expect(fs.existsSync(customFolder)).toBe(true)
    expect(fs.existsSync(defaultFolder)).toBe(false)
  })

  it('backup-fil innehåller samma data som käll-DB (roundtrip)', async () => {
    const folder = path.join(tempDir, 'backups')
    await performAutoBackupIfDue(db, makeDeps(folder))
    const files = fs.readdirSync(folder).filter((f) => f.endsWith('.db'))
    const backupPath = path.join(folder, files[0])
    const restored = new Database(backupPath, { readonly: true })
    const row = restored
      .prepare('SELECT label FROM marker WHERE id = 1')
      .get() as { label: string } | undefined
    expect(row?.label).toBe('hej')
    restored.close()
  })

  it('roterar gamla backups när över BACKUP_RETAIN', async () => {
    // Skapa 31 dummy-filer äldre än den nya kommande backupen
    const folder = path.join(tempDir, 'backups')
    fs.mkdirSync(folder, { recursive: true })
    for (let i = 0; i < 31; i++) {
      const p = path.join(folder, `fritt-old-${i}.db`)
      fs.writeFileSync(p, '')
      const mtime = new Date(Date.now() - (31 - i) * 60_000)
      fs.utimesSync(p, mtime, mtime)
    }
    await performAutoBackupIfDue(db, makeDeps(folder))
    const files = fs.readdirSync(folder).filter((f) => f.endsWith('.db'))
    // 31 gamla + 1 ny - rotation till 30 = 30
    expect(files.length).toBe(BACKUP_RETAIN)
    // Äldsta (index 0) ska vara borta
    expect(files).not.toContain('fritt-old-0.db')
  })
})
