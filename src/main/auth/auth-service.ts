// Auth service — composes user-vault + key-store + rate-limiter + crypto
// + recovery-key into the operations that IPC handlers will expose in phase 3.
//
// Does NOT touch the DB. Unlocking just loads the master key K into the
// key-store; db.ts reads K from the key-store when opening the connection.

import {
  generateMasterKey,
  openEnvelope,
  sealMasterKey,
  type Envelope,
  type KdfParams,
  ARGON2ID_DEFAULTS,
} from './crypto'
import {
  generateRecoveryKey,
  normalizeAndValidate,
  recoveryKeyToSecret,
} from './recovery-key'
import type { KeyStore } from './key-store'
import type { RateLimiter } from './rate-limiter'
import type { UserMeta, UserVault } from './user-vault'

export type AuthErrorCode =
  | 'WRONG_PASSWORD'
  | 'WRONG_RECOVERY_KEY'
  | 'RATE_LIMITED'
  | 'USER_NOT_FOUND'
  | 'NOT_AUTHENTICATED'
  | 'WEAK_PASSWORD'

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

export interface AuthServiceDeps {
  vault: UserVault
  keyStore: KeyStore
  rateLimiter: RateLimiter
  now: () => number
  /** Override KDF params — tests use reduced cost. */
  kdfParams?: KdfParams
}

const MIN_PASSWORD_LENGTH = 12

function validatePasswordStrength(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(
      'WEAK_PASSWORD',
      `Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken`,
    )
  }
}

function wipeBuffer(buf: Buffer): void {
  buf.fill(0)
}

