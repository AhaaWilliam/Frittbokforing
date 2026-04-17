/**
 * 09 — Momsrapport: 4 kvartal renderar + IPC returnerar utgående moms efter bokning.
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb } from '../helpers/launch-app'
import { composeEmptyK2 } from '../fixtures/compose'
import { seedCustomer, seedAndFinalizeInvoice } from '../helpers/seed'

test.describe('Momsrapport', () => {
  test('IPC returnerar utgående moms efter bokförd 25%-faktura + sida renderar', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({
        timeout: 15_000,
      })
      const { fiscalYearId } = await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({
        timeout: 15_000,
      })

      const customerId = await seedCustomer(ctx.window, 'Moms Kund')
      await seedAndFinalizeInvoice(ctx.window, {
        counterpartyId: customerId,
        fiscalYearId,
        invoiceDate: '2026-03-15',
        dueDate: '2026-04-14',
        unitPriceOre: 100000, // 1000 kr netto → 250 kr utgående moms
        quantity: 1,
      })

      const vatResult = await ctx.window.evaluate(async (fy) => {
        return (
          window as unknown as {
            api: {
              getVatReport: (d: { fiscal_year_id: number }) => Promise<unknown>
            }
          }
        ).api.getVatReport({ fiscal_year_id: fy })
      }, fiscalYearId)
      const vat = vatResult as {
        success: boolean
        data: { quarters: Array<Record<string, unknown>> }
      }
      expect(vat.success).toBe(true)
      expect(vat.data.quarters.length).toBe(4)

      await ctx.window.evaluate(() => {
        location.hash = '#/vat'
      })
      await expect(ctx.window.getByTestId('page-vat')).toBeVisible({
        timeout: 10_000,
      })
    } finally {
      await ctx.cleanup()
    }
  })
})
