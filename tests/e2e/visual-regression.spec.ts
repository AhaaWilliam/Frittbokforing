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
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'

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
  test('onboarding-wizard initial-vy', async () => {
    const { window, cleanup } = await launchAppWithFreshDb()
    try {
      await window.setViewportSize(VIEWPORT)
      await expect(window.getByTestId('wizard')).toBeVisible({
        timeout: 15_000,
      })
      // Allow fonts to settle + skip animation
      await window.waitForTimeout(500)
      await expect(window).toHaveScreenshot('onboarding-wizard.png', {
        maxDiffPixels: 50, // tolerera marginell antialias-drift
      })
    } finally {
      await cleanup()
    }
  })

  test('AppShell tom Overview', async () => {
    const { window, cleanup } = await launchAppWithFreshDb()
    try {
      await window.setViewportSize(VIEWPORT)
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
})
