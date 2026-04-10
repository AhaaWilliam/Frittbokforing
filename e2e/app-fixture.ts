/**
 * Playwright fixture that launches the Electron app with per-test DB isolation.
 *
 * Every test.describe block gets its own fresh database and userData directory
 * so tests never interfere with each other.
 */
import { test as base, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import os from 'os'

const APP_ENTRY = path.join(__dirname, '../dist/main/main/index.js')

export interface AppFixture {
  app: ElectronApplication
  window: Page
  dbPath: string
  downloadDir: string
}

export const test = base.extend<AppFixture>({
  // eslint-disable-next-line no-empty-pattern
  app: async ({}, use, testInfo) => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), `fritt-e2e-${testInfo.workerIndex}-`),
    )
    const dbPath = path.join(tmpDir, 'test.db')
    const userDataDir = path.join(tmpDir, 'userData')
    const downloadDir = path.join(tmpDir, 'downloads')
    fs.mkdirSync(userDataDir, { recursive: true })
    fs.mkdirSync(downloadDir, { recursive: true })

    const app = await electron.launch({
      args: [APP_ENTRY],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DB_PATH: dbPath,
        E2E_USER_DATA: userDataDir,
        E2E_TESTING: 'true',
        E2E_DOWNLOAD_DIR: downloadDir,
      },
    })

    await use(app)
    await app.close()

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true })
  },

  window: async ({ app }, use) => {
    const window = await app.firstWindow({ timeout: 60_000 })
    await use(window)
  },

  dbPath: async ({ app }, use) => {
    // Extract DB_PATH from the env we passed to electron.launch
    // We read it back from the app's evaluate
    const dbPath = await app.evaluate(async ({ app: electronApp }) => {
      return process.env.DB_PATH ?? ''
    })
    await use(dbPath)
  },

  downloadDir: async ({ app }, use) => {
    const dir = await app.evaluate(async () => {
      return process.env.E2E_DOWNLOAD_DIR ?? ''
    })
    await use(dir)
  },
})

export { expect } from '@playwright/test'

export async function takeScreenshot(
  page: Page,
  name: string,
): Promise<void> {
  const dir = path.join(__dirname, 'test-results')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${name}.png`) })
}
