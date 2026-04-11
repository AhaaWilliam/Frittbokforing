/**
 * E03 — Expense lifecycle end-to-end tests.
 *
 * Flow: create supplier → create expense draft → finalize → verify.
 */
import { test, expect, takeScreenshot } from './app-fixture'
import { completeOnboarding, navigateTo } from './actions'

test.describe('E03 — Expense Flow', () => {
  test.beforeEach(async ({ window }) => {
    await completeOnboarding(window)
  })

  test('create supplier and expense draft, then finalize', async ({
    window,
  }) => {
    // 1. Create a supplier
    await navigateTo(window, 'suppliers')
    await window.click('button:has-text("+ Ny leverantör")')
    await window.getByTestId('customer-name').fill('Leverantör AB')
    await window.click('button[type="submit"]:has-text("Spara")')
    await window.waitForSelector('text=Leverantör AB', { timeout: 10_000 })
    await takeScreenshot(window, 'e03-supplier-created')

    // 2. Navigate to expenses and create a draft
    await navigateTo(window, 'expenses')
    await window.click('button:has-text("+ Ny kostnad")')

    // Pick supplier
    const supplierInput = window.locator(
      'input[placeholder*="leverantör"]',
    )
    await supplierInput.fill('Leverantör AB')
    await window.waitForTimeout(500)
    await window.click('button:has-text("Leverantör AB")')

    // Set expense date within 2025 FY
    const dateInput = window.locator('input[type="date"]').first()
    await dateInput.fill('2025-06-15')

    // Fill description
    await window.fill(
      'input[placeholder*="kontorsmaterial"]',
      'Kontorsmaterial Q1',
    )

    // Add a line
    await window.click('button:has-text("Lägg till rad")')

    // Fill line description
    const lineDesc = window.getByTestId('expense-line-0-description')
    await lineDesc.fill('Papper och pennor')

    // Select an account (first expense account available)
    const accountSelect = window.getByTestId('expense-line-0-account')
    // Select the first non-empty option
    const options = await accountSelect.locator('option').all()
    for (const opt of options) {
      const val = await opt.getAttribute('value')
      if (val && val !== '') {
        await accountSelect.selectOption(val)
        break
      }
    }

    // Fill quantity and price
    const qtyInput = window.getByTestId('expense-line-0-quantity')
    await qtyInput.fill('1')

    const priceInput = window.getByTestId('expense-line-0-price')
    await priceInput.fill('500')

    // Select VAT code (first non-zero option)
    const vatSelect = window.getByTestId('expense-line-0-vat')
    const vatOptions = await vatSelect.locator('option').all()
    for (const opt of vatOptions) {
      const val = await opt.getAttribute('value')
      if (val && val !== '0') {
        await vatSelect.selectOption(val)
        break
      }
    }

    // Save draft
    await window.click('button:has-text("Spara utkast")')

    // Wait for either navigation to list or a toast error
    const saved = await Promise.race([
      window.waitForSelector('button:has-text("+ Ny kostnad")', { timeout: 10_000 })
        .then(() => 'saved' as const),
      window.waitForSelector('.e2e-toast', { timeout: 10_000 })
        .then(async (el) => {
          const text = await el.textContent()
          return `toast: ${text}` as const
        }),
    ])
    if (saved !== 'saved') {
      throw new Error(`Save failed with: ${saved}`)
    }
    await takeScreenshot(window, 'e03-expense-draft-created')

    // Verify draft appears in list
    await expect(window.locator('text=Leverantör AB')).toBeVisible()
    await expect(window.locator('span:has-text("Utkast")')).toBeVisible()

    // 3. Finalize the expense (scope to table to avoid hitting sidebar nav)
    const table = window.locator('table')
    await table.locator('button:has-text("Bokför")').first().click()
    const dialog = window.locator('.fixed.inset-0')
    await dialog.waitFor({ timeout: 5_000 })
    await dialog.locator('button:has-text("Bokför")').last().click()
    await window.waitForTimeout(1_000)

    await takeScreenshot(window, 'e03-expense-finalized')

    // Verify status changed from "Utkast" to finalized (may show "Obetald" or "Förfallen")
    await expect(window.locator('span:has-text("Utkast")')).not.toBeVisible({ timeout: 10_000 })
    const statusCell = window.locator('table tbody tr td span').first()
    const statusText = await statusCell.textContent()
    expect(['Obetald', 'Förfallen']).toContain(statusText?.trim())
  })
})
