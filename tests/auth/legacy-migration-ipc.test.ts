/**
 * Integration test for the legacy-migration IPC handlers. Exercises the
 * full path: createUser → onUnlock (opens encrypted DB) → legacy-check
 * → legacy-import → archive. No Electron, no real filesystem for docs —
 * all paths are tmp.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import Database from 'better-sqlite3-multiple-ciphers'
import { createAuthService } from '../../src/main/auth/auth-service'
import { createKeyStore, type KeyStore } from '../../src/main/auth/key-store'
import { createRateLimiter } from '../../src/main/auth/rate-limiter'
import { UserVault } from '../../src/main/auth/user-vault'
import { closeDb, openEncryptedDb } from '../../src/main/db'
import type { IpcResult } from '../../src/shared/types'

const FAST_KDF = {
  memorySize: 1024,
  iterations: 1,
  parallelism: 1,
  hashLength: 32,
}

type Handler = (event: unknown, raw: unknown) => Promise<IpcResult<unknown>>
const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
  ipcMain: {
    handle: (channel: string, fn: Handler) => {
      handlers.set(channel, fn)
    },
  },
}))

vi.mock('electron-log', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

// Stub ipc-handlers.runPostUnlockStartup — pulls in a huge import graph
// that requires an open DB with full schema. We don't exercise it here.
vi.mock('../../src/main/ipc-handlers', () => ({
  runPostUnlockStartup: () => {},
}))

let tmpRoot: string
let legacyPath: string
let vault: UserVault
let keyStore: KeyStore

async function invoke<T>(
  channel: string,
  payload: unknown = {},
): Promise<IpcResult<T>> {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`handler ${channel} not registered`)
  return (await fn({}, payload)) as IpcResult<T>
}

function seedLegacy(p: string): void {
  const db = new Database(p)
  // user_version stays at 0 — migrations re-run from scratch after copy.
  // Our ad-hoc `stuff` table is preserved alongside whatever migrations create.
  db.exec('CREATE TABLE stuff (id INTEGER PRIMARY KEY, v TEXT)')
  db.prepare('INSERT INTO stuff (v) VALUES (?)').run('legacy-data-xyz')
  db.close()
}

beforeEach(async () => {
  handlers.clear()
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-ipc-'))
  legacyPath = path.join(tmpRoot, 'Fritt Bokföring', 'data.db')
  fs.mkdirSync(path.dirname(legacyPath), { recursive: true })

  vault = new UserVault(path.join(tmpRoot, 'vault'))
  vault.ensureRoot()
  keyStore = createKeyStore()
  const rateLimiter = createRateLimiter()
  const service = createAuthService({
    vault,
    keyStore,
    rateLimiter,
    now: () => Date.now(),
    kdfParams: FAST_KDF,
  })

  const { registerAuthIpcHandlers } =
    await import('../../src/main/auth/auth-handlers')
  registerAuthIpcHandlers(service, keyStore, {
    onUnlock: (userId) => {
      const encryptedPath = vault.dbPath(userId)
      fs.mkdirSync(path.dirname(encryptedPath), { recursive: true })
      openEncryptedDb(encryptedPath, keyStore.getKey())
    },
    onLock: () => {
      closeDb()
    },
    legacyDbPath: legacyPath,
    vault,
  })
})

afterEach(() => {
  keyStore.lock()
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('auth:legacy-check', () => {
  it('returns exists=false when no legacy file', async () => {
    const res = await invoke<{ exists: boolean; path: string | null }>(
      'auth:legacy-check',
    )
    expect(res.success).toBe(true)
    if (res.success) expect(res.data.exists).toBe(false)
  })

  it('returns exists=true when legacy file present', async () => {
    seedLegacy(legacyPath)
    const res = await invoke<{ exists: boolean; path: string | null }>(
      'auth:legacy-check',
    )
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.exists).toBe(true)
      expect(res.data.path).toBe(legacyPath)
    }
  })
})

describe('auth:legacy-import', () => {
  it('imports legacy data into the user encrypted DB and archives original', async () => {
    seedLegacy(legacyPath)

    const created = await invoke<{ user: { id: string } }>('auth:create-user', {
      displayName: 'Alice',
      password: 'password-12345678',
    })
    if (!created.success) throw new Error(`setup: ${JSON.stringify(created)}`)
    const userId = created.data.user.id

    const res = await invoke<{ ok: true; archivedTo: string }>(
      'auth:legacy-import',
    )
    if (!res.success) throw new Error(`import failed: ${JSON.stringify(res)}`)
    expect(res.data.archivedTo).toContain('pre-encryption-')

    // Legacy file should be gone (archived).
    expect(fs.existsSync(legacyPath)).toBe(false)
    expect(fs.existsSync(res.data.archivedTo)).toBe(true)

    // Encrypted DB should contain the legacy row.
    const K = keyStore.getKey()
    const db = new Database(vault.dbPath(userId), { readonly: true })
    db.pragma(`cipher='sqlcipher'`)
    db.pragma(`key="x'${K.toString('hex')}'"`)
    const row = db.prepare('SELECT v FROM stuff WHERE id = 1').get() as {
      v: string
    }
    db.close()
    expect(row.v).toBe('legacy-data-xyz')
  })

  it('fails when locked', async () => {
    seedLegacy(legacyPath)
    // No create-user — keystore is locked.
    const res = await invoke('auth:legacy-import')
    expect(res.success).toBe(false)
    if (!res.success) expect(res.code).toBe('NOT_AUTHENTICATED')
  })

  it('fails when no legacy file exists', async () => {
    const created = await invoke<{ user: { id: string } }>('auth:create-user', {
      displayName: 'Alice',
      password: 'password-12345678',
    })
    if (!created.success) throw new Error('setup')

    const res = await invoke('auth:legacy-import')
    expect(res.success).toBe(false)
  })
})

describe('auth:legacy-skip', () => {
  it('archives legacy without importing', async () => {
    seedLegacy(legacyPath)

    const created = await invoke<{ user: { id: string } }>('auth:create-user', {
      displayName: 'Alice',
      password: 'password-12345678',
    })
    if (!created.success) throw new Error('setup')
    const userId = created.data.user.id

    const res = await invoke<{ ok: true; archivedTo: string | null }>(
      'auth:legacy-skip',
    )
    expect(res.success).toBe(true)
    expect(fs.existsSync(legacyPath)).toBe(false)

    // Encrypted DB should NOT contain the legacy table.
    const K = keyStore.getKey()
    const db = new Database(vault.dbPath(userId), { readonly: true })
    db.pragma(`cipher='sqlcipher'`)
    db.pragma(`key="x'${K.toString('hex')}'"`)
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='stuff'`,
      )
      .all()
    db.close()
    expect(tables).toHaveLength(0)
  })

  it('no-op when no legacy file', async () => {
    const created = await invoke<{ user: { id: string } }>('auth:create-user', {
      displayName: 'Alice',
      password: 'password-12345678',
    })
    if (!created.success) throw new Error('setup')

    const res = await invoke<{ ok: true; archivedTo: string | null }>(
      'auth:legacy-skip',
    )
    expect(res.success).toBe(true)
    if (res.success) expect(res.data.archivedTo).toBeNull()
  })

  it('fails when locked', async () => {
    seedLegacy(legacyPath)
    const res = await invoke('auth:legacy-skip')
    expect(res.success).toBe(false)
    if (!res.success) expect(res.code).toBe('NOT_AUTHENTICATED')
  })
})
