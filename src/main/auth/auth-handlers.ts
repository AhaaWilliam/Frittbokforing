// IPC handlers for auth:* channels. Registered once from main at startup.
//
// Return shape is always `IpcResult<T>` (M144). AuthError → { success:false,
// code, error, retryAfterMs? }. Unknown errors → UNEXPECTED_ERROR.

import { ipcMain, dialog } from 'electron'
import { z } from 'zod'
import log from 'electron-log'
import type { IpcResult } from '../../shared/types'
import { AuthError, type AuthService } from './auth-service'
import type { KeyStore } from './key-store'
import type { UserMeta, UserVault } from './user-vault'
import {
  archiveLegacyDb,
  defaultArchivePath,
  hasLegacyDb,
  migrateLegacyToEncrypted,
} from './legacy-migration'
import { closeDb, openEncryptedDb } from '../db'
import { runPostUnlockStartup } from '../ipc-handlers'
import fs from 'node:fs'

const DisplayNameSchema = z.string().trim().min(1).max(100)
const PasswordSchema = z.string().min(1).max(1024)
const UserIdSchema = z.string().uuid()
const RecoveryPhraseSchema = z.string().min(1).max(2048)

const CreateUserInput = z.object({
  displayName: DisplayNameSchema,
  password: PasswordSchema,
})
const LoginInput = z.object({
  userId: UserIdSchema,
  password: PasswordSchema,
})
const RecoveryLoginInput = z.object({
  userId: UserIdSchema,
  recoveryPhrase: RecoveryPhraseSchema,
})
const ChangePasswordInput = z.object({
  userId: UserIdSchema,
  oldPassword: PasswordSchema,
  newPassword: PasswordSchema,
})
const UserIdInput = z.object({ userId: UserIdSchema })
const RenameInput = z.object({
  userId: UserIdSchema,
  displayName: DisplayNameSchema,
})
const TimeoutInput = z.object({
  timeoutMs: z
    .number()
    .int()
    .min(60_000) // 1 min floor — prevents accidental lock-out loops
    .max(24 * 60 * 60 * 1000), // 24 h ceiling — anything longer is "off" morally
})

export interface AuthStatus {
  locked: boolean
  userId: string | null
  timeoutMs: number
  msUntilLock: number | null
}

export interface LoginResponse {
  user: UserMeta
}

export interface CreateUserResponse {
  user: UserMeta
  recoveryKey: string
}

export interface RotateRecoveryResponse {
  recoveryKey: string
}

function toIpcError(err: unknown): IpcResult<never> {
  if (err instanceof AuthError) {
    return {
      success: false,
      code: err.code,
      error: err.message,
      ...(err.retryAfterMs != null ? { field: String(err.retryAfterMs) } : {}),
    }
  }
  if (err instanceof Error) {
    log.error('auth handler error:', err)
    return {
      success: false,
      code: 'UNEXPECTED_ERROR',
      error: err.message,
    }
  }
  log.error('auth handler unknown error:', err)
  return {
    success: false,
    code: 'UNEXPECTED_ERROR',
    error: 'Ett oväntat fel inträffade',
  }
}

function wrap<TPayload, TResult>(
  schema: z.ZodType<TPayload> | null,
  fn: (payload: TPayload) => Promise<TResult> | TResult,
) {
  return async (_e: unknown, raw: unknown): Promise<IpcResult<TResult>> => {
    try {
      let payload: TPayload
      if (schema) {
        const parsed = schema.safeParse(raw)
        if (!parsed.success) {
          const first = parsed.error.issues[0]
          return {
            success: false,
            code: 'VALIDATION_ERROR',
            error: first?.message ?? 'Ogiltigt input.',
            field: first?.path[0]?.toString(),
          }
        }
        payload = parsed.data
      } else {
        payload = raw as TPayload
      }
      const data = await fn(payload)
      return { success: true, data }
    } catch (err) {
      return toIpcError(err)
    }
  }
}

