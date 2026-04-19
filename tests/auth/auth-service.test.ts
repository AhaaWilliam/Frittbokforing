import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  AuthError,
  createAuthService,
  type AuthService,
} from '../../src/main/auth/auth-service'
import { createKeyStore, type KeyStore } from '../../src/main/auth/key-store'
import {
  createRateLimiter,
  type RateLimiter,
} from '../../src/main/auth/rate-limiter'
import { UserVault } from '../../src/main/auth/user-vault'

const FAST_KDF = {
  memorySize: 1024,
  iterations: 1,
  parallelism: 1,
  hashLength: 32,
}

let tmpRoot: string
let vault: UserVault
let keyStore: KeyStore
let rateLimiter: RateLimiter
let now: number
let svc: AuthService

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-service-'))
  vault = new UserVault(tmpRoot)
  keyStore = createKeyStore({ timeoutMs: 60_000 })
  rateLimiter = createRateLimiter()
  now = 1_000_000
  svc = createAuthService({
    vault,
    keyStore,
    rateLimiter,
    now: () => now,
    kdfParams: FAST_KDF,
  })
})

afterEach(() => {
  keyStore.lock()
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('auth-service — createUser', () => {
  it('creates user, returns recovery key, auto-unlocks store', async () => {
    const { user, recoveryKey } = await svc.createUser(
      'Alice',
      'correct-horse-battery-staple',
    )
    expect(user.displayName).toBe('Alice')
    expect(recoveryKey.split(' ')).toHaveLength(24)
    expect(keyStore.isLocked()).toBe(false)
    expect(keyStore.getUserId()).toBe(user.id)
  })

  it('rejects weak password (too short)', async () => {
    await expect(svc.createUser('Alice', 'short')).rejects.toMatchObject({
      code: 'WEAK_PASSWORD',
    })
  })

  it('returns distinct recovery keys for different users', async () => {
    const a = await svc.createUser('Alice', 'password-alice-12345')
    keyStore.lock()
    const b = await svc.createUser('Bob', 'password-bob-12345')
    expect(a.recoveryKey).not.toBe(b.recoveryKey)
  })

  it('persists user to vault', async () => {
    const { user } = await svc.createUser('Alice', 'password-alice-12345')
    expect(svc.listUsers().map((u) => u.id)).toContain(user.id)
  })
})

describe('auth-service — login with password', () => {
  it('correct password unlocks key store', async () => {
    const { user } = await svc.createUser('Alice', 'password-alice-12345')
    keyStore.lock()
    await svc.login(user.id, 'password-alice-12345')
    expect(keyStore.isLocked()).toBe(false)
    expect(keyStore.getUserId()).toBe(user.id)
  })

  it('wrong password throws WRONG_PASSWORD and records rate-limit failure', async () => {
    const { user } = await svc.createUser('Alice', 'password-alice-12345')
    keyStore.lock()
    await expect(svc.login(user.id, 'wrong-password')).rejects.toMatchObject({
      code: 'WRONG_PASSWORD',
    })
    expect(keyStore.isLocked()).toBe(true)
    expect(rateLimiter.peek(user.id)?.failures).toBe(1)
  })

  it('unknown userId throws USER_NOT_FOUND', async () => {
    await expect(svc.login('nonexistent', 'pw')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    })
  })

  it('rate-limits after repeated failures', async () => {
    const { user } = await svc.createUser('Alice', 'password-alice-12345')
    keyStore.lock()
    await expect(svc.login(user.id, 'wrong')).rejects.toMatchObject({
      code: 'WRONG_PASSWORD',
    })
    // next attempt immediately — should be rate-limited (1s cooldown)
    await expect(svc.login(user.id, 'password-alice-12345')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    })
  })

  it('successful login clears rate-limit state', async () => {
    const { user } = await svc.createUser('Alice', 'password-alice-12345')
    keyStore.lock()
    await expect(svc.login(user.id, 'wrong')).rejects.toThrow()
    now += 2_000 // wait out backoff
    await svc.login(user.id, 'password-alice-12345')
    expect(rateLimiter.peek(user.id)).toBeUndefined()
  })

  it('does not unlock store on wrong password', async () => {
    const { user } = await svc.createUser('Alice', 'password-alice-12345')
    keyStore.lock()
    await expect(svc.login(user.id, 'wrong')).rejects.toThrow()
    expect(keyStore.isLocked()).toBe(true)
  })
})

