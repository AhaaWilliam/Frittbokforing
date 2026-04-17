/**
 * S49 — Sanity test: Electron app starts and shows UI.
 * Router probe: hash-router navigation works from Playwright.
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'

test('Electron-app startar med tom db och visar onboarding', async () => {
  const t0 = Date.now()
  const { window, cleanup } = await launchAppWithFreshDb()
  try {
    console.log(`App start: ${Date.now() - t0}ms`)
    await expect(window).toHaveTitle(/Fritt Bokföring/)
    // Empty db → no company → onboarding wizard
    await expect(window.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
  } finally {
    await cleanup()
  }
})

test('hash-router navigation från Playwright fungerar', async () => {
  const { app, window, cleanup } = await launchAppWithFreshDb()
  try {
    // Seed company via IPC so app shows AppShell
    await seedCompanyViaIPC(window)

    // Reload to pick up the new company
    await window.reload()
    await expect(window.getByTestId('app-ready')).toBeVisible({
      timeout: 15_000,
    })

    // Navigate via hash
    await window.evaluate(() => {
      location.hash = '#/income'
    })
    await expect(window.getByTestId('page-income')).toBeVisible({
      timeout: 10_000,
    })

    // Navigate to another page
    await window.evaluate(() => {
      location.hash = '#/expenses'
    })
    await expect(window.getByTestId('page-expenses')).toBeVisible({
      timeout: 10_000,
    })
  } finally {
    await cleanup()
  }
})
