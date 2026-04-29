/**
 * Integration test for registerAuthIpcHandlers — verifies the onUnlock/onLock
 * hooks fire at the right moments in the lifecycle.
 *
 * Uses a fake ipcMain (captures registered handlers by channel name) so we
 * can invoke them without booting Electron. This mirrors the real call-site
 * behavior from index.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createAuthService } from '../../src/main/auth/auth-service'
import { createKeyStore } from '../../src/main/auth/key-store'
import { createRateLimiter } from '../../src/main/auth/rate-limiter'
import { UserVault } from '../../src/main/auth/user-vault'
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

// auth-handlers imports runPostUnlockStartup from ipc-handlers.ts, which
// pulls in the full service graph. We stub it — this test only exercises
// auth-handlers logic, not the downstream DB handlers.
vi.mock('../../src/main/ipc-handlers', () => ({
  runPostUnlockStartup: () => {},
}))

let tmpRoot: string
let onUnlockSpy: ReturnType<typeof vi.fn> & ((x?: unknown) => unknown)
let onLockSpy: ReturnType<typeof vi.fn> & ((x?: unknown) => unknown)

async function invoke<T>(
  channel: string,
  payload: unknown = {},
): Promise<IpcResult<T>> {
  const fn = handlers.get(channel)
  if (!fn) throw new Error(`handler ${channel} not registered`)
  return (await fn({}, payload)) as IpcResult<T>
}

beforeEach(async () => {
  handlers.clear()
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-handlers-'))
  onUnlockSpy = vi.fn() as typeof onUnlockSpy
  onLockSpy = vi.fn() as typeof onLockSpy

  const vault = new UserVault(tmpRoot)
  vault.ensureRoot()
  const keyStore = createKeyStore()
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
    onUnlock: (userId) => onUnlockSpy(userId),
    onLock: () => onLockSpy(),
  })
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('auth-handlers — onUnlock hook', () => {
  it('fires on create-user', async () => {
    const res = await invoke<{ user: { id: string }; recoveryKey: string }>(
      'auth:create-user',
      { displayName: 'Alice', password: 'password-12345678' },
    )
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(onUnlockSpy).toHaveBeenCalledWith(res.data.user.id)
  })

  it('fires on password login', async () => {
    const created = await invoke<{ user: { id: string } }>('auth:create-user', {
      displayName: 'Alice',
      password: 'password-12345678',
    })
    if (!created.success) throw new Error('setup')
    onUnlockSpy.mockClear()

    // Log out, then log back in.
    await invoke('auth:logout')
    const login = await invoke('auth:login', {
      userId: created.data.user.id,
      password: 'password-12345678',
    })
    expect(login.success).toBe(true)
    expect(onUnlockSpy).toHaveBeenCalledWith(created.data.user.id)
  })

  it('fires on recovery-key login', async () => {
    const created = await invoke<{
      user: { id: string }
      recoveryKey: string
    }>('auth:create-user', {
      displayName: 'Alice',
      password: 'password-12345678',
    })
    if (!created.success) throw new Error('setup')
    onUnlockSpy.mockClear()

    await invoke('auth:logout')
    const login = await invoke('auth:login-recovery', {
      userId: created.data.user.id,
      recoveryPhrase: created.data.recoveryKey,
    })
    expect(login.success).toBe(true)
    expect(onUnlockSpy).toHaveBeenCalledWith(created.data.user.id)
  })

  it('does NOT fire on failed login', async () => {
    const created = await invoke<{ user: { id: string } }>('auth:create-user', {
      displayName: 'Alice',
      password: 'password-12345678',
    })
    if (!created.success) throw new Error('setup')
    await invoke('auth:logout')
    onUnlockSpy.mockClear()

    const login = await invoke('auth:login', {
      userId: created.data.user.id,
      password: 'wrong-password',
    })
    expect(login.success).toBe(false)
    expect(onUnlockSpy).not.toHaveBeenCalled()
  })
})

describe('auth-handlers — onLock hook', () => {
  it('fires on explicit logout', async () => {
    const created = await invoke<{ user: { id: string } }>('auth:create-user', {
      displayName: 'Alice',
      password: 'password-12345678',
    })
    if (!created.success) throw new Error('setup')
    onLockSpy.mockClear()

    await invoke('auth:logout')
    expect(onLockSpy).toHaveBeenCalledTimes(1)
  })
})

describe('auth-handlers — set-timeout', () => {
  it('updates keyStore timeout via auth:set-timeout', async () => {
    const res = await invoke<{ ok: true; timeoutMs: number }>(
      'auth:set-timeout',
      { timeoutMs: 5 * 60_000 },
    )
    expect(res.success).toBe(true)
    if (res.success) expect(res.data.timeoutMs).toBe(5 * 60_000)
    // Status reflects the update.
    const status = await invoke<{ timeoutMs: number }>('auth:status')
    expect(status.success).toBe(true)
    if (status.success) expect(status.data.timeoutMs).toBe(5 * 60_000)
  })

  it('rejects out-of-range values via Zod', async () => {
    const res = await invoke('auth:set-timeout', { timeoutMs: 500 })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.code).toBe('VALIDATION_ERROR')
  })
})

describe('auth-handlers — onUnlock rollback on failure', () => {
  it('locks the key store if onUnlock throws', async () => {
    onUnlockSpy.mockImplementation(() => {
      throw new Error('db open failed')
    })
    const res = await invoke<{ user: { id: string } }>('auth:create-user', {
      displayName: 'Alice',
      password: 'password-12345678',
    })
    expect(res.success).toBe(false)
    // The user was persisted (createUser already completed) — verify:
    const list = await invoke<{ displayName: string }[]>('auth:list-users')
    expect(list.success).toBe(true)
    // Status should be locked because the hook rolled back the keystore.
    const status = await invoke<{ locked: boolean }>('auth:status')
    expect(status.success).toBe(true)
    if (status.success) expect(status.data.locked).toBe(true)
  })
})
