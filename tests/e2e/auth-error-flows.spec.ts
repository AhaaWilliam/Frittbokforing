/**
 * e15 — Auth error-flows + user-management (@critical).
 *
 * Kompletterar e13 (happy-path multi-user + isolation) genom att täcka
 * flöden som inte exercerades där:
 *
 *   1. WRONG_PASSWORD returnerar IpcResult.error (renderar inte stack)
 *   2. Recovery-key med fel fras returnerar WRONG_RECOVERY_KEY
 *   3. changePassword — gammalt lösen slutar fungera, nytt fungerar
 *   4. renameUser — displayName uppdateras och persisteras
 *   5. deleteUser — låser direkt om aktuell user, poppar user ur listUsers
 *
 * Använder __authTestApi.createAndLoginUser för setup (bypasser recovery-
 * ceremoni), sedan produktions-IPC (window.auth.*) för själva flödena så
 * att error-paths som LockScreen skulle hittar exercas.
 */
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { launchAppWithFreshDb } from './helpers/launch-app'

interface LoggedInUser {
  user: { id: string; displayName: string; createdAt: string }
  recoveryKey: string
}

async function createAndLogin(
  window: Page,
  displayName: string,
  password: string,
): Promise<LoggedInUser> {
  const res = (await window.evaluate(
    async (input) =>
      (
        window as unknown as {
          __authTestApi: {
            createAndLoginUser: (d: unknown) => Promise<unknown>
          }
        }
      ).__authTestApi.createAndLoginUser(input),
    { displayName, password },
  )) as LoggedInUser
  if (!res || !res.user) {
    throw new Error(`createAndLogin failed for ${displayName}`)
  }
  return res
}

async function logout(window: Page): Promise<void> {
  const res = (await window.evaluate(
    async () =>
      (
        window as unknown as {
          auth: { logout: () => Promise<{ success: boolean; error?: string }> }
        }
      ).auth.logout(),
  )) as { success: boolean; error?: string }
  if (!res.success) throw new Error(`logout failed: ${res.error}`)
}

type AuthResult = {
  success: boolean
  error?: string
  code?: string
  data?: unknown
}

async function callLogin(
  window: Page,
  userId: string,
  password: string,
): Promise<AuthResult> {
  return (await window.evaluate(
    async (input) =>
      (
        window as unknown as {
          auth: { login: (d: unknown) => Promise<unknown> }
        }
      ).auth.login(input),
    { userId, password },
  )) as AuthResult
}

async function callRecovery(
  window: Page,
  userId: string,
  recoveryPhrase: string,
): Promise<AuthResult> {
  return (await window.evaluate(
    async (input) =>
      (
        window as unknown as {
          auth: { loginWithRecovery: (d: unknown) => Promise<unknown> }
        }
      ).auth.loginWithRecovery(input),
    { userId, recoveryPhrase },
  )) as AuthResult
}

async function callChangePassword(
  window: Page,
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<AuthResult> {
  return (await window.evaluate(
    async (input) =>
      (
        window as unknown as {
          auth: { changePassword: (d: unknown) => Promise<unknown> }
        }
      ).auth.changePassword(input),
    { userId, oldPassword, newPassword },
  )) as AuthResult
}

async function callRename(
  window: Page,
  userId: string,
  displayName: string,
): Promise<AuthResult> {
  return (await window.evaluate(
    async (input) =>
      (
        window as unknown as {
          auth: { renameUser: (d: unknown) => Promise<unknown> }
        }
      ).auth.renameUser(input),
    { userId, displayName },
  )) as AuthResult
}

async function callDelete(
  window: Page,
  userId: string,
): Promise<AuthResult> {
  return (await window.evaluate(
    async (input) =>
      (
        window as unknown as {
          auth: { deleteUser: (d: unknown) => Promise<unknown> }
        }
      ).auth.deleteUser(input),
    { userId },
  )) as AuthResult
}

async function listUsers(
  window: Page,
): Promise<
  { id: string; displayName: string; createdAt: string }[]
> {
  const res = (await window.evaluate(
    async () =>
      (
        window as unknown as {
          auth: { listUsers: () => Promise<unknown> }
        }
      ).auth.listUsers(),
  )) as AuthResult
  if (!res.success) throw new Error(`listUsers failed: ${res.error}`)
  return (res.data ?? []) as {
    id: string
    displayName: string
    createdAt: string
  }[]
}

async function authStatus(
  window: Page,
): Promise<{ locked: boolean; userId: string | null }> {
  const res = (await window.evaluate(
    async () =>
      (
        window as unknown as { auth: { status: () => Promise<unknown> } }
      ).auth.status(),
  )) as {
    success: boolean
    data: { locked: boolean; userId: string | null; timeoutMs: number }
  }
  return res.data
}

test('@critical e15: WRONG_PASSWORD + WRONG_RECOVERY_KEY returnerar IpcResult.error', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    const PWD = 'e15-correct-passwd-1234'
    const { user, recoveryKey } = await createAndLogin(
      ctx.window,
      'Alice',
      PWD,
    )
    await logout(ctx.window)

    // Fel lösen → success: false, WRONG_PASSWORD
    const wrongPw = await callLogin(ctx.window, user.id, 'not-the-right-one')
    expect(wrongPw.success).toBe(false)
    expect(wrongPw.code).toBe('WRONG_PASSWORD')
    expect((await authStatus(ctx.window)).locked).toBe(true)

    // Fel recovery → success: false, WRONG_RECOVERY_KEY
    const wrongRec = await callRecovery(
      ctx.window,
      user.id,
      'not valid recovery phrase at all absolutely not',
    )
    expect(wrongRec.success).toBe(false)
    expect(wrongRec.code).toBe('WRONG_RECOVERY_KEY')

    // Sedan rätt recovery fungerar (sanity-check att state inte korrumperats)
    const rightRec = await callRecovery(ctx.window, user.id, recoveryKey)
    expect(rightRec.success).toBe(true)
    expect((await authStatus(ctx.window)).locked).toBe(false)
  } finally {
    await ctx.cleanup()
  }
})

