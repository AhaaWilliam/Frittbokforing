/**
 * E01 — Onboarding wizard end-to-end tests.
 *
 * Tests the full company creation wizard:
 * - Step 1: Company info (name, org number, fiscal rule, capital, registration date)
 * - Step 2: Fiscal year confirmation
 * - Step 3: Summary & create
 * - Result: AppShell with dashboard visible
 */
import { test, expect, takeScreenshot } from './app-fixture'
import { completeOnboarding } from './actions'

test.describe('E01 — Onboarding Wizard', () => {
  test('wizard is shown on fresh database', async ({ window }) => {
    await window.waitForSelector('[data-testid="wizard"]', { timeout: 30_000 })
    await expect(window.locator('[data-testid="wizard"]')).toBeVisible()
    await expect(window.locator('text=Fritt Bokföring')).toBeVisible()
    await expect(window.locator('text=Kom igång med din bokföring')).toBeVisible()
  })

  test('step 1 validates required fields', async ({ window }) => {
    await window.waitForSelector('[data-testid="wizard"]', { timeout: 30_000 })

    // "Nästa" button should be disabled initially
    const nextBtn = window.locator('button:has-text("Nästa")')
    await expect(nextBtn).toBeDisabled()

    // Fill only name — still disabled
    await window.fill('input[placeholder="AB Företaget"]', 'AB Test')
    await expect(nextBtn).toBeDisabled()

    // Fill invalid org number (doesn't start with 5-9)
    await window.fill('input[placeholder="NNNNNN-NNNN"]', '123456-7890')
    await expect(nextBtn).toBeDisabled()

    // Fill valid org number (passes Luhn check)
    await window.fill('input[placeholder="NNNNNN-NNNN"]', '')
    await window.type('input[placeholder="NNNNNN-NNNN"]', '5560360793')
    await window.fill('input[type="date"]', '2025-01-15')

    // Now should be enabled
    await expect(nextBtn).toBeEnabled()
  })

  test('complete wizard creates company and shows dashboard', async ({
    window,
  }) => {
    await completeOnboarding(window, {
      name: 'Testbolaget AB',
      orgNumber: '5560360793',
      fiscalRule: 'K2',
      shareCapital: '50000',
      registrationDate: '2025-01-15',
    })

    // Verify we see the dashboard
    await expect(window.locator('[data-testid="app-ready"]')).toBeVisible()
    await expect(window.locator('[data-testid="page-overview"]')).toBeVisible()

    // Verify company name appears in sidebar
    await expect(window.locator('text=Testbolaget AB')).toBeVisible()

    // Verify fiscal rule shown
    await expect(window.locator('text=Förenklad (K2)')).toBeVisible()

    await takeScreenshot(window, 'e01-dashboard-after-onboarding')
  })

  test('wizard with K3 fiscal rule', async ({ window }) => {
    await completeOnboarding(window, {
      name: 'Storbolaget AB',
      orgNumber: '5566778907',
      fiscalRule: 'K3',
      shareCapital: '100000',
      registrationDate: '2025-06-01',
    })

    await expect(window.locator('[data-testid="app-ready"]')).toBeVisible()
    await expect(window.locator('text=Fullständig (K3)')).toBeVisible()
  })
})