export function createAuthService(deps: AuthServiceDeps) {
  const kdf = deps.kdfParams ?? ARGON2ID_DEFAULTS

  /**
   * Dummy envelope som används för constant-time-dummy-decrypt vid
   * USER_NOT_FOUND (F-TT-004 — mitigerar user-enumeration-timing-attack).
   *
   * Lazy-initierad vid första login-försök mot icke-existerande user.
   * Skapas med samma `kdf`-params som riktiga user-envelopes så argon2id-
   * kostnaden matchar. Nyckel och innehåll är random och bryr sig ingen om
   * (openEnvelope kommer ändå kasta pga auth-tag-fel med godtyckligt lösen).
   */
  let dummyEnvelopeCache: Envelope | null = null
  async function getDummyEnvelope(): Promise<Envelope> {
    if (dummyEnvelopeCache) return dummyEnvelopeCache
    const dummyKey = generateMasterKey()
    const dummySecret = Buffer.from('unused-dummy-secret-for-timing-parity')
    try {
      dummyEnvelopeCache = await sealMasterKey(dummyKey, dummySecret, kdf)
    } finally {
      wipeBuffer(dummyKey)
    }
    return dummyEnvelopeCache
  }

  async function createUser(
    displayName: string,
    password: string,
  ): Promise<{ user: UserMeta; recoveryKey: string }> {
    validatePasswordStrength(password)

    const recoveryKey = generateRecoveryKey()
    const pwBuf = Buffer.from(password, 'utf8')
    const rkEntropy = recoveryKeyToSecret(recoveryKey)
    const K = generateMasterKey()

    try {
      const passwordBlob = await sealMasterKey(K, pwBuf, kdf)
      const recoveryBlob = await sealMasterKey(K, rkEntropy, kdf)
      const user = deps.vault.createUser(displayName, {
        version: 1,
        passwordBlob,
        recoveryBlob,
      })
      // Auto-login after creation: unlock the key-store.
      deps.keyStore.unlock(user.id, K)
      return { user, recoveryKey }
    } finally {
      wipeBuffer(pwBuf)
      wipeBuffer(rkEntropy)
      wipeBuffer(K)
    }
  }

  async function login(userId: string, password: string): Promise<UserMeta> {
    const user = deps.vault.findUser(userId)
    if (!user) {
      // F-TT-004: Mitigera user-enumeration-timing-attack — kör dummy
      // argon2id-decrypt med samma kostnad som riktig login så svarstid
      // inte avslöjar om userId finns.
      const pwBuf = Buffer.from(password, 'utf8')
      try {
        const dummy = await getDummyEnvelope()
        try {
          await openEnvelope(dummy, pwBuf)
        } catch {
          // förväntat — dummy har random nyckel
        }
      } finally {
        wipeBuffer(pwBuf)
      }
      throw new AuthError('USER_NOT_FOUND', 'Användaren finns inte')
    }

    const now = deps.now()
    const retryAfter = deps.rateLimiter.checkAllowed(userId, now)
    if (retryAfter > 0) {
      throw new AuthError(
        'RATE_LIMITED',
        `För många försök — vänta ${Math.ceil(retryAfter / 1000)}s`,
        retryAfter,
      )
    }

    const keys = deps.vault.readKeys(userId)
    const pwBuf = Buffer.from(password, 'utf8')
    let K: Buffer | null = null
    try {
      try {
        K = await openEnvelope(keys.passwordBlob, pwBuf)
      } catch {
        deps.rateLimiter.recordFailure(userId, deps.now())
        throw new AuthError('WRONG_PASSWORD', 'Fel lösenord')
      }
      deps.rateLimiter.recordSuccess(userId)
      deps.keyStore.unlock(userId, K)
      return user
    } finally {
      wipeBuffer(pwBuf)
      if (K) wipeBuffer(K)
    }
  }

  async function loginWithRecoveryKey(
    userId: string,
    recoveryPhrase: string,
  ): Promise<UserMeta> {
    const user = deps.vault.findUser(userId)
    if (!user) throw new AuthError('USER_NOT_FOUND', 'Användaren finns inte')

    const normalized = normalizeAndValidate(recoveryPhrase)
    if (!normalized) {
      throw new AuthError(
        'WRONG_RECOVERY_KEY',
        'Ogiltig återställningsfras',
      )
    }

    // No rate-limit check on recovery — it's high-entropy (256 bits) and
    // would require ~10^75 attempts. Rate-limiting just slows honest mis-types.
    const keys = deps.vault.readKeys(userId)
    const rkEntropy = recoveryKeyToSecret(normalized)
    let K: Buffer | null = null
    try {
      try {
        K = await openEnvelope(keys.recoveryBlob, rkEntropy)
      } catch {
        throw new AuthError(
          'WRONG_RECOVERY_KEY',
          'Återställningsfrasen matchar inte',
        )
      }
      deps.keyStore.unlock(userId, K)
      return user
    } finally {
      wipeBuffer(rkEntropy)
      if (K) wipeBuffer(K)
    }
  }

  async function changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    validatePasswordStrength(newPassword)

    const keys = deps.vault.readKeys(userId)
    const oldBuf = Buffer.from(oldPassword, 'utf8')
    const newBuf = Buffer.from(newPassword, 'utf8')
    let K: Buffer | null = null
    try {
      try {
        K = await openEnvelope(keys.passwordBlob, oldBuf)
      } catch {
        throw new AuthError('WRONG_PASSWORD', 'Gammalt lösenord matchar inte')
      }
      const newPasswordBlob = await sealMasterKey(K, newBuf, kdf)
      deps.vault.writeKeys(userId, {
        version: 1,
        passwordBlob: newPasswordBlob,
        recoveryBlob: keys.recoveryBlob,
      })
    } finally {
      wipeBuffer(oldBuf)
      wipeBuffer(newBuf)
      if (K) wipeBuffer(K)
    }
  }

  async function rotateRecoveryKey(userId: string): Promise<string> {
    if (deps.keyStore.isLocked() || deps.keyStore.getUserId() !== userId) {
      throw new AuthError(
        'NOT_AUTHENTICATED',
        'Du måste vara inloggad för att generera ny återställningsfras',
      )
    }
    const K = deps.keyStore.getKey()
    const newRecoveryKey = generateRecoveryKey()
    const rkEntropy = recoveryKeyToSecret(newRecoveryKey)
    try {
      const keys = deps.vault.readKeys(userId)
      const newRecoveryBlob = await sealMasterKey(K, rkEntropy, kdf)
      deps.vault.writeKeys(userId, {
        version: 1,
        passwordBlob: keys.passwordBlob,
        recoveryBlob: newRecoveryBlob,
      })
      return newRecoveryKey
    } finally {
      wipeBuffer(rkEntropy)
    }
  }

  function logout(): void {
    deps.keyStore.lock()
  }

  return {
    createUser,
    login,
    loginWithRecoveryKey,
    changePassword,
    rotateRecoveryKey,
    logout,
    listUsers: () => deps.vault.listUsers(),
    deleteUser: (userId: string) => deps.vault.deleteUser(userId),
    renameUser: (userId: string, displayName: string) =>
      deps.vault.renameUser(userId, displayName),
  }
}

export type AuthService = ReturnType<typeof createAuthService>
