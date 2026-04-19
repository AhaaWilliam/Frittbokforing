// Test-only IPC handlers for auth flows. Registered only when FRITT_TEST=1
// (same guard as `src/main/ipc/test-handlers.ts`). Lets E2E tests bypass
// the LockScreen UI entirely by creating + auto-logging-in a user in one
// call, without the recovery-key-confirm ceremony.

import { ipcMain } from 'electron'
import type { AuthService } from './auth-service'
import type { KeyStore } from './key-store'

export interface AuthTestDeps {
  service: AuthService
  keyStore: KeyStore
  /** Same onUnlock callback passed to registerAuthIpcHandlers — required
   *  so the DB is opened for the fresh user. */
  onUnlock: (userId: string) => void | Promise<void>
}

export function registerAuthTestHandlers(deps: AuthTestDeps): void {
  ipcMain.handle(
    '__test:createAndLoginUser',
    async (_event, raw: unknown) => {
      const input = raw as { displayName?: string; password?: string }
      const displayName = input?.displayName ?? 'E2E Test User'
      const password = input?.password ?? 'e2e-test-password-12345'
      const { user, recoveryKey } = await deps.service.createUser(
        displayName,
        password,
      )
      await deps.onUnlock(user.id)
      return { user, recoveryKey }
    },
  )

  ipcMain.handle('__test:lockNow', () => {
    deps.keyStore.lock()
    return { ok: true as const }
  })

  ipcMain.handle('__test:setTimeoutMs', (_event, ms: number) => {
    deps.keyStore.setTimeoutMs(ms)
    return { ok: true as const }
  })
}