describe('auth-service — login with recovery key', () => {
  it('correct recovery key unlocks store', async () => {
    const { user, recoveryKey } = await svc.createUser(
      'Alice',
      'password-alice-12345',
    )
    keyStore.lock()
    await svc.loginWithRecoveryKey(user.id, recoveryKey)
    expect(keyStore.isLocked()).toBe(false)
  })

  it('tolerates whitespace and case variation', async () => {
    const { user, recoveryKey } = await svc.createUser(
      'Alice',
      'password-alice-12345',
    )
    keyStore.lock()
    const messy = '  ' + recoveryKey.toUpperCase().replace(/ /g, '   ') + '\n'
    await svc.loginWithRecoveryKey(user.id, messy)
    expect(keyStore.isLocked()).toBe(false)
  })

  it('wrong recovery phrase throws WRONG_RECOVERY_KEY', async () => {
    const { user } = await svc.createUser('Alice', 'password-alice-12345')
    keyStore.lock()
    await expect(
      svc.loginWithRecoveryKey(user.id, 'not a valid phrase'),
    ).rejects.toMatchObject({ code: 'WRONG_RECOVERY_KEY' })
  })

  it('valid-format but wrong phrase throws WRONG_RECOVERY_KEY', async () => {
    const { user } = await svc.createUser('Alice', 'password-alice-12345')
    keyStore.lock()
    // Generate a fresh valid phrase — statistically never matches this user's.
    const { recoveryKey: otherPhrase } = await svc.createUser(
      'Bob',
      'password-bob-12345',
    )
    keyStore.lock()
    await expect(
      svc.loginWithRecoveryKey(user.id, otherPhrase),
    ).rejects.toMatchObject({ code: 'WRONG_RECOVERY_KEY' })
  })

  it('recovery login does NOT consult rate-limiter', async () => {
    const { user } = await svc.createUser('Alice', 'password-alice-12345')
    keyStore.lock()
    // Fail a password login to arm rate-limit
    await expect(svc.login(user.id, 'wrong')).rejects.toThrow()
    expect(rateLimiter.peek(user.id)?.failures).toBe(1)
    // Recovery login with wrong phrase should still throw but NOT be rate-limited
    // (attempt proceeds; does not throw RATE_LIMITED).
    await expect(
      svc.loginWithRecoveryKey(user.id, 'still not valid'),
    ).rejects.toMatchObject({ code: 'WRONG_RECOVERY_KEY' })
  })
})

describe('auth-service — changePassword', () => {
  it('changes password; new works, old does not', async () => {
    const { user } = await svc.createUser('Alice', 'old-password-12345')
    await svc.changePassword(user.id, 'old-password-12345', 'new-password-67890')
    keyStore.lock()
    await svc.login(user.id, 'new-password-67890')
    expect(keyStore.isLocked()).toBe(false)
    keyStore.lock()
    await expect(svc.login(user.id, 'old-password-12345')).rejects.toMatchObject({
      code: 'WRONG_PASSWORD',
    })
  })

  it('preserves recovery key across password change', async () => {
    const { user, recoveryKey } = await svc.createUser(
      'Alice',
      'old-password-12345',
    )
    await svc.changePassword(user.id, 'old-password-12345', 'new-password-67890')
    keyStore.lock()
    await svc.loginWithRecoveryKey(user.id, recoveryKey)
    expect(keyStore.isLocked()).toBe(false)
  })

  it('rejects wrong old password', async () => {
    const { user } = await svc.createUser('Alice', 'old-password-12345')
    await expect(
      svc.changePassword(user.id, 'wrong-old', 'new-password-67890'),
    ).rejects.toMatchObject({ code: 'WRONG_PASSWORD' })
  })

  it('rejects weak new password', async () => {
    const { user } = await svc.createUser('Alice', 'old-password-12345')
    await expect(
      svc.changePassword(user.id, 'old-password-12345', 'short'),
    ).rejects.toMatchObject({ code: 'WEAK_PASSWORD' })
  })
})

describe('auth-service — rotateRecoveryKey', () => {
  it('requires authentication', async () => {
    const { user } = await svc.createUser('Alice', 'password-12345')
    keyStore.lock()
    await expect(svc.rotateRecoveryKey(user.id)).rejects.toMatchObject({
      code: 'NOT_AUTHENTICATED',
    })
  })

  it('new recovery key works; old does not', async () => {
    const { user, recoveryKey: oldKey } = await svc.createUser(
      'Alice',
      'password-12345',
    )
    const newKey = await svc.rotateRecoveryKey(user.id)
    expect(newKey).not.toBe(oldKey)
    keyStore.lock()
    await svc.loginWithRecoveryKey(user.id, newKey)
    expect(keyStore.isLocked()).toBe(false)
    keyStore.lock()
    await expect(
      svc.loginWithRecoveryKey(user.id, oldKey),
    ).rejects.toMatchObject({ code: 'WRONG_RECOVERY_KEY' })
  })

  it('password still works after recovery rotation', async () => {
    const { user } = await svc.createUser('Alice', 'password-12345')
    await svc.rotateRecoveryKey(user.id)
    keyStore.lock()
    await svc.login(user.id, 'password-12345')
    expect(keyStore.isLocked()).toBe(false)
  })
})

describe('auth-service — logout', () => {
  it('locks the key store', async () => {
    await svc.createUser('Alice', 'password-12345')
    svc.logout()
    expect(keyStore.isLocked()).toBe(true)
  })
})

describe('auth-service — AuthError shape', () => {
  it('AuthError has code and message', async () => {
    try {
      await svc.createUser('Alice', 'short')
    } catch (err) {
      expect(err).toBeInstanceOf(AuthError)
      expect((err as AuthError).code).toBe('WEAK_PASSWORD')
      expect((err as AuthError).message).toContain('12 tecken')
    }
  })

  it('RATE_LIMITED includes retryAfterMs', async () => {
    const { user } = await svc.createUser('Alice', 'password-12345')
    keyStore.lock()
    await expect(svc.login(user.id, 'wrong')).rejects.toThrow()
    try {
      await svc.login(user.id, 'password-12345')
    } catch (err) {
      const e = err as AuthError
      expect(e.code).toBe('RATE_LIMITED')
      expect(e.retryAfterMs).toBeGreaterThan(0)
    }
  })
})
