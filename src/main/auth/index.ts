// Auth module barrel — exposes the process-wide singleton AuthService plus
// supporting types. One instance per Electron main process.
//
// Built lazily on first access so tests and embedded use cases can reset
// state between runs (call `resetAuth()` in test teardown).

import path from 'node:path'
import { app } from 'electron'
import { createAuthService, type AuthService } from './auth-service'
import { createKeyStore, type KeyStore } from './key-store'
import { createRateLimiter } from './rate-limiter'
import { UserVault } from './user-vault'

export { AuthError } from './auth-service'
export type { AuthErrorCode } from './auth-service'
export type { UserMeta } from './user-vault'
export type { AuthService } from './auth-service'
export type { KeyStore } from './key-store'

interface AuthSingleton {
  service: AuthService
  keyStore: KeyStore
  vault: UserVault
}

let instance: AuthSingleton | null = null

/** Resolve the root dir for the user vault. Override via FRITT_AUTH_ROOT in tests. */
function resolveAuthRoot(): string {
  if (process.env.FRITT_AUTH_ROOT) return process.env.FRITT_AUTH_ROOT
  return path.join(app.getPath('userData'), 'auth')
}

export function getAuth(): AuthSingleton {
  if (!instance) {
    const vault = new UserVault(resolveAuthRoot())
    vault.ensureRoot()
    const keyStore = createKeyStore()
    const rateLimiter = createRateLimiter()
    const service = createAuthService({
      vault,
      keyStore,
      rateLimiter,
      now: () => Date.now(),
    })
    instance = { service, keyStore, vault }
  }
  return instance
}

/** Test-only — drop the singleton so the next getAuth() rebuilds it. */
export function resetAuth(): void {
  if (instance) instance.keyStore.lock()
  instance = null
}
