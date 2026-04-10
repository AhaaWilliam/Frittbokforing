/**
 * Reusable E2E action helpers.
 * All functions take a Playwright Page and perform UI interactions.
 */
import type { Page } from '@playwright/test'

// ─── Wizard ──────────────────────────────────────────────────────────────────

export interface CompanyData {
  name: string
  orgNumber: string
  fiscalRule: 'K2' | 'K3'
  shareCapital: string
  registrationDate: string
}

const DEFAULT_COMPANY: CompanyData = {
  name: 'Test AB',
  orgNumber: '5566778907',
  fiscalRule: 'K2',
  shareCapital: '25000',
  registrationDate: '2025-01-15',
}

/**
 * Complete the full onboarding wizard from a fresh database.
 * Ends with the app showing the dashboard (app-ready).
 */
export async function completeOnboarding(
  page: Page,
  data: Partial<CompanyData> = {},
): Promise<void> {
  const c = { ...DEFAULT_COMPANY, ...data }

  // Wait for wizard
  await page.waitForSelector('[data-testid="wizard"]', { timeout: 30_000 })

  // Step 1: Company info
  await page.fill('input[placeholder="AB Företaget"]', c.name)
  await page.fill('input[placeholder="NNNNNN-NNNN"]', c.orgNumber)

  if (c.fiscalRule === 'K3') {
    await page.click('input[name="fiscal_rule"][value="K3"]')
  }

  // Clear and fill share capital
  const capitalInput = page.locator('input[type="number"][min="25000"]')
  await capitalInput.fill(c.shareCapital)

  // Fill registration date
  await page.fill('input[type="date"]', c.registrationDate)

  // Click "Nästa" (Step 1 → 2)
  await page.click('button:has-text("Nästa")')

  // Step 2: Fiscal year — just click "Nästa" (default calendar year)
  await page.click('button:has-text("Nästa")')

  // Step 3: Confirm — click "Starta bokföringen"
  await page.click('button:has-text("Starta bokföringen")')

  // Wait for app shell to load
  await page.waitForSelector('[data-testid="app-ready"]', { timeout: 30_000 })
}

// ─── Navigation ──────────────────────────────────────────────────────────────

export type NavPage =
  | 'overview'
  | 'income'
  | 'expenses'
  | 'manual-entries'
  | 'customers'
  | 'suppliers'
  | 'products'
  | 'accounts'
  | 'reports'
  | 'vat'
  | 'tax'
  | 'export'
  | 'settings'

/**
 * Navigate to a page using the sidebar nav.
 */
export async function navigateTo(page: Page, target: NavPage): Promise<void> {
  await page.click(`[data-testid="nav-${target}"]`)
  await page.waitForSelector(`[data-testid="page-${target}"]`, {
    timeout: 10_000,
  })
}

// ─── Customer ────────────────────────────────────────────────────────────────

export interface CustomerData {
  name: string
  orgNumber?: string
  email?: string
}

/**
 * Create a customer from the Customers page. Assumes we're already on that page.
 */
export async function createCustomer(
  page: Page,
  data: CustomerData,
): Promise<void> {
  await page.click('button:has-text("+ Ny kund")')
  await page.fill('#name', data.name)
  if (data.orgNumber) {
    await page.fill('#org_number', data.orgNumber)
  }
  if (data.email) {
    await page.fill('#email', data.email)
  }
  await page.click('button[type="submit"]:has-text("Spara")')
  // Wait for form to close (customer detail shows)
  await page.waitForSelector(`text=${data.name}`, { timeout: 10_000 })
}

// ─── Product ─────────────────────────────────────────────────────────────────

export interface ProductData {
  name: string
  priceKr: string
  description?: string
}

/**
 * Create a product from the Products page. Assumes we're already on that page.
 */
export async function createProduct(
  page: Page,
  data: ProductData,
): Promise<void> {
  await page.click('button:has-text("+ Ny artikel")')
  await page.fill('#name', data.name)
  if (data.description) {
    await page.fill('#description', data.description)
  }
  await page.fill('#_priceKr', data.priceKr)
  await page.click('button[type="submit"]:has-text("Spara")')
  // Wait for form to close
  await page.waitForSelector(`text=${data.name}`, { timeout: 10_000 })
}

// ─── Invoice ─────────────────────────────────────────────────────────────────

/**
 * Create a draft invoice. Assumes we're on the Income page (list view).
 * customerName must be an existing customer.
 */
