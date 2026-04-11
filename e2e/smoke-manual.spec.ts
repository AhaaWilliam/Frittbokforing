/**
 * Manual smoke-test: 4 flows verifying Electron 41.1.0 migration.
 * Run with: npx playwright test e2e/smoke-manual.spec.ts
 *
 * All flows share ONE app instance and db so data persists across tests.
 */
import { test, expect } from '@playwright/test'
import { _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import {
  completeOnboarding,
  navigateTo,
  createProduct,
  createDraftInvoice,
} from './actions'
import fs from 'fs'
import path from 'path'
import os from 'os'

const APP_ENTRY = path.join(__dirname, '../dist/main/main/index.js')

let app: ElectronApplication
let page: Page
let tmpDir: string
let dbPath: string
let downloadDir: string

test.beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fritt-smoke-'))
  dbPath = path.join(tmpDir, 'smoke.db')
  downloadDir = path.join(tmpDir, 'downloads')
  fs.mkdirSync(downloadDir, { recursive: true })

  app = await electron.launch({
    args: [APP_ENTRY],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DB_PATH: dbPath,
      E2E_TESTING: 'true',
      E2E_DOWNLOAD_DIR: downloadDir,
    },
  })
  page = await app.firstWindow({ timeout: 60_000 })
  await completeOnboarding(page)
})

test.afterAll(async () => {
  await app?.close()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

test.describe.serial('Smoke — Electron 41.1.0 migration', () => {
  // ─── Flöde 1: Skapa kund ───────────────────────────────────────────────────
  test('Flöde 1 — Skapa kund med alla fält, verifiera i listan och detalj', async () => {
    await navigateTo(page, 'customers')

    await page.click('button:has-text("+ Ny kund")')
    await page.getByTestId('customer-name').fill('Smoke Test AB')
    await page.getByTestId('customer-org_number').fill('551234-5678')
    await page.getByTestId('customer-address_line1').fill('Storgatan 1')
    await page.getByTestId('customer-postal_code').fill('111 22')
    await page.getByTestId('customer-city').fill('Stockholm')
    await page.getByTestId('customer-email').fill('smoke@test.se')
    await page.click('button[type="submit"]:has-text("Spara")')

    await page.waitForSelector('text=Smoke Test AB', { timeout: 10_000 })
    await page.click('text=Smoke Test AB')
    await page.waitForTimeout(500)

    const content = await page.textContent('[data-testid="page-customers"]')
    expect(content).toContain('Smoke Test AB')
    expect(content).toContain('551234-5678')
    expect(content).toContain('Storgatan 1')
    expect(content).toContain('Stockholm')
    expect(content).toContain('smoke@test.se')
  })

  // ─── Flöde 2: Skapa faktura ────────────────────────────────────────────────
  test('Flöde 2 — Skapa produkt och utkastfaktura, verifiera i listan', async () => {
    await navigateTo(page, 'products')
    await createProduct(page, {
      name: 'Smoke-tjänst',
      priceKr: '1000',
      description: 'Konsulttjänst för smoke-test',
    })

    await navigateTo(page, 'income')
    await createDraftInvoice(page, {
      customerName: 'Smoke Test AB',
      productName: 'Smoke-tjänst',
      description: 'Smoke-test rad',
      quantity: 2,
      unitPriceKr: 1000,
      invoiceDate: '2025-06-15',
    })

    // Verify draft is in the list
    const draftTab = page.locator('button:has-text("Utkast")')
    if (await draftTab.isVisible().catch(() => false)) {
      await draftTab.click()
    }
    await expect(page.locator('text=Smoke Test AB')).toBeVisible({
      timeout: 10_000,
    })
  })

  // ─── Flöde 3: SIE4-export ─────────────────────────────────────────────────
  test('Flöde 3 — SIE4-export med korrekt innehåll och kodning', async () => {
    await navigateTo(page, 'export')

    await page.click('button:has-text("SIE4")')
    await page.waitForTimeout(3_000)

    const files = fs.readdirSync(downloadDir)
    const sieFile = files.find((f) => f.endsWith('.se'))
    expect(sieFile).toBeTruthy()

    const filePath = path.join(downloadDir, sieFile!)
    const buf = fs.readFileSync(filePath)
    const content = buf.toString('latin1')

    expect(content).toContain('#FLAGGA')
    expect(content).toContain('#FNAMN')
    expect(content).toContain('#ORGNR')
    expect(content).toContain('#KPTYP')

    // SIE4 must NOT have UTF-8 BOM
    const hasUtf8Bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
    expect(hasUtf8Bom).toBe(false)
  })

  // ─── Flöde 4: Persistens ──────────────────────────────────────────────────
  test('Flöde 4 — Data överlever app-restart', async () => {
    await app.close()

    // Relaunch with same DB
    app = await electron.launch({
      args: [APP_ENTRY],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DB_PATH: dbPath,
        E2E_TESTING: 'true',
        E2E_DOWNLOAD_DIR: downloadDir,
      },
    })
    page = await app.firstWindow({ timeout: 60_000 })
    await page.waitForSelector('[data-testid="app-ready"]', { timeout: 30_000 })

    // Verify customer persisted
    await navigateTo(page, 'customers')
    await expect(page.locator('text=Smoke Test AB')).toBeVisible({ timeout: 10_000 })

    // Verify product persisted
    await navigateTo(page, 'products')
    await expect(page.locator('text=Smoke-tjänst')).toBeVisible({ timeout: 10_000 })

    // Verify invoice persisted
    await navigateTo(page, 'income')
    const draftTab = page.locator('button:has-text("Utkast")')
    if (await draftTab.isVisible().catch(() => false)) {
      await draftTab.click()
    }
    await expect(page.locator('text=Smoke Test AB')).toBeVisible({ timeout: 10_000 })
  })
})
