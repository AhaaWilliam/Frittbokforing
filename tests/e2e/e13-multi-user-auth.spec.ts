/**
 * TT-6 / e13 — Multi-user auth + isolation + auto-lock (@critical).
 *
 * Pillars:
 *  1. Three users created via __authTestApi.createAndLoginUser
 *  2. User A seeds 5 invoices, logs out
 *  3. User B logs in (password) → sees 0 invoices (per-user SQLCipher DB)
 *  4. User C logs in via recovery key → sees 0 invoices (isolation again)
 *  5. setTimeoutMs(60_000) + lockNow → auth.status reports locked
 *
 * Notes:
 *  - We avoid the LockScreen UI for create + login. The createAndLoginUser
 *    test endpoint bypasses the recovery-key-confirm ceremony so a single
 *    test can switch between several users quickly.
 *  - For real password / recovery login between users we go through the
 *    production IPC (auth.login / auth.loginWithRecovery) so we exercise
 *    the same code path the LockScreen would.
 *  - "0 invoices visible" is verified at the data layer (api.listInvoices)
 *    rather than via UI, since the UI also has to mount AppShell first.
 */
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'
import { seedCustomer, seedAndFinalizeInvoice } from './helpers/seed'

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
  const res = (await window.evaluate(async () =>
    (
      window as unknown as {
        auth: { logout: () => Promise<{ success: boolean; error?: string }> }
      }
    ).auth.logout(),
  )) as { success: boolean; error?: string }
  if (!res.success) throw new Error(`logout failed: ${res.error}`)
}

async function loginPassword(
  window: Page,
  userId: string,
  password: string,
): Promise<void> {
  const res = (await window.evaluate(
    async (input) =>
      (
        window as unknown as {
          auth: {
            login: (d: {
              userId: string
              password: string
            }) => Promise<{ success: boolean; error?: string }>
          }
        }
      ).auth.login(input),
    { userId, password },
  )) as { success: boolean; error?: string }
  if (!res.success) throw new Error(`login failed: ${res.error}`)
}

async function loginRecovery(
  window: Page,
  userId: string,
  recoveryPhrase: string,
): Promise<void> {
  const res = (await window.evaluate(
    async (input) =>
      (
        window as unknown as {
          auth: {
            loginWithRecovery: (d: {
              userId: string
              recoveryPhrase: string
            }) => Promise<{ success: boolean; error?: string }>
          }
        }
      ).auth.loginWithRecovery(input),
    { userId, recoveryPhrase },
  )) as { success: boolean; error?: string }
  if (!res.success) throw new Error(`loginRecovery failed: ${res.error}`)
}

async function authStatus(
  window: Page,
): Promise<{ locked: boolean; userId: string | null; timeoutMs: number }> {
  const res = (await window.evaluate(async () =>
    (
      window as unknown as {
        auth: { status: () => Promise<unknown> }
      }
    ).auth.status(),
  )) as {
    success: boolean
    data: { locked: boolean; userId: string | null; timeoutMs: number }
  }
  return res.data
}

async function getInvoicesForActiveFy(window: Page): Promise<unknown[]> {
  // Use __testApi.getInvoices() with no fyId to get every row in the
  // currently-open per-user DB.
  return (await window.evaluate(async () =>
    (
      window as unknown as {
        __testApi: { getInvoices: () => Promise<unknown[]> }
      }
    ).__testApi.getInvoices(),
  )) as unknown[]
}

test('@critical e13: 3 users, password+recovery login, DB isolation, auto-lock', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    const PWD_A = 'e13-aaaaaaaa-1234'
    const PWD_B = 'e13-bbbbbbbb-1234'
    const PWD_C = 'e13-cccccccc-1234'

    // ── Step 1: Create user A and seed 5 invoices ────────────────────
    const a = await createAndLogin(ctx.window, 'Alice', PWD_A)
    const { fiscalYearId: fyA } = await seedCompanyViaIPC(ctx.window, {
      name: 'Alice AB',
      orgNumber: '556001-0001',
    })
    const custA = await seedCustomer(ctx.window, 'Kund Alice')
    for (let i = 0; i < 5; i++) {
      await seedAndFinalizeInvoice(ctx.window, {
        counterpartyId: custA,
        fiscalYearId: fyA,
        invoiceDate: '2026-03-15',
        dueDate: '2026-04-14',
        unitPriceOre: 10_000 * (i + 1),
        quantity: 1,
      })
    }
    const aliceInvoices = await getInvoicesForActiveFy(ctx.window)
    expect(aliceInvoices).toHaveLength(5)

    // ── Step 2: Logout A → status locked ─────────────────────────────
    await logout(ctx.window)
    expect((await authStatus(ctx.window)).locked).toBe(true)

    // ── Step 3: Create user B (separate vault dir + per-user DB) ─────
    const b = await createAndLogin(ctx.window, 'Bob', PWD_B)
    expect(b.user.id).not.toBe(a.user.id)
    // Verify isolation: B's DB has 0 invoices.
    const bobInvoices = await getInvoicesForActiveFy(ctx.window)
    expect(bobInvoices).toHaveLength(0)

    // Re-login A via password to confirm A's DB is intact.
    await logout(ctx.window)
    await loginPassword(ctx.window, a.user.id, PWD_A)
    const aliceInvoicesAgain = await getInvoicesForActiveFy(ctx.window)
    expect(aliceInvoicesAgain).toHaveLength(5)

    // ── Step 4: Create user C, then login via recovery key ───────────
    await logout(ctx.window)
    const c = await createAndLogin(ctx.window, 'Carol', PWD_C)
    await logout(ctx.window)
    await loginRecovery(ctx.window, c.user.id, c.recoveryKey)
    const carolInvoices = await getInvoicesForActiveFy(ctx.window)
    expect(carolInvoices).toHaveLength(0)

    // ── Step 5: Auto-lock — set 60s timeout, force lockNow ───────────
    await ctx.window.evaluate(
      async (ms) =>
        (
          window as unknown as {
            __authTestApi: { setTimeoutMs: (m: number) => Promise<unknown> }
          }
        ).__authTestApi.setTimeoutMs(ms),
      60_000,
    )
    const stPre = await authStatus(ctx.window)
    expect(stPre.locked).toBe(false)
    expect(stPre.timeoutMs).toBe(60_000)

    // Rather than sleeping 60s in CI, exercise lockNow which the auto-lock
    // path also invokes when the inactivity timer fires. The post-condition
    // is identical: keyStore.lock() → onLock → DB closed → status.locked=true.
    await ctx.window.evaluate(async () =>
      (
        window as unknown as {
          __authTestApi: { lockNow: () => Promise<unknown> }
        }
      ).__authTestApi.lockNow(),
    )
    const stPost = await authStatus(ctx.window)
    expect(stPost.locked).toBe(true)
    expect(stPost.userId).toBeNull()
  } finally {
    await ctx.cleanup()
  }
})
