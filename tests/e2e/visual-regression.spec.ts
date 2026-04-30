/**
 * Sprint 91 — Visual regression tests via Playwright `toHaveScreenshot()`.
 *
 * Catches unintended UI changes by comparing screenshots against committed
 * baselines. Locked to a fixed viewport (1280×800) and freezeClock so dynamic
 * content (current date, "skapad nyss") doesn't cause false positives.
 *
 * **Platform-stability caveat:** baselines genereras på den plattform
 * körningen sker — macOS-baselines matchar inte Linux-CI exakt
 * (font-rendering, antialiasing). För nuvarande scope (lokal regress-detect
 * mellan commits på samma maskin) är det acceptabelt. Om CI-stabilitet
 * krävs senare → använd Docker (mcr.microsoft.com/playwright) med
 * deterministisk baseline.
 *
 * **Uppdatera baselines:** kör `npm run test:visual:update`. Granska diffen
 * innan commit — varje screenshot-ändring är en avsiktlig design-ändring.
 *
 * **Vad fångas:** layout-shift, färgändringar, font-styrkor, padding/spacing,
 * cosmetic regressions. Vad missas: snabba animationer (frusna i screenshot),
 * hover-states (kräver explicit hover före screenshot).
 *
 * **Scenario-val:** stabila empty-states och seeded AppShell-vyer som inte
 * varierar med datum eller verifikationsräknare.
 */
import { test, expect, type Page } from '@playwright/test'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'
import { seedAndFinalizeInvoice, seedCustomer } from './helpers/seed'

/** Skapa + auto-login en testanvändare via __authTestApi (bypass av LockScreen). */
async function createAndLoginTestUser(window: Page): Promise<void> {
  await window.evaluate(async () => {
    await (
      window as unknown as {
        __authTestApi: {
          createAndLoginUser: (d: {
            displayName: string
            password: string
          }) => Promise<unknown>
        }
      }
    ).__authTestApi.createAndLoginUser({
      displayName: 'E2E Visual',
      password: 'visual-test-password-1234',
    })
  })
  // Reload så app:en plockar upp den nu inloggade sessionen
  await window.reload()
}

// Konsekvent viewport för all visuell test
const VIEWPORT = { width: 1280, height: 800 }

// Fryst klocka — använd 2026-04-30 för att matcha existerande test-fixtures
const FROZEN_TIME = '2026-04-30T12:00:00Z'

test.beforeEach(async ({ page: _page }, testInfo) => {
  // Document the policy in test annotations
  testInfo.annotations.push({
    type: 'visual-regression',
    description: 'macOS-only baseline — uppdatera via test:visual:update',
  })
})

