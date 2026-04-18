/**
 * Sprint I F49-c1 — Skip-links + landmark-verifiering.
 *
 * Verifierar att:
 *  - Skip-links finns i DOM efter app-start
 *  - Klick på skip-to-main fokuserar #main-content
 *  - Klick på skip-to-nav fokuserar #primary-nav
 *  - Bulk-skip renderas endast när bulk-bar är aktiv (invoice-selektion)
 *  - Hash-routingen bryts inte av skip-link-clicks
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'
import { seedCustomer, seedAndFinalizeInvoice } from './helpers/seed'

test('Sprint I F49-c1: skip-links finns + main/nav fokuseras vid klick', async () => {
  const { window, cleanup } = await launchAppWithFreshDb()
  try {
    await seedCompanyViaIPC(window)
    await window.reload()
    await expect(window.getByTestId('app-ready')).toBeVisible({
      timeout: 15_000,
    })

    // Baseline: main + nav skip-links finns
    await expect(window.getByTestId('skip-to-main')).toBeAttached()
    await expect(window.getByTestId('skip-to-nav')).toBeAttached()
    // Bulk-skip finns INTE när ingen bulk-selektion är aktiv
    await expect(window.getByTestId('skip-to-bulk')).toHaveCount(0)

    // Fokus + Enter på skip-to-main → #main-content fokuseras.
    // Skip-links är sr-only (visuellt dolda tills fokuserad), så click()
    // kan inte användas — Playwrights actionability-check ser dem som
    // invisible. Simulera det verkliga keyboard-flödet: Tab (focus) + Enter.
    const hashBefore = await window.evaluate(() => location.hash)
    await window.getByTestId('skip-to-main').focus()
    await window.keyboard.press('Enter')
    const mainFocused = await window.evaluate(
      () => document.activeElement?.id === 'main-content',
    )
    expect(mainFocused).toBe(true)

    // Verifiera att hash INTE förändrades av skip-link-aktiveringen
    const hashAfter = await window.evaluate(() => location.hash)
    expect(hashAfter).toBe(hashBefore)

    // Fokus + Enter på skip-to-nav → #primary-nav fokuseras
    await window.getByTestId('skip-to-nav').focus()
    await window.keyboard.press('Enter')
    const navFocused = await window.evaluate(
      () => document.activeElement?.id === 'primary-nav',
    )
    expect(navFocused).toBe(true)

    // Landmarks finns med rätt id
    expect(await window.locator('main#main-content').count()).toBe(1)
    expect(await window.locator('nav#primary-nav').count()).toBe(1)
  } finally {
    await cleanup()
  }
})

test('Sprint I F49-c1: bulk-skip-link visas när fakturor selekteras', async () => {
  const { window, cleanup } = await launchAppWithFreshDb()
  try {
    const { fiscalYearId } = await seedCompanyViaIPC(window)
    const counterpartyId = await seedCustomer(window, 'Kund Skip')
    await seedAndFinalizeInvoice(window, { counterpartyId, fiscalYearId })

    await window.reload()
    await expect(window.getByTestId('app-ready')).toBeVisible({
      timeout: 15_000,
    })

    // Navigera till income
    await window.evaluate(() => {
      location.hash = '#/income'
    })
    await expect(window.getByTestId('page-income')).toBeVisible({
      timeout: 10_000,
    })

    // Vänta tills faktura-raden laddas
    await expect(window.locator('tbody tr')).toHaveCount(1, { timeout: 10_000 })

    // Baseline: bulk-skip finns inte
    await expect(window.getByTestId('skip-to-bulk')).toHaveCount(0)

    // Selektera fakturan
    const checkbox = window.locator('tbody input[type="checkbox"]').first()
    await checkbox.check()

    // Bulk-skip-link visas nu + bulk-landmark finns
    await expect(window.getByTestId('skip-to-bulk')).toBeAttached()
    await expect(window.locator('#bulk-actions')).toBeVisible()

    // Fokus + Enter på bulk-skip → #bulk-actions fokuseras
    await window.getByTestId('skip-to-bulk').focus()
    await window.keyboard.press('Enter')
    const bulkFocused = await window.evaluate(
      () => document.activeElement?.id === 'bulk-actions',
    )
    expect(bulkFocused).toBe(true)

    // Avmarkera → bulk-skip försvinner
    await checkbox.uncheck()
    await expect(window.getByTestId('skip-to-bulk')).toHaveCount(0)
  } finally {
    await cleanup()
  }
})