test('@critical e15: changePassword — gammalt slutar fungera, nytt fungerar', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    const OLD = 'e15-change-old-1234567'
    const NEW = 'e15-change-new-abcdefg'
    const { user } = await createAndLogin(ctx.window, 'Bob', OLD)

    // Byt lösen (inloggad krävs inte — service accepterar old password)
    const chg = await callChangePassword(ctx.window, user.id, OLD, NEW)
    expect(chg.success).toBe(true)

    await logout(ctx.window)

    // Gammalt lösen nu fel
    const oldFail = await callLogin(ctx.window, user.id, OLD)
    expect(oldFail.success).toBe(false)
    expect(oldFail.code).toBe('WRONG_PASSWORD')

    // Rate-limiter har 1s-backoff efter första miss — vänta ut den innan
    // nästa försök (RATE_LIMITED annars kamouflerar misslyckad login).
    await new Promise((r) => setTimeout(r, 1100))

    // Nytt lösen fungerar
    const newOk = await callLogin(ctx.window, user.id, NEW)
    expect(newOk, `newOk response: ${JSON.stringify(newOk)}`).toMatchObject({
      success: true,
    })
    expect((await authStatus(ctx.window)).locked).toBe(false)
  } finally {
    await ctx.cleanup()
  }
})

test('@critical e15: renameUser persisterar i listUsers', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    const { user } = await createAndLogin(
      ctx.window,
      'Carol',
      'e15-rename-pass-1234',
    )

    const before = await listUsers(ctx.window)
    expect(before.find((u) => u.id === user.id)?.displayName).toBe('Carol')

    const rename = await callRename(ctx.window, user.id, 'Carol Renamed')
    expect(rename.success).toBe(true)

    const after = await listUsers(ctx.window)
    expect(after.find((u) => u.id === user.id)?.displayName).toBe(
      'Carol Renamed',
    )
  } finally {
    await ctx.cleanup()
  }
})

test('@critical e15: deleteUser — låser aktiv user + poppar ur listUsers', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    // Skapa två users så listan inte blir tom efter delete (tom lista skulle
    // auto-routa LockScreen till CreateForm vilket inte är vad vi testar).
    const { user: a } = await createAndLogin(
      ctx.window,
      'Alice',
      'e15-delete-a-1234567',
    )
    await logout(ctx.window)
    const { user: b } = await createAndLogin(
      ctx.window,
      'Bob',
      'e15-delete-b-1234567',
    )

    // Pre-check: Bob är aktiv, båda finns i listan
    expect((await authStatus(ctx.window)).userId).toBe(b.id)
    const pre = await listUsers(ctx.window)
    expect(pre.map((u) => u.id).sort()).toEqual([a.id, b.id].sort())

    // Radera Bob (den aktiva) — ska låsa direkt
    const del = await callDelete(ctx.window, b.id)
    expect(del.success).toBe(true)
    const stPost = await authStatus(ctx.window)
    expect(stPost.locked).toBe(true)
    expect(stPost.userId).toBeNull()

    // Bob är borta, Alice kvar
    const post = await listUsers(ctx.window)
    expect(post.map((u) => u.id)).toEqual([a.id])
  } finally {
    await ctx.cleanup()
  }
})
