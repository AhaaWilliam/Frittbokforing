/**
 * 08 — Skatteprognos: sida renderar, IPC returnerar siffror efter bokning.
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb } from '../helpers/launch-app'
import { composeEmptyK2 } from '../fixtures/compose'
import { seedCustomer, seedAndFinalizeInvoice } from '../helpers/seed'

test.describe('Skatteprognos', () => {
  test('sida renderar + IPC returnerar data efter bokning', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({
        timeout: 15_000,
      })
      const { fiscalYearId } = await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({
        timeout: 15_000,
      })

      const customerId = await seedCustomer(ctx.window, 'Skatt Kund')
      await seedAndFinalizeInvoice(ctx.window, {
        counterpartyId: customerId,
        fiscalYearId,
        invoiceDate: '2026-03-15',
        dueDate: '2026-04-14',
        unitPriceOre: 100000,
        quantity: 1,
      })

      const taxResult = await ctx.window.evaluate(async (fy) => {
        return (
          window as unknown as {
            api: {
              getTaxForecast: (d: { fiscalYearId: number }) => Promise<unknown>
            }
          }
        ).api.getTaxForecast({ fiscalYearId: fy })
      }, fiscalYearId)
      const tax = taxResult as {
        success: boolean
        data: Record<string, number>
      }
      expect(tax.success).toBe(true)

      await ctx.window.evaluate(() => {
        location.hash = '#/tax'
      })
      await expect(ctx.window.getByTestId('page-tax')).toBeVisible({
        timeout: 10_000,
      })
    } finally {
      await ctx.cleanup()
    }
  })
})
