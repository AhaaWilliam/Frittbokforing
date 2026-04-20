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
 * Skipped pending an env-override for the legacy path:
 *   The legacy path is resolved via `legacyDbDefaultPath(app.getPath('documents'))`
 *   in `src/main/index.ts`. Production-only — no FRITT_LEGACY_DB_PATH env exists.
 *   E2E cannot point at a temp file without writing into the user's real
 *   ~/Documents/Fritt Bokföring/data.db, which is unsafe.
 *
 * NEEDED HELPER (TODO):
 *   - Add FRITT_LEGACY_DB_PATH env honoured in src/main/index.ts when
 *     FRITT_TEST=1, OR a __testApi:setLegacyPath endpoint that overrides
 *     the path before LockScreen calls auth:legacy-check.
 *   - Add a helper `seedLegacyDb(path, version)` in tests/e2e/helpers/
 *     that writes an unencrypted SQLite file with a known v44+ schema
 *     (companies + fiscal_years + journal_entries seeded via raw INSERTs)
 *     using better-sqlite3 in a sub-process to dodge the ABI conflict.
 *
 * When the helper lands, remove `.skip` and the spec should pass as-is.
 */
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from '@playwright/test'
import { randomUUID } from 'node:crypto'

const APP_ENTRY = path.join(__dirname, '../../dist/main/main/index.js')

test.skip('@critical e11: legacy v44 DB → new user → import → data intact', async () => {
  // ── Setup: temp dirs + legacy DB ─────────────────────────────────────
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fritt-e2e-e11-'))
  const userDataDir = path.join(tmpDir, 'userData')
  const downloadDir = path.join(tmpDir, 'downloads')
  const legacyDir = path.join(tmpDir, 'legacy')
  const legacyPath = path.join(legacyDir, 'data.db')
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.mkdirSync(downloadDir, { recursive: true })
  fs.mkdirSync(legacyDir, { recursive: true })

  // TODO: replace with `seedLegacyDb(legacyPath, { version: 44 })` helper.
  // Spawn a Node sub-process that uses better-sqlite3 to write a pre-auth
  // unencrypted DB with: 1 company, 1 fiscal_year, 5 journal_entries.
  // Cannot use better-sqlite3 in this process due to Electron ABI rebuild.
  // For now this would throw — hence the .skip above.
  throw new Error(
    'seedLegacyDb helper not yet implemented — see file header TODO',
  )

  /* eslint-disable no-unreachable */
  const app = await electron.launch({
    args: [APP_ENTRY],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      FRITT_TEST: '1',
      E2E_USER_DATA: userDataDir,
      E2E_TESTING: 'true',
      E2E_DOWNLOAD_DIR: downloadDir,
      // TODO: requires src/main/index.ts to honour this when FRITT_TEST=1.
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
  /* eslint-enable no-unreachable */
})
