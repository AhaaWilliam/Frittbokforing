/**
 * B2 — backup → restore round-trip.
 *
 * Production flow:
 *   1. backup:create  → encrypted SQLCipher backup written to disk
 *   2. backup:restore-dialog → validates file, copies to DB_PATH, calls
 *      app.relaunch() + app.exit(0)
 *   3. Relaunch → app opens fresh with restored DB
 *
 * E2E limitations (documented per task spec):
 *   (a) backup:restore-dialog calls app.exit(0), which kills the Playwright
 *       session — impossible to assert post-restore state from the same
 *       Playwright connection.
 *   (b) backup:restore-dialog calls app.exit(0) after the rename, which kills
 *       the Playwright session — impossible to assert post-restore state from
 *       the same Playwright connection. Production restoreBackup now correctly
 *       writes to db.name (vault path) rather than the legacy getDbPath()
 *       constant (Sprint T regression fixed). The file-copy simulation below
 *       mirrors exactly what production restoreBackup does.
 *
 * Test approach (Alt A — re-launch with same userData):
 *   • backup:create is exercised via the real production IPC, which writes an
 *     encrypted SQLCipher copy to E2E_DOWNLOAD_DIR.
 *   • "Restore" is simulated by fs.copyFileSync of the backup to the vault DB
 *     path. No better-sqlite3 in the test process (M148 compliant). WAL/SHM
 *     files are deleted exactly as production restoreBackup does.
 *   • "Relaunch" is simulated by closing App1 (Playwright app.close() waits
 *     for process exit, ensuring closeDb() ran) and launching App2 with the
 *     same userData dir.
 *   • App2 re-uses the same auth vault (same users.json, same keys.json). The
 *     cipher key is re-derived from the same password → opens the backup file
 *     successfully.
 *   • Post-restore assertions verify company.org_number, fiscal_year.start_date,
 *     and invoice count/amount survive the round-trip.
 *
 * Invariant tested: backup:create captures correct DB state; the backed-up
 * file can be opened by a fresh app instance using the original credentials;
 * seeded data is intact after the round-trip.
 */
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { _electron as electron } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'
import { seedCompanyViaIPC } from '../helpers/launch-app'
import { seedCustomer, seedAndFinalizeInvoice } from '../helpers/seed'
import { getInvoices } from '../helpers/assertions'

const APP_ENTRY = path.join(__dirname, '../../../dist/main/main/index.js')

const TEST_PASSWORD = 'e2e-backup-restore-pw-12345'
const TEST_DISPLAY_NAME = 'Backup Test User'
const ORG_NUMBER = '556099-0099'
const UNIT_PRICE_ORE = 100_000 // 1000 kr excl VAT
// 25 % VAT (MP1) → total = 100_000 * 1.25 = 125_000 öre
const EXPECTED_TOTAL_ORE = 125_000

// ── Auth helpers (inline, mirrors e13-multi-user-auth.spec.ts) ─────────────

async function createAndLogin(
  window: Page,
  displayName: string,
  password: string,
): Promise<{ user: { id: string; displayName: string; createdAt: string } }> {
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
  )) as { user: { id: string; displayName: string; createdAt: string } }
  if (!res?.user) throw new Error('createAndLogin: no user returned')
  return res
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
  if (!res.success) throw new Error(`loginPassword failed: ${res.error}`)
}

// ── App launch helper ──────────────────────────────────────────────────────

function buildEnv(userDataDir: string, downloadDir: string) {
  return {
    ...process.env,
    NODE_ENV: 'test',
    FRITT_TEST: '1',
    // Legacy path override (used by getDbPath() / resolveDbPath — NOT the vault
    // path used after auth unlock; included for consistency with launchAppWithFreshDb)
    FRITT_DB_PATH: path.join(userDataDir, `legacy-${randomUUID()}.db`),
    E2E_USER_DATA: userDataDir,
    E2E_TESTING: 'true',
    E2E_DOWNLOAD_DIR: downloadDir,
  }
}

async function launchApp(
  userDataDir: string,
  downloadDir: string,
): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await electron.launch({
    args: [APP_ENTRY],
    env: buildEnv(userDataDir, downloadDir),
  })
  const window = await app.firstWindow({ timeout: 30_000 })
  return { app, window }
}

// ── Test ───────────────────────────────────────────────────────────────────

