import { _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const APP_ENTRY = path.join(__dirname, '../dist/main/main/index.js')

export async function launchApp(): Promise<{
  app: ElectronApplication
  window: Page
}> {
  const app = await electron.launch({
    args: [APP_ENTRY],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  })
  const window = await app.firstWindow({ timeout: 60_000 })
  return { app, window }
}

export async function takeScreenshot(page: Page, name: string): Promise<void> {
  const dir = path.join(__dirname, 'test-results')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${name}.png`) })
}
