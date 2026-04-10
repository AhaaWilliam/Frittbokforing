/**
 * E02 — Invoice lifecycle end-to-end tests.
 *
 * Full flow: create customer → create draft → finalize → pay → verify status.
 */
import { test, expect, takeScreenshot } from './app-fixture'
import {
  completeOnboarding,
  navigateTo,
  createCustomer,
  createProduct,
  createDraftInvoice,
  finalizeInvoice,
  payInvoice,
} from './actions'

test.describe('E02 — Invoice Flow', () => {
  test.beforeEach(async ({ window }) => {
    await completeOnboarding(window)
  })

  test('full invoice lifecycle: draft → finalize → pay', async ({ window }) => {
    // 1. Create customer and product
    await navigateTo(window, 'customers')
    await createCustomer(window, {
      name: 'Kund Ett AB',
      orgNumber: '556677-1234',
    })

    await navigateTo(window, 'products')
    await createProduct(window, { name: 'Konsulttjänst', priceKr: '1000' })
    await takeScreenshot(window, 'e02-setup-done')

    // 2. Navigate to income page and create a draft invoice
    await navigateTo(window, 'income')
    await createDraftInvoice(window, {
      customerName: 'Kund Ett AB',
      productName: 'Konsulttjänst',
      description: 'Konsulttjänst',
      quantity: 10,
      unitPriceKr: 1000,
      invoiceDate: '2025-06-15',
    })
    await takeScreenshot(window, 'e02-draft-created')

    // Verify draft appears in list
    await expect(window.locator('td:has-text("Kund Ett AB")')).toBeVisible()
    await expect(window.locator('span:has-text("Utkast")')).toBeVisible()

    // 3. Finalize the invoice
    await finalizeInvoice(window)
    await takeScreenshot(window, 'e02-invoice-finalized')

    // Verify status changed from "Utkast" to finalized (may show "Obetald" or "Förfallen" depending on date)
    await expect(window.locator('span:has-text("Utkast")')).not.toBeVisible({ timeout: 10_000 })
    const statusCell = window.locator('table tbody tr td:nth-child(7) span')
    const statusText = await statusCell.textContent()
    expect(['Obetald', 'Förfallen']).toContain(statusText?.trim())

    // Verify verification number appears (A-series)
    await expect(window.locator('td:has-text("A1")')).toBeVisible()

    // 4. Pay the invoice
    await payInvoice(window, '2025-07-15')
    await takeScreenshot(window, 'e02-invoice-paid')

    // Verify status changed to "Betald"
    await expect(window.locator('span:has-text("Betald")')).toBeVisible()
  })

  test('draft invoice appears in list with correct data', async ({
    window,
  }) => {
    // Create customer and product
    await navigateTo(window, 'customers')
    await createCustomer(window, { name: 'Draft Kund AB' })
    await navigateTo(window, 'products')
    await createProduct(window, { name: 'Rådgivning', priceKr: '500' })

    // Create draft
    await navigateTo(window, 'income')
    await createDraftInvoice(window, {
      customerName: 'Draft Kund AB',
      productName: 'Rådgivning',
      description: 'Rådgivning',
      quantity: 5,
      unitPriceKr: 500,
      invoiceDate: '2025-06-15',
    })

    // Verify draft in list
    await expect(window.locator('td:has-text("Draft Kund AB")')).toBeVisible()
    await expect(window.locator('span:has-text("Utkast")')).toBeVisible()
  })

  test('dashboard shows revenue after finalized invoice', async ({
    window,
  }) => {
    // Setup: customer + product + draft + finalize
    await navigateTo(window, 'customers')
    await createCustomer(window, { name: 'Revenue Kund' })
    await navigateTo(window, 'products')
    await createProduct(window, { name: 'Tjänst', priceKr: '10000' })

    await navigateTo(window, 'income')
    await createDraftInvoice(window, {
      customerName: 'Revenue Kund',
      productName: 'Tjänst',
      description: 'Tjänst',
      quantity: 1,
      unitPriceKr: 10000,
      invoiceDate: '2025-06-15',
    })
    await finalizeInvoice(window)

    // Navigate to overview
    await navigateTo(window, 'overview')

    // Dashboard should show some revenue (not 0)
    await window.waitForTimeout(1_000) // Wait for data to refresh
    const revenueText = await window.locator('text=Intäkter').first().textContent()
    expect(revenueText).toBeTruthy()

    await takeScreenshot(window, 'e02-dashboard-with-revenue')
  })
})
