/**
 * Session 26 — UI verification tests for K4 and K5 fixes.
 *
 * These are now covered by the new E2E tests:
 * - K4 (delete draft) → E02 invoice tests
 * - K5 (year-end booking) → E06 year-end tests
 *
 * Keeping the file for backwards compatibility with any CI references.
 */
import { test, expect } from './app-fixture'
import {
  completeOnboarding,
  navigateTo,
  createCustomer,
  createProduct,
  createDraftInvoice,
  finalizeInvoice,
  createNewFiscalYear,
} from './actions'

test.describe('K4 — Delete Draft', () => {
  test('delete draft invoice removes it from the list', async ({ window }) => {
    await completeOnboarding(window)

    // Create customer + product + draft
    await navigateTo(window, 'customers')
    await createCustomer(window, { name: 'Delete Test Kund' })
    await navigateTo(window, 'products')
    await createProduct(window, { name: 'Del Tjänst', priceKr: '100' })

    await navigateTo(window, 'income')
    await createDraftInvoice(window, {
      customerName: 'Delete Test Kund',
      productName: 'Del Tjänst',
      description: 'Test rad',
      quantity: 1,
      unitPriceKr: 100,
      invoiceDate: '2025-06-15',
    })

    // Verify draft visible
    await expect(window.locator('td:has-text("Delete Test Kund")')).toBeVisible()

    // Click on the draft row to edit
    await window.locator('td:has-text("Delete Test Kund")').click()
    await window.waitForTimeout(500)

    // Register dialog handler BEFORE clicking delete
    window.on('dialog', (dialog) => dialog.accept())

    // Click "Ta bort"
    await window.click('button:has-text("Ta bort")')
    await window.waitForTimeout(1_000)

    // Back to list — draft should be gone
    await expect(window.locator('td:has-text("Delete Test Kund")')).not.toBeVisible()
  })

  test('non-draft invoice has no delete button', async ({ window }) => {
    await completeOnboarding(window)

    await navigateTo(window, 'customers')
    await createCustomer(window, { name: 'NoDel Kund' })
    await navigateTo(window, 'products')
    await createProduct(window, { name: 'NoDel Tjänst', priceKr: '100' })

    await navigateTo(window, 'income')
    await createDraftInvoice(window, {
      customerName: 'NoDel Kund',
      productName: 'NoDel Tjänst',
      description: 'Rad',
      quantity: 1,
      unitPriceKr: 100,
      invoiceDate: '2025-06-15',
    })
    await finalizeInvoice(window)

    // Click finalized invoice to view
    await window.click('text=NoDel Kund')
    await window.waitForTimeout(500)

    // "Ta bort" should NOT be visible for finalized invoices
    await expect(
      window.locator('button:has-text("Ta bort")'),
    ).not.toBeVisible()
  })
})

test.describe('K5 — Year-End Booking', () => {
  test('year-end with result booking creates new FY', async ({ window }) => {
    await completeOnboarding(window)

    // Create some revenue data
    await navigateTo(window, 'customers')
    await createCustomer(window, { name: 'K5 Kund' })
    await navigateTo(window, 'products')
    await createProduct(window, { name: 'K5 Tjänst', priceKr: '10000' })
    await navigateTo(window, 'income')
    await createDraftInvoice(window, {
      customerName: 'K5 Kund',
      productName: 'K5 Tjänst',
      description: 'Tjänst',
      quantity: 1,
      unitPriceKr: 10000,
      invoiceDate: '2025-06-15',
    })
    await finalizeInvoice(window)

    await navigateTo(window, 'overview')
    await createNewFiscalYear(window, { bookResult: true })

    // Verify new year created
    const yearPicker = window.locator('[data-testid="year-picker"] select')
    const selectedText = await yearPicker
      .locator('option:checked')
      .textContent()
    expect(selectedText).toContain('2026')
  })
})