export interface AuthHandlerHooks {
  /**
   * Called after any path that successfully unlocks the key-store:
   * login (password), login-recovery, create-user. Receives the user
   * that just unlocked. Main uses this to open the per-user encrypted
   * DB and run startup tasks.
   *
   * If the hook throws, the auth success is rolled back (keystore is
   * locked and the caller receives an error). This keeps auth and DB
   * state consistent.
   */
  onUnlock?: (userId: string) => void | Promise<void>
  /** Called from handlers that explicitly lock (logout). */
  onLock?: () => void
  /**
   * Absolute path to the legacy (pre-ADR-004) unencrypted DB. When set,
   * the legacy-migration handlers are registered and will detect/import
   * from this path. Omit (or pass null) to disable legacy-migration
   * handlers — they respond with LEGACY_DB_NOT_FOUND.
   */
  legacyDbPath?: string | null
  /**
   * Vault reference — needed so legacy-migration handlers can resolve the
   * user's encrypted DB path and backups dir.
   */
  vault?: UserVault
}

export function registerAuthIpcHandlers(
  service: AuthService,
  keyStore: KeyStore,
  hooks: AuthHandlerHooks = {},
): void {
  async function runUnlockHook(userId: string): Promise<void> {
    if (!hooks.onUnlock) return
    try {
      await hooks.onUnlock(userId)
    } catch (err) {
      keyStore.lock()
      // B3: Visa informativ dialog vid migrations-krasch istället för tyst
      // auth-fail. Utan dialogen ser användaren bara att inloggningen misslyckas
      // utan förklaring, och kan inte avgöra om det är fel lösenord eller
      // en teknisk bugg.
      const msg = err instanceof Error ? err.message : String(err)
      const isMigrationError =
        msg.includes('Migration') || msg.includes('migration')
      if (isMigrationError) {
        log.error('[auth] Migration failed during unlock:', msg)
        dialog.showErrorBox(
          'Databasuppgradering misslyckades',
          `Programmet kunde inte uppgradera databasen och kan inte logga in.\n\n` +
            `Fel: ${msg}\n\n` +
            `Återhämtning:\n` +
            `1. Stäng programmet\n` +
            `2. Återställ en säkerhetskopia via Finder (filen ligger i ` +
            `Dokument/Fritt Bokföring/)\n` +
            `3. Kontakta support om problemet kvarstår`,
        )
      }
      throw err
    }
  }
  ipcMain.handle(
    'auth:list-users',
    wrap(null, () => service.listUsers()),
  )

  ipcMain.handle(
    'auth:status',
    wrap(
      null,
      (): AuthStatus => ({
        locked: keyStore.isLocked(),
        userId: keyStore.getUserId(),
        timeoutMs: keyStore.getTimeoutMs(),
        msUntilLock: keyStore.msUntilLock(),
      }),
    ),
  )

  ipcMain.handle(
    'auth:create-user',
    wrap(CreateUserInput, async (input): Promise<CreateUserResponse> => {
      const result = await service.createUser(input.displayName, input.password)
      await runUnlockHook(result.user.id)
      return result
    }),
  )

  ipcMain.handle(
    'auth:login',
    wrap(LoginInput, async (input): Promise<LoginResponse> => {
      const user = await service.login(input.userId, input.password)
      await runUnlockHook(user.id)
      return { user }
    }),
  )

  ipcMain.handle(
    'auth:login-recovery',
    wrap(RecoveryLoginInput, async (input): Promise<LoginResponse> => {
      const user = await service.loginWithRecoveryKey(
        input.userId,
        input.recoveryPhrase,
      )
      await runUnlockHook(user.id)
      return { user }
    }),
  )

  ipcMain.handle(
    'auth:logout',
    wrap(null, () => {
      service.logout()
      if (hooks.onLock) hooks.onLock()
      return { ok: true as const }
    }),
  )

  ipcMain.handle(
    'auth:change-password',
    wrap(ChangePasswordInput, async (input) => {
      await service.changePassword(
        input.userId,
        input.oldPassword,
        input.newPassword,
      )
      return { ok: true as const }
    }),
  )

  ipcMain.handle(
    'auth:rotate-recovery',
    wrap(
      UserIdInput,
      async (input): Promise<RotateRecoveryResponse> => ({
        recoveryKey: await service.rotateRecoveryKey(input.userId),
      }),
    ),
  )

  ipcMain.handle(
    'auth:rename-user',
    wrap(RenameInput, (input) => {
      service.renameUser(input.userId, input.displayName)
      return { ok: true as const }
    }),
  )

  ipcMain.handle(
    'auth:delete-user',
    wrap(UserIdInput, (input) => {
      // Lock if the deleted user is the currently unlocked one.
      if (keyStore.getUserId() === input.userId) keyStore.lock()
      service.deleteUser(input.userId)
      return { ok: true as const }
    }),
  )

  ipcMain.handle(
    'auth:touch',
    wrap(null, () => {
      keyStore.touch()
      return { ok: true as const }
    }),
  )

  ipcMain.handle(
    'auth:set-timeout',
    wrap(TimeoutInput, (input) => {
      keyStore.setTimeoutMs(input.timeoutMs)
      return { ok: true as const, timeoutMs: keyStore.getTimeoutMs() }
    }),
  )

  // ── Legacy-DB migration (ADR 004 §9) ────────────────────────────────

  function requireAuthContext(): {
    userId: string
    vault: UserVault
    legacyPath: string
  } {
    if (keyStore.isLocked()) {
      throw new AuthError(
        'NOT_AUTHENTICATED',
        'Du måste vara inloggad för att hantera legacy-data',
      )
    }
    const userId = keyStore.getUserId()
    if (!userId) {
      throw new AuthError('NOT_AUTHENTICATED', 'Ingen aktiv användare')
    }
    if (!hooks.vault) {
      throw new Error('Vault inte konfigurerad')
    }
    if (!hooks.legacyDbPath) {
      throw new Error('Legacy-sökväg inte konfigurerad')
    }
    return { userId, vault: hooks.vault, legacyPath: hooks.legacyDbPath }
  }

  ipcMain.handle(
    'auth:legacy-check',
    wrap(null, () => {
      if (!hooks.legacyDbPath) {
        return { exists: false, path: null as string | null }
      }
      return {
        exists: hasLegacyDb(hooks.legacyDbPath),
        path: hasLegacyDb(hooks.legacyDbPath) ? hooks.legacyDbPath : null,
      }
    }),
  )

  ipcMain.handle(
    'auth:legacy-import',
    wrap(null, async () => {
      const ctx = requireAuthContext()
      if (!hasLegacyDb(ctx.legacyPath)) {
        throw new AuthError(
          'USER_NOT_FOUND',
          'Ingen legacy-databas att importera',
        )
      }
      const encryptedPath = ctx.vault.dbPath(ctx.userId)
      const archivePath = defaultArchivePath(
        ctx.legacyPath,
        ctx.vault.backupsDir(ctx.userId),
      )

      // Close and delete the currently-open encrypted DB (which is empty,
      // created fresh during createUser). migrateLegacyToEncrypted insists
      // the target does not exist.
      closeDb()
      for (const suffix of ['', '-wal', '-shm']) {
        const p = encryptedPath + suffix
        if (fs.existsSync(p)) fs.unlinkSync(p)
      }

      // Read the master key from the keystore. The keystore's buffer
      // remains owned by the store; we copy here so openEncryptedDb can
      // wipe its own copy later without touching ours.
      const K = Buffer.from(keyStore.getKey())
      try {
        migrateLegacyToEncrypted(ctx.legacyPath, encryptedPath, K)
        openEncryptedDb(encryptedPath, K)
        runPostUnlockStartup()
      } finally {
        K.fill(0)
      }

      archiveLegacyDb(ctx.legacyPath, archivePath)
      return { ok: true as const, archivedTo: archivePath }
    }),
  )

  ipcMain.handle(
    'auth:legacy-skip',
    wrap(null, () => {
      const ctx = requireAuthContext()
      if (!hasLegacyDb(ctx.legacyPath)) {
        return { ok: true as const, archivedTo: null as string | null }
      }
      const archivePath = defaultArchivePath(
        ctx.legacyPath,
        ctx.vault.backupsDir(ctx.userId),
      )
      archiveLegacyDb(ctx.legacyPath, archivePath)
      return { ok: true as const, archivedTo: archivePath }
    }),
  )
}
