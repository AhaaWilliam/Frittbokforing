import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import Database from 'better-sqlite3'

const { mockGetPath, mockGetDb } = vi.hoisted(() => ({
  mockGetPath: vi.fn(),
  mockGetDb: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { getPath: mockGetPath },
}))

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

vi.mock('../src/main/db', () => ({
  getDb: (...args: unknown[]) => mockGetDb(...args),
}))

import { createPreUpdateBackup } from '../src/main/pre-update-backup'

const TEST_DIR = path.join(os.tmpdir(), 'fritt-backup-test')
const TEST_DOCS_DIR = path.join(TEST_DIR, 'documents')
const TEST_DB_PATH = path.join(TEST_DIR, 'test.db')

describe('createPreUpdateBackup', () => {
  let testDb: Database.Database

  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true })
    testDb = new Database(TEST_DB_PATH)
    testDb.exec('CREATE TABLE IF NOT EXISTS test_data (id INTEGER PRIMARY KEY, val TEXT)')
    testDb.exec("INSERT INTO test_data (val) VALUES ('backup-test')")
    mockGetPath.mockReturnValue(TEST_DOCS_DIR)
    mockGetDb.mockReturnValue(testDb)
  })

  afterEach(() => {
    try {
      testDb?.close()
    } catch {
      // already closed
    }
    fs.rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('should create a backup file and return the path', () => {
    const backupPath = createPreUpdateBackup()
    expect(fs.existsSync(backupPath)).toBe(true)
    expect(backupPath).toContain('pre-update-')
    expect(backupPath).toMatch(/\.db$/)

    // Verify backup is a valid database with our test data
    const backupDb = new Database(backupPath, { readonly: true })
    const row = backupDb.prepare('SELECT val FROM test_data').get() as { val: string }
    expect(row.val).toBe('backup-test')
    backupDb.close()
  })

  it('should throw (not swallow) when database is inaccessible', () => {
    // Close the database to make VACUUM INTO fail
    testDb.close()

    expect(() => createPreUpdateBackup()).toThrow()
  })

  it('should throw when target directory is not writable', () => {
    mockGetPath.mockReturnValue('/nonexistent-root-path/no-access')

    expect(() => createPreUpdateBackup()).toThrow()
  })
})
