/**
 * E10 — Persistence tests.
 *
 * Verifies that data survives an app restart (same DB_PATH).
 * This test creates data, closes the app, re-launches, and checks the data.
 */
import { _electron as electron } from '@playwright/test'
import { test as base, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { completeOnboarding, navigateTo, createCustomer } from './actions'

const APP_ENTRY = path.join(__dirname, '../dist/main/main/index.js')

// Custom fixture that does NOT auto-close — we manage lifecycle manually.
const test = base.extend<{ tmpDir: string }>({
  // eslint-disable-next-line no-empty-pattern
  tmpDir: async ({}, use, testInfo) => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), `fritt-e2e-persist-${testInfo.workerIndex}-`),
    )
    fs.mkdirSync(path.join(tmpDir, 'userData'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'downloads'), { recursive: true })
    await use(tmpDir)
    fs.rmSync(tmpDir, { recursive: true, force: true })
  },
})

async function launchWithDir(tmpDir: string): Promise<{
  app: ElectronApplication
  window: Page
}> {
  const app = await electron.launch({
    args: [APP_ENTRY],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DB_PATH: path.join(tmpDir, 'test.db'),
      E2E_USER_DATA: path.join(tmpDir, 'userData'),
      E2E_TESTING: 'true',
      E2E_DOWNLOAD_DIR: path.join(tmpDir, 'downloads'),
    },
  })
  const window = await app.firstWindow({ timeout: 60_000 })
  return { app, window }
}

test.describe('E10 — Persistence', () => {
  test('data survives app restart', async ({ tmpDir }) => {
    // --- First session: create company and customer ---
    const session1 = await launchWithDir(tmpDir)

    await completeOnboarding(session1.window, {
      name: 'Persist AB',
      orgNumber: '5566778907',
    })

    await navigateTo(session1.window, 'customers')
    await createCustomer(session1.window, { name: 'Beständig Kund' })

    // Verify customer appears
    await expect(
      session1.window.getByText('Beständig Kund').first(),
    ).toBeVisible()

    // Close app
    await session1.app.close()

    // --- Second session: verify data persists ---
    const session2 = await launchWithDir(tmpDir)

    // Should skip wizard and show dashboard directly
    await session2.window.waitForSelector('[data-testid="app-ready"]', {
      timeout: 30_000,
    })

    // Company name should be visible
    await expect(
      session2.window.locator('text=Persist AB'),
    ).toBeVisible()

    // Navigate to customers — our customer should still be there
    await navigateTo(session2.window, 'customers')
    await expect(
      session2.window.getByText('Beständig Kund').first(),
    ).toBeVisible()

    await session2.app.close()
  })
})

export { test, expect }
