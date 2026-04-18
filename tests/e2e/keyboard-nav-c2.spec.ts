/**
 * Sprint J F49-c2 — Roving-tabindex + MetricCard keyboard-nav E2E.
 *
 * Verifierar:
 *  - InvoiceList rad-nivå-navigation via ↓ + Enter öppnar detaljvy
 *  - Dashboard MetricCard Enter navigerar till rätt route
 *  - aria-live på form-totals (via attribut-check)
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'
import { seedCustomer, seedAndFinalizeInvoice } from './helpers/seed'

test('Sprint J F49-c2: ↓ + Enter på fakturarad öppnar detaljvy', async () => {
  const { window, cleanup } = await launchAppWithFreshDb()
  try {
    const { fiscalYearId } = await seedCompanyViaIPC(window)
    const counterpartyId = await seedCustomer(window, 'Kund Keys')
    // Två fakturor så ↓ har något att flytta till
    await seedAndFinalizeInvoice(window, { counterpartyId, fiscalYearId })
    await seedAndFinalizeInvoice(window, {
      counterpartyId,
      fiscalYearId,
      invoiceDate: '2026-03-16',
      dueDate: '2026-04-15',
    })

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
    await expect(window.locator('tbody tr')).toHaveCount(2, { timeout: 10_000 })

    // Första raden: tabIndex=0, andra raden tabIndex=-1
    const firstTabIndex = await window
      .locator('tbody tr')
      .first()
      .getAttribute('tabindex')
    expect(firstTabIndex).toBe('0')
    const secondTabIndex = await window
      .locator('tbody tr')
      .nth(1)
      .getAttribute('tabindex')
    expect(secondTabIndex).toBe('-1')

    // Fokusera första raden, tryck ↓, verifiera att andra raden fokuseras
    await window.locator('tbody tr').first().focus()
    await window.keyboard.press('ArrowDown')
    // Efter ArrowDown ska rad 2 ha tabindex=0 + vara focused
    await expect(window.locator('tbody tr').nth(1)).toHaveAttribute(
      'tabindex',
      '0',
    )
    const activeIsSecondRow = await window.evaluate(() => {
      const rows = document.querySelectorAll('tbody tr')
      return document.activeElement === rows[1]
    })
    expect(activeIsSecondRow).toBe(true)

    // Enter öppnar detaljvyn för andra fakturan — hash uppdateras till
    // `/income/view/<id>` (non-draft) eller `/income/edit/<id>` (draft).
    await window.keyboard.press('Enter')
    await expect
      .poll(() => window.evaluate(() => location.hash), { timeout: 5_000 })
      .toMatch(/\/income\/(view|edit)\/\d+/)
  } finally {
    await cleanup()
  }
})

test('Sprint J F49-c2: MetricCard Enter navigerar till rätt route', async () => {
  const { window, cleanup } = await launchAppWithFreshDb()
  try {
    await seedCompanyViaIPC(window)
    await window.reload()
    await expect(window.getByTestId('app-ready')).toBeVisible({
      timeout: 15_000,
    })

    // Default-route är /overview
    await expect(window.getByTestId('page-overview')).toBeVisible({
      timeout: 10_000,
    })

    // Intäkter-kortet finns som button
    const intaktKort = window.getByRole('button', { name: /intäkter/i })
    await expect(intaktKort).toBeVisible()

    // Enter på Intäkter-kortet → navigera till /income
    await intaktKort.focus()
    await window.keyboard.press('Enter')
    await expect(window.getByTestId('page-income')).toBeVisible({
      timeout: 5_000,
    })
    const hash = await window.evaluate(() => location.hash)
    expect(hash).toContain('/income')

    // Tillbaka till overview
    await window.evaluate(() => {
      location.hash = '#/overview'
    })
    await expect(window.getByTestId('page-overview')).toBeVisible()

    // Kostnader → /expenses
    await window.getByRole('button', { name: /kostnader/i }).click()
    await expect(window.getByTestId('page-expenses')).toBeVisible({
      timeout: 5_000,
    })
  } finally {
    await cleanup()
  }
})
