/**
 * E06 — Year-end / fiscal year transition tests.
 *
 * Tests creating a new fiscal year (closing the current one),
 * verifying the old year becomes read-only, and the new year is active.
 */
import { test, expect, takeScreenshot } from './app-fixture'
import {
  completeOnboarding,
  navigateTo,
  createCustomer,
  createProduct,
  createDraftInvoice,
  finalizeInvoice,
  createNewFiscalYear,
} from './actions'

test.describe('E06 — Year-End', () => {
  test.beforeEach(async ({ window }) => {
    await completeOnboarding(window, {
      registrationDate: '2025-01-15',
    })
  })

  test('create new fiscal year with result booking', async ({ window }) => {
    // First create some data so there's a result to book
    await navigateTo(window, 'customers')
    await createCustomer(window, { name: 'Årsbokslut Kund' })
    await navigateTo(window, 'products')
    await createProduct(window, { name: 'Konsulttjänst', priceKr: '1000' })

    await navigateTo(window, 'income')
    await createDraftInvoice(window, {
      customerName: 'Årsbokslut Kund',
      productName: 'Konsulttjänst',
      description: 'Konsulttjänst',
      quantity: 10,
      unitPriceKr: 1000,
      invoiceDate: '2025-06-15',
    })
    await finalizeInvoice(window)

    // Navigate back to overview (so year picker is visible)
    await navigateTo(window, 'overview')

    // Create new fiscal year
    await createNewFiscalYear(window, { bookResult: true })

    await takeScreenshot(window, 'e06-new-year-created')

    // Verify we're now on the new fiscal year (2026)
    const yearPicker = window.locator('[data-testid="year-picker"] select')
    const selectedText = await yearPicker.locator('option:checked').textContent()
    expect(selectedText).toContain('2026')
  })

  test('old fiscal year becomes read-only', async ({ window }) => {
    // Create new fiscal year (closes old one)
    await createNewFiscalYear(window)

    // Wait for fiscal year list to refresh, then switch to old year
    const yearPicker = window.locator('[data-testid="year-picker"] select')

    // Poll until the closed year option appears (options are "hidden" in Playwright)
    await window.waitForFunction(() => {
      const select = document.querySelector('[data-testid="year-picker"] select')
      if (!select) return false
      return Array.from(select.querySelectorAll('option')).some(o =>
        o.textContent?.includes('stängt')
      )
    }, { timeout: 15_000 })

    // Select the closed year option
    const closedOption = yearPicker.locator('option:has-text("stängt")')
    const value = await closedOption.getAttribute('value')
    if (value) {
      await yearPicker.selectOption(value)
    }

    // Verify read-only banner appears
    await expect(
      window.locator('[data-testid="readonly-banner"]'),
    ).toBeVisible({ timeout: 10_000 })

    await takeScreenshot(window, 'e06-readonly-old-year')

    // Navigate to income — "Ny faktura" button should NOT appear
    await navigateTo(window, 'income')
    const newBtn = window.locator('button:has-text("+ Ny faktura")')
    await expect(newBtn).not.toBeVisible()
  })

  test('new fiscal year allows creating data', async ({ window }) => {
    await createNewFiscalYear(window)

    // We should be on the new year without read-only banner
    await expect(
      window.locator('[data-testid="readonly-banner"]'),
    ).not.toBeVisible()

    // Navigate to income and verify we can create invoices
    await navigateTo(window, 'income')
    const newBtn = window.locator('button:has-text("+ Ny faktura")')
    await expect(newBtn).toBeVisible()
  })
})