test('backup → restore round-trip preserves company + invoice data', async () => {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'fritt-backup-restore-'),
  )
  const userDataDir = path.join(tmpDir, 'userData')
  const downloadDir = path.join(tmpDir, 'downloads')
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.mkdirSync(downloadDir, { recursive: true })

  let userId: string
  let backupFilePath: string
  let fiscalYearId: number

  // ── Phase 1: Seed data + create backup ──────────────────────────────────
  const { app: app1, window: win1 } = await launchApp(userDataDir, downloadDir)
  try {
    const { user } = await createAndLogin(
      win1,
      TEST_DISPLAY_NAME,
      TEST_PASSWORD,
    )
    userId = user.id

    const { fiscalYearId: fyId } = await seedCompanyViaIPC(win1, {
      orgNumber: ORG_NUMBER,
    })
    fiscalYearId = fyId
    await win1.reload()

    const custId = await seedCustomer(win1, 'Backup Test Kund AB')
    await seedAndFinalizeInvoice(win1, {
      counterpartyId: custId,
      fiscalYearId,
      invoiceDate: '2026-03-15',
      dueDate: '2026-04-14',
      unitPriceOre: UNIT_PRICE_ORE,
      quantity: 1,
    })

    // Verify invoice was created before taking backup
    const invoicesBefore = await getInvoices(win1, fiscalYearId)
    expect(invoicesBefore.length).toBe(1)
    expect(invoicesBefore[0].total_amount_ore).toBe(EXPECTED_TOTAL_ORE)

    // Create backup via production IPC
    const backupResult = (await win1.evaluate(() =>
      (
        window as unknown as {
          api: { backupCreate: () => Promise<{ filePath: string | null }> }
        }
      ).api.backupCreate(),
    )) as { filePath: string | null }

    expect(backupResult.filePath).toBeTruthy()
    backupFilePath = backupResult.filePath!

    // Verify backup file exists and is non-empty
    expect(fs.existsSync(backupFilePath)).toBe(true)
    expect(fs.statSync(backupFilePath).size).toBeGreaterThan(0)
  } finally {
    // app.close() waits for process exit — ensures closeDb() + WAL checkpoint
    // ran before we copy the backup over the vault DB.
    await app1.close().catch(() => {})
  }

  // ── Phase 2: Simulate restore (file-copy approach) ───────────────────────
  // Vault DB layout (UserVault.dbPath): <userDataDir>/auth/users/<userId>/app.db
  const vaultDbPath = path.join(
    userDataDir,
    'auth',
    'users',
    userId!,
    'app.db',
  )
  // Copy backup to vault path (no better-sqlite3 — M148 compliant)
  fs.copyFileSync(backupFilePath!, vaultDbPath)
  // Delete stale WAL/SHM — same cleanup as production restoreBackup
  for (const suffix of ['-wal', '-shm']) {
    const p = vaultDbPath + suffix
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }

  // ── Phase 3: "Relaunch" — verify data in fresh app instance ─────────────
  const { app: app2, window: win2 } = await launchApp(userDataDir, downloadDir)
  try {
    // Re-login: same credentials → same cipher key → opens the backup file
    await loginPassword(win2, userId!, TEST_PASSWORD)

    // Assert: company restored
    const companiesResult = (await win2.evaluate(() =>
      (
        window as unknown as {
          api: {
            listCompanies: () => Promise<{
              success: boolean
              data: Array<{ org_number: string }>
            }>
          }
        }
      ).api.listCompanies(),
    )) as { success: boolean; data: Array<{ org_number: string }> }

    expect(companiesResult.success).toBe(true)
    expect(companiesResult.data.length).toBe(1)
    expect(companiesResult.data[0].org_number).toBe(ORG_NUMBER)

    // Assert: fiscal year restored
    const fyResult = (await win2.evaluate(() =>
      (
        window as unknown as {
          api: {
            listFiscalYears: () => Promise<{
              success: boolean
              data: Array<{ start_date: string; end_date: string }>
            }>
          }
        }
      ).api.listFiscalYears(),
    )) as { success: boolean; data: Array<{ start_date: string }> }

    expect(fyResult.success).toBe(true)
    expect(fyResult.data.length).toBe(1)
    expect(fyResult.data[0].start_date).toBe('2026-01-01')

    // Assert: invoice restored with correct amount
    const invoicesAfter = await getInvoices(win2, fiscalYearId!)
    expect(invoicesAfter.length).toBe(1)
    expect(invoicesAfter[0].total_amount_ore).toBe(EXPECTED_TOTAL_ORE)
  } finally {
    await app2.close().catch(() => {})
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