test.describe('Visual regression — Fritt Bokföring UI', () => {
  test('lock-screen create-user (initial fresh-db state)', async () => {
    const { window, cleanup } = await launchAppWithFreshDb()
    try {
      await window.setViewportSize(VIEWPORT)
      // Lock-screen är vad användaren ser vid första-start innan auth
      await expect(window.getByText('Skapa en ny användare')).toBeVisible({
        timeout: 15_000,
      })
      await window.waitForTimeout(500)
      await expect(window).toHaveScreenshot('lock-screen-create-user.png', {
        maxDiffPixels: 50,
      })
    } finally {
      await cleanup()
    }
  })

  test('onboarding-wizard efter auth', async () => {
    const { window, cleanup } = await launchAppWithFreshDb()
    try {
      await window.setViewportSize(VIEWPORT)
      await createAndLoginTestUser(window)
      await expect(window.getByTestId('wizard')).toBeVisible({
        timeout: 15_000,
      })
      await window.waitForTimeout(500)
      await expect(window).toHaveScreenshot('onboarding-wizard.png', {
        maxDiffPixels: 50,
      })
    } finally {
      await cleanup()
    }
  })

  test('AppShell tom Overview', async () => {
    const { window, cleanup } = await launchAppWithFreshDb()
    try {
      await window.setViewportSize(VIEWPORT)
      await createAndLoginTestUser(window)
      await seedCompanyViaIPC(window)

      // Freeze klocka via test-API innan reload så dashboard-data är deterministisk
      await window.evaluate(async (iso) => {
        await (
          window as unknown as {
            __testApi: { freezeClock: (s: string) => Promise<unknown> }
          }
        ).__testApi.freezeClock(iso)
      }, FROZEN_TIME)

      await window.reload()
      await expect(window.getByTestId('app-ready')).toBeVisible({
        timeout: 15_000,
      })

      // Navigate to overview (default route)
      await window.evaluate(() => {
        location.hash = '#/overview'
      })
      await expect(window.getByTestId('page-overview')).toBeVisible({
        timeout: 10_000,
      })
      await window.waitForTimeout(500)

      await expect(window).toHaveScreenshot('app-shell-overview-empty.png', {
        maxDiffPixels: 50,
        // Mask dynamic time/date elements som inte fångas av FROZEN_TIME
        // (t.ex. server-side timestamps från IPC-svar)
      })
    } finally {
      await cleanup()
    }
  })

  test('AppShell tom Income (faktura-list utan data)', async () => {
    const { window, cleanup } = await launchAppWithFreshDb()
    try {
      await window.setViewportSize(VIEWPORT)
      await createAndLoginTestUser(window)
      await seedCompanyViaIPC(window)
      await window.evaluate(async (iso) => {
        await (
          window as unknown as {
            __testApi: { freezeClock: (s: string) => Promise<unknown> }
          }
        ).__testApi.freezeClock(iso)
      }, FROZEN_TIME)
      await window.reload()
      await expect(window.getByTestId('app-ready')).toBeVisible({
        timeout: 15_000,
      })
      await window.evaluate(() => {
        location.hash = '#/income'
      })
      await expect(window.getByTestId('page-income')).toBeVisible({
        timeout: 10_000,
      })
      await window.waitForTimeout(500)

      await expect(window).toHaveScreenshot('app-shell-income-empty.png', {
        maxDiffPixels: 50,
      })
    } finally {
      await cleanup()
    }
  })

  test('Income med 3 finaliserade fakturor (table med Pill-status)', async () => {
    const { window, cleanup } = await launchAppWithFreshDb()
    try {
      await window.setViewportSize(VIEWPORT)
      await createAndLoginTestUser(window)
      const { companyId, fiscalYearId } = await seedCompanyViaIPC(window)
      await window.evaluate(async (iso) => {
        await (
          window as unknown as {
            __testApi: { freezeClock: (s: string) => Promise<unknown> }
          }
        ).__testApi.freezeClock(iso)
      }, FROZEN_TIME)

      // Seed 1 customer + 3 finaliserade fakturor med varierande datum
      const counterpartyId = await seedCustomer(window, companyId, 'Acme AB')
      for (let i = 0; i < 3; i++) {
        const day = String(10 + i * 5).padStart(2, '0')
        await seedAndFinalizeInvoice(window, {
          counterpartyId,
          fiscalYearId,
          invoiceDate: `2026-03-${day}`,
          dueDate: `2026-04-${day}`,
          unitPriceOre: 50_000 + i * 10_000,
          quantity: 1,
        })
      }

      await window.reload()
      await expect(window.getByTestId('app-ready')).toBeVisible({
        timeout: 15_000,
      })
      await window.evaluate(() => {
        location.hash = '#/income'
      })
      await expect(window.getByTestId('page-income')).toBeVisible({
        timeout: 10_000,
      })
      // Vänta tills tabellen renderats med rader (TableSkeleton borta)
      await expect(window.getByText('Acme AB').first()).toBeVisible({
        timeout: 10_000,
      })
      // Vänta in sidebar-räknarna (H+G-15) — async list-IPC kan ta extra tid
      await expect(window.getByTestId('nav-income-count')).toHaveText('3', {
        timeout: 5_000,
      })
      await window.waitForTimeout(500)

      await expect(window).toHaveScreenshot('income-with-3-invoices.png', {
        maxDiffPixels: 100, // tabell-render har lite mer drift
      })
    } finally {
      await cleanup()
    }
  })

  test('Bokföringsorder empty (ZoneNuHead + EmptyState)', async () => {
    const { window, cleanup } = await launchAppWithFreshDb()
    try {
      await window.setViewportSize(VIEWPORT)
      await createAndLoginTestUser(window)
      await seedCompanyViaIPC(window)
      await window.evaluate(async (iso) => {
        await (
          window as unknown as {
            __testApi: { freezeClock: (s: string) => Promise<unknown> }
          }
        ).__testApi.freezeClock(iso)
      }, FROZEN_TIME)
      await window.reload()
      await expect(window.getByTestId('app-ready')).toBeVisible({
        timeout: 15_000,
      })
      await window.evaluate(() => {
        location.hash = '#/manual-entries'
      })
      await expect(window.getByTestId('page-manual-entries')).toBeVisible({
        timeout: 10_000,
      })
      await window.waitForTimeout(500)

      await expect(window).toHaveScreenshot('manual-entries-empty.png', {
        maxDiffPixels: 50,
      })
    } finally {
      await cleanup()
    }
  })

  test('Vardag sheet öppen (BokforKostnadSheet placeholder)', async () => {
    const { window, cleanup } = await launchAppWithFreshDb()
    try {
      await window.setViewportSize(VIEWPORT)
      await createAndLoginTestUser(window)
      await seedCompanyViaIPC(window)
      await window.evaluate(async (iso) => {
        await (
          window as unknown as {
            __testApi: { freezeClock: (s: string) => Promise<unknown> }
          }
        ).__testApi.freezeClock(iso)
      }, FROZEN_TIME)
      await window.evaluate(async () => {
        await (
          window as unknown as {
            api: { setSetting: (k: string, v: string) => Promise<unknown> }
          }
        ).api.setSetting('ui_mode', 'vardag')
      })

      await window.reload()
      await expect(window.getByTestId('vardag-hero')).toBeVisible({
        timeout: 15_000,
      })
      await window.getByTestId('vardag-bigbtn-kostnad').click()
      await expect(window.getByTestId('bottom-sheet')).toBeVisible({
        timeout: 5_000,
      })
      await window.waitForTimeout(300)

      await expect(window).toHaveScreenshot('vardag-sheet-kostnad.png', {
        maxDiffPixels: 80, // sheet animations stabiliseras inte alltid exakt
      })
    } finally {
      await cleanup()
    }
  })

  test('Vardag sheet öppen (SkapaFakturaSheet placeholder)', async () => {
    const { window, cleanup } = await launchAppWithFreshDb()
    try {
      await window.setViewportSize(VIEWPORT)
      await createAndLoginTestUser(window)
      await seedCompanyViaIPC(window)
      await window.evaluate(async (iso) => {
        await (
          window as unknown as {
            __testApi: { freezeClock: (s: string) => Promise<unknown> }
          }
        ).__testApi.freezeClock(iso)
      }, FROZEN_TIME)
      await window.evaluate(async () => {
        await (
          window as unknown as {
            api: { setSetting: (k: string, v: string) => Promise<unknown> }
          }
        ).api.setSetting('ui_mode', 'vardag')
      })

      await window.reload()
      await expect(window.getByTestId('vardag-hero')).toBeVisible({
        timeout: 15_000,
      })
      await window.getByTestId('vardag-bigbtn-faktura').click()
      await expect(window.getByTestId('bottom-sheet')).toBeVisible({
        timeout: 5_000,
      })
      await window.waitForTimeout(300)

      await expect(window).toHaveScreenshot('vardag-sheet-faktura.png', {
        maxDiffPixels: 80,
      })
    } finally {
      await cleanup()
    }
  })

  test('Vardag hero (BigButtons + status-pills + kbd-hints)', async () => {
    const { window, cleanup } = await launchAppWithFreshDb()
    try {
      await window.setViewportSize(VIEWPORT)
      await createAndLoginTestUser(window)
      await seedCompanyViaIPC(window)
      await window.evaluate(async (iso) => {
        await (
          window as unknown as {
            __testApi: { freezeClock: (s: string) => Promise<unknown> }
          }
        ).__testApi.freezeClock(iso)
      }, FROZEN_TIME)

      // Sätt ui_mode till vardag innan reload så ModeRouter renderar VardagApp
      await window.evaluate(async () => {
        await (
          window as unknown as {
            api: { setSetting: (k: string, v: string) => Promise<unknown> }
          }
        ).api.setSetting('ui_mode', 'vardag')
      })

      await window.reload()
      await expect(window.getByTestId('vardag-shell')).toBeVisible({
        timeout: 15_000,
      })
      await expect(window.getByTestId('vardag-hero')).toBeVisible({
        timeout: 10_000,
      })
      await window.waitForTimeout(500)

      await expect(window).toHaveScreenshot('vardag-hero.png', {
        maxDiffPixels: 50,
      })
    } finally {
      await cleanup()
    }
  })
})
