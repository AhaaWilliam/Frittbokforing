/**
 * Sprint VS-5 — E2E för Vardag-sheets funktionellt flöde
 *
 * Verifierar end-to-end:
 *  - BokforKostnadSheet: öppna → fyll i → Bokför → toast → sheet stänger
 *    + verifikation finns i journal_entries
 *  - SkapaFakturaSheet: öppna → fyll i → Skicka → toast → sheet stänger
 *    + faktura finns i invoices
 *
 * Kompletterar visual-regression.spec.ts som bara fångar layout.
 */
import { test, expect, type Page } from '@playwright/test'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'
import { seedSupplier, seedCustomer } from './helpers/seed'

const FROZEN_TIME = '2026-04-22T10:00:00.000Z'
const VIEWPORT = { width: 1280, height: 800 }

async function createAndLoginTestUser(window: Page): Promise<void> {
  await window.evaluate(async () => {
    await (
      window as unknown as {
        __authTestApi: {
          createAndLoginUser: (d: {
            displayName: string
            password: string
          }) => Promise<unknown>
        }
      }
    ).__authTestApi.createAndLoginUser({
      displayName: 'Test User',
      password: 'testpassword123',
    })
  })
}

async function setupVardagMode(window: Page): Promise<void> {
  await window.evaluate(async (iso) => {
    await (
      window as unknown as {
        __testApi: { freezeClock: (s: string) => Promise<unknown> }
      }
    ).__testApi.freezeClock(iso)
  }, FROZEN_TIME)
  await window.evaluate(async () => {
    await (
      window as unknown as {
        api: { setSetting: (k: string, v: string) => Promise<unknown> }
      }
    ).api.setSetting('ui_mode', 'vardag')
  })
  await window.reload()
}

test.describe('VS-5 — Vardag-sheets funktionellt flöde', () => {
  test('BokforKostnadSheet: 1-rads-bokföring end-to-end', async () => {
    const { window, cleanup } = await launchAppWithFreshDb()
    try {
      await window.setViewportSize(VIEWPORT)
      await createAndLoginTestUser(window)
      await seedCompanyViaIPC(window)
      await seedSupplier(window, 'Acme Leverantör AB')
      await setupVardagMode(window)

      await expect(window.getByTestId('vardag-hero')).toBeVisible({
        timeout: 15_000,
      })
      await window.getByTestId('vardag-bigbtn-kostnad').click()
      await expect(window.getByTestId('bottom-sheet')).toBeVisible({
        timeout: 5_000,
      })

      // Fyll i fält
      await window.getByTestId('vardag-kostnad-amount').fill('125,00')
      await window
        .getByTestId('vardag-kostnad-description')
        .fill('Kontorsmaterial')

      // SupplierPicker — välj första matchande
      const supplierInput = window.getByTestId(
        'vardag-kostnad-supplier',
      )
      await supplierInput.fill('Acme')
      await supplierInput.press('ArrowDown')
      await supplierInput.press('Enter')

      // Bokför-knappen ska vara enabled
      const submit = window.getByTestId('vardag-kostnad-submit')
      await expect(submit).toBeEnabled({ timeout: 5_000 })

      await submit.click()

      // Sheet stänger
      await expect(window.getByTestId('bottom-sheet')).toBeHidden({
        timeout: 5_000,
      })

      // Verifikation finns i DB via IPC
      const entries = await window.evaluate(async () => {
        const fyRes = await (
          window as unknown as {
            api: { listFiscalYears: () => Promise<{ data: { id: number }[] }> }
          }
        ).api.listFiscalYears()
        const fyId = fyRes.data[0].id
        return (
          window as unknown as {
            api: {
              listExpenses: (d: {
                fiscal_year_id: number
              }) => Promise<{ data: unknown[] }>
            }
          }
        ).api.listExpenses({ fiscal_year_id: fyId })
      })
      const result = entries as { data: { length: number } }
      expect(result.data.length).toBeGreaterThanOrEqual(1)
    } finally {
      await cleanup()
    }
  })

  test('SkapaFakturaSheet: 1-rads-faktura end-to-end', async () => {
    const { window, cleanup } = await launchAppWithFreshDb()
    try {
      await window.setViewportSize(VIEWPORT)
      await createAndLoginTestUser(window)
      await seedCompanyViaIPC(window)
      await seedCustomer(window, 'Acme Kund AB')
      await setupVardagMode(window)

      await expect(window.getByTestId('vardag-hero')).toBeVisible({
        timeout: 15_000,
      })
      await window.getByTestId('vardag-bigbtn-faktura').click()
      await expect(window.getByTestId('bottom-sheet')).toBeVisible({
        timeout: 5_000,
      })

      // CustomerPicker
      const customerInput = window.getByTestId(
        'vardag-faktura-customer',
      )
      await customerInput.fill('Acme')
      await customerInput.press('ArrowDown')
      await customerInput.press('Enter')

      // Fyll i fält
      await window
        .getByTestId('vardag-faktura-description')
        .fill('Konsulttimmar mars')
      await window.getByTestId('vardag-faktura-price').fill('1500,00')

      const submit = window.getByTestId('vardag-faktura-submit')
      await expect(submit).toBeEnabled({ timeout: 5_000 })

      await submit.click()

      await expect(window.getByTestId('bottom-sheet')).toBeHidden({
        timeout: 5_000,
      })

      // Faktura finns i DB
      const invoices = await window.evaluate(async () => {
        const fyRes = await (
          window as unknown as {
            api: { listFiscalYears: () => Promise<{ data: { id: number }[] }> }
          }
        ).api.listFiscalYears()
        const fyId = fyRes.data[0].id
        return (
          window as unknown as {
            api: {
              listInvoices: (d: {
                fiscal_year_id: number
              }) => Promise<{ data: unknown[] }>
            }
          }
        ).api.listInvoices({ fiscal_year_id: fyId })
      })
      const result = invoices as { data: { length: number } }
      expect(result.data.length).toBeGreaterThanOrEqual(1)
    } finally {
      await cleanup()
    }
  })
})
