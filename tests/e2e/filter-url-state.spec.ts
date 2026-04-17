/**
 * Sprint E T2.a — Filter-state i URL (InvoiceList + ExpenseList).
 *
 * Verifierar att `useFilterParam`-hooken synkar filter-state med URL:
 * - Deep-link `#/income?invoices_status=draft` aktiverar rätt knapp
 * - Klick på "Alla" strippar param från URL
 *
 * Ingen fakturadata seedas — filter-knappar renderas oavsett invoice-listans
 * innehåll. Test-kontraktet är URL ↔ UI, inte filter-resultat.
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'

test('Sprint E T2.a: invoice-status i URL aktiverar rätt filter-knapp + klick på "Alla" strippar param', async () => {
  const { window, cleanup } = await launchAppWithFreshDb()
  try {
    await seedCompanyViaIPC(window)
    await window.reload()
    await expect(window.getByTestId('app-ready')).toBeVisible({
      timeout: 15_000,
    })

    // Deep-link till income med aktivt draft-filter
    await window.evaluate(() => {
      location.hash = '#/income?invoices_status=draft'
    })
    await expect(window.getByTestId('page-income')).toBeVisible({
      timeout: 10_000,
    })

    // Utkast-knappen ska ha primary-styling (aktiv)
    const utkast = window.getByRole('button', { name: /^utkast/i })
    await expect(utkast).toBeVisible()
    await expect(utkast).toHaveClass(/bg-primary/)

    // Klick på "Alla" strippar param
    const alla = window.getByRole('button', { name: /^alla/i })
    await alla.click()

    await expect
      .poll(() => window.evaluate(() => location.hash), { timeout: 5_000 })
      .not.toContain('invoices_status')

    // "Alla" är nu aktiv
    await expect(alla).toHaveClass(/bg-primary/)
  } finally {
    await cleanup()
  }
})
