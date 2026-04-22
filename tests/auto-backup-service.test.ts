// Sprint G: auto-backup-service — isAutoBackupDue + rotateBackups
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  isAutoBackupDue,
  rotateBackups,
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
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })
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
