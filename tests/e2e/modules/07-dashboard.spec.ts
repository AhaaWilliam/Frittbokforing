/**
 * 07 — Dashboard/Översikt: siffror speglar nybokade verifikat.
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb } from '../helpers/launch-app'
import { composeEmptyK2 } from '../fixtures/compose'
import { seedCustomer, seedAndFinalizeInvoice } from '../helpers/seed'

test.describe('Dashboard', () => {
  test('renderar och reflekterar bokförd intäkt via IPC', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
      const { fiscalYearId } = await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({ timeout: 15_000 })

      // Baseline (tom dashboard)
      const beforeResult = await ctx.window.evaluate(async (fy) => {
        return (window as unknown as { api: { getDashboardSummary: (d: { fiscalYearId: number }) => Promise<unknown> } }).api.getDashboardSummary({ fiscalYearId: fy })
      }, fiscalYearId)
      const before = beforeResult as { success: boolean; data: { revenueOre: number } }
      expect(before.success).toBe(true)

      // Seed + boka
      const customerId = await seedCustomer(ctx.window, 'Dashboard Kund')
      await seedAndFinalizeInvoice(ctx.window, {
        counterpartyId: customerId,
        fiscalYearId,
        invoiceDate: '2026-03-15',
        dueDate: '2026-04-14',
        unitPriceOre: 100000,
        quantity: 1,
      })

      const afterResult = await ctx.window.evaluate(async (fy) => {
        return (window as unknown as { api: { getDashboardSummary: (d: { fiscalYearId: number }) => Promise<unknown> } }).api.getDashboardSummary({ fiscalYearId: fy })
      }, fiscalYearId)
      const after = afterResult as { success: boolean; data: { revenueOre: number } }
      expect(after.data.revenueOre).toBeGreaterThan(before.data.revenueOre)

      // UI-sidan renderar
      await ctx.window.evaluate(() => { location.hash = '#/overview' })
      await expect(ctx.window.getByTestId('page-overview')).toBeVisible({ timeout: 10_000 })
    } finally {
      await ctx.cleanup()
    }
  })
})