export async function createDraftInvoice(
  page: Page,
  opts: {
    customerName: string
    productName: string
    description: string
    quantity: number
    unitPriceKr: number
    invoiceDate?: string
  },
): Promise<void> {
  // Click new invoice button
  await page.click('button:has-text("+ Ny faktura")')

  // Set invoice date if provided (must be within the fiscal year)
  if (opts.invoiceDate) {
    const dateInput = page.locator('input[type="date"]').first()
    await dateInput.fill(opts.invoiceDate)
  }

  // Pick customer via the search input
  const customerInput = page.locator('input[placeholder*="kund"]')
  await customerInput.fill(opts.customerName)
  await page.waitForTimeout(500) // debounce
  await page.click(`button:has-text("${opts.customerName}")`)

  // Add a line
  await page.click('button:has-text("Lägg till rad")')

  // Select article via ArticlePicker (sets product_id, description, price, vat_code_id)
  const articleInput = page.locator(
    'tbody tr:last-child td:nth-child(1) input[placeholder*="artikel"]',
  )
  await articleInput.fill(opts.productName)
  await page.waitForTimeout(500) // debounce
  const articleOption = page.locator('tbody tr:last-child td:nth-child(1) ul li button').first()
  await articleOption.click({ timeout: 5_000 })

  // Override description, quantity, price if different from product defaults
  const descInput = page.locator('tbody tr:last-child td:nth-child(2) input')
  await descInput.fill(opts.description)

  const qtyInput = page.locator('tbody tr:last-child td:nth-child(3) input')
  await qtyInput.fill(String(opts.quantity))

  const priceInput = page.locator('tbody tr:last-child td:nth-child(4) input')
  await priceInput.fill(String(opts.unitPriceKr))

  // Save draft
  await page.click('button:has-text("Spara utkast")')

  // Wait for return to list
  await page.waitForSelector('button:has-text("+ Ny faktura")', {
    timeout: 10_000,
  })
}

/**
 * Finalize (bokför) a draft invoice. Assumes we're on the Income page list view.
 * Clicks the "Bokför" button on the first matching row, confirms in dialog.
 */
export async function finalizeInvoice(page: Page): Promise<void> {
  // Click the "Bokför" action button inside the table (not the sidebar nav)
  const table = page.locator('table')
  await table.locator('button:has-text("Bokför")').first().click()

  // Wait for the confirm dialog (contains warning text)
  const warningText = page.locator('text=Denna åtgärd kan inte ångras')
  await warningText.waitFor({ state: 'visible', timeout: 10_000 })

  // The dialog has exactly 2 buttons: "Avbryt" and "Bokför".
  // Click the last button in the dialog (the confirm "Bokför" button).
  const dialogBox = page.locator('.fixed.inset-0 .max-w-md')
  const buttons = dialogBox.locator('button')
  await buttons.last().click()

  // Wait for dialog to close and list to refresh
  await warningText.waitFor({ state: 'hidden', timeout: 10_000 })
  await page.waitForTimeout(500)
}

/**
 * Register payment on an unpaid invoice. Assumes we're on the Income page.
 */
export async function payInvoice(
  page: Page,
  paymentDate: string,
): Promise<void> {
  // Click "Betala" on the first unpaid row (scoped to table)
  const table = page.locator('table')
  await table.locator('button:has-text("Betala")').first().click()

  // Payment dialog appears
  const dialog = page.locator('.fixed.inset-0')
  await dialog.waitFor({ timeout: 5_000 })

  // Fill payment date
  const dateInput = dialog.locator('input[type="date"]')
  await dateInput.fill(paymentDate)

  // Click "Registrera"
  await dialog.locator('button:has-text("Registrera")').click()

  // Wait for dialog to close
  await page.waitForTimeout(1_000)
}

// ─── Year-end ────────────────────────────────────────────────────────────────

/**
 * Create a new fiscal year via the YearPicker dropdown.
 * Optionally books the result (default: true).
 */
export async function createNewFiscalYear(
  page: Page,
  opts: { bookResult?: boolean } = {},
): Promise<void> {
  const bookResult = opts.bookResult ?? true

  // Open year picker and select the "create" option
  const yearSelect = page.locator('[data-testid="year-picker"] select')
  await yearSelect.selectOption('__create__')

  // Dialog opens
  const dialog = page.locator('.fixed.inset-0')
  await dialog.waitFor({ timeout: 10_000 })

  // Wait for loading to finish (step 0 → step 1 or step 2)
  await page.waitForTimeout(2_000)

  // Check if step 1 (result disposition) is shown
  const bookBtn = dialog.locator('button:has-text("Bokför & fortsätt")')
  const skipBtn = dialog.locator('button:has-text("Hoppa över")')

  if (await bookBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    if (bookResult) {
      await bookBtn.click()
    } else {
      await skipBtn.click()
      // Confirm skip warning
      await dialog
        .locator('button:has-text("Fortsätt ändå")')
        .click({ timeout: 3_000 })
    }
  }

  // Step 2: Click "Skapa räkenskapsår"
  await dialog
    .locator('button:has-text("Skapa räkenskapsår")')
    .click({ timeout: 5_000 })

  // Step 3: Done — click "Klar"
  await dialog.locator('button:has-text("Klar")').click({ timeout: 10_000 })
}
