/**
 * TT-6 / e11 — Legacy DB migration journey (@critical).
 *
 * Verifies the post-Sprint-T legacy-import flow:
 *  1. A pre-ADR-004 unencrypted v44+ DB exists at the legacy path.
 *  2. New user is created via LockScreen.
 *  3. After recovery-key acknowledgement, LockScreen detects the legacy DB
 *     and shows LegacyPrompt.
 *  4. User clicks "Importera" → LegacyWorking → LegacyDone.
 *  5. After "Fortsätt" the user lands in AppShell with imported data
 *     (companies, fiscal_years, journal_entries) intact.
 *
 * Infrastructure:
 *   - `FRITT_LEGACY_DB_PATH` env (honoured in src/main/index.ts when
 *     FRITT_TEST=1) overrides the production legacy-DB path so this test
 *     never touches ~/Documents/Fritt Bokföring/data.db.
 *   - `seedLegacyDb(path)` writes an unencrypted SQLite file with current-
 *     schema migrations applied + minimal data (1 company, 1 fiscal year,
 *     5 journal_entries). Runs in a Node sub-process to dodge the
 *     better-sqlite3 Electron-ABI conflict.
 */
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from '@playwright/test'
import { seedLegacyDb } from './helpers/seed-legacy-db'

const APP_ENTRY = path.join(__dirname, '../../dist/main/main/index.js')

test('@critical e11: legacy v44 DB → new user → import → data intact', async () => {
  // ── Setup: temp dirs + legacy DB ─────────────────────────────────────
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fritt-e2e-e11-'))
  const userDataDir = path.join(tmpDir, 'userData')
  const downloadDir = path.join(tmpDir, 'downloads')
  const legacyDir = path.join(tmpDir, 'legacy')
  const legacyPath = path.join(legacyDir, 'data.db')
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.mkdirSync(downloadDir, { recursive: true })
  fs.mkdirSync(legacyDir, { recursive: true })

  // Seed an unencrypted v44+ legacy DB at legacyPath via sub-process
  // (Electron-ABI conflict prevents using better-sqlite3 here directly).
  await seedLegacyDb(legacyPath)

  const app = await electron.launch({
    args: [APP_ENTRY],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      FRITT_TEST: '1',
      E2E_USER_DATA: userDataDir,
      E2E_TESTING: 'true',
      E2E_DOWNLOAD_DIR: downloadDir,
      // Honoured by src/main/index.ts when FRITT_TEST=1 (see legacyPath
      // resolution there). Production launches ignore this var.
      FRITT_LEGACY_DB_PATH: legacyPath,
    },
  })
  const window = await app.firstWindow({ timeout: 30_000 })

  try {
    // ── Step 1: LockScreen, no users → CreateForm shown directly ──────
    // Empty users list auto-routes to {kind: 'create'} (LockScreen.tsx:30).
    await expect(
      window.getByRole('heading', { name: 'Fritt Bokföring' }),
    ).toBeVisible({ timeout: 15_000 })

    // Fill displayName + password + confirm
    await window.getByLabel(/Namn/).fill('E11 Test User')
    await window.getByLabel(/^Lösenord/).fill('e2e-e11-password-12345')
    await window.getByLabel(/Bekräfta/).fill('e2e-e11-password-12345')
    await window.getByRole('button', { name: 'Skapa användare' }).click()

    // ── Step 2: Recovery-key display → confirm ─────────────────────────
    await expect(
      window.getByRole('heading', { name: /Återställningsnyckel/ }),
    ).toBeVisible({ timeout: 10_000 })
    // Tick the "I have saved this" checkbox + continue
    await window.getByRole('checkbox').check()
    await window.getByRole('button', { name: /Fortsätt/ }).click()

    // ── Step 3: LegacyPrompt appears ───────────────────────────────────
    await expect(
      window.getByTestId('lockscreen-legacy-import'),
    ).toBeVisible({ timeout: 10_000 })

    // ── Step 4: Click "Importera" → LegacyWorking → LegacyDone ────────
    await window.getByTestId('lockscreen-legacy-import').click()
    await expect(window.getByText(/Importerar data/)).toBeVisible({
      timeout: 5_000,
    })
    await expect(
      window.getByTestId('lockscreen-legacy-continue'),
    ).toBeVisible({ timeout: 30_000 })

    // ── Step 5: Continue → AppShell ───────────────────────────────────
    await window.getByTestId('lockscreen-legacy-continue').click()
    await expect(window.getByTestId('app-ready')).toBeVisible({
      timeout: 15_000,
    })

    // ── Step 6: Verify imported rows via __testApi ────────────────────
    const fiscalYears = await window.evaluate(async () => {
      const res = await (
        window as unknown as {
          api: { listFiscalYears: () => Promise<unknown> }
        }
      ).api.listFiscalYears()
      return (res as { success: boolean; data: Array<{ id: number }> }).data
    })
    expect(fiscalYears.length).toBeGreaterThanOrEqual(1)
    const fyId = fiscalYears[0].id

    const { entries } = (await window.evaluate(
      async (id) =>
        (
          window as unknown as {
            __testApi: { getJournalEntries: (f?: number) => Promise<unknown> }
          }
        ).__testApi.getJournalEntries(id),
      fyId,
    )) as { entries: unknown[]; lines: unknown[] }
    expect(entries.length).toBe(5)

    // Companies: a list endpoint isn't strictly needed — fiscal_year FK
    // proves a company was imported. Could also call api.listCompanies()
    // if/when that channel exists.
  } finally {
    await app.close().catch(() => {})
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
