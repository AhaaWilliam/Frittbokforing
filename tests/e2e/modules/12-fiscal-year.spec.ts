/**
 * 12 — Räkenskapsår: sida renderar, lista via IPC.
 * (createNewFiscalYear med IB-överföring testas djupgående i system-lagret.)
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb } from '../helpers/launch-app'
import { composeEmptyK2 } from '../fixtures/compose'

test.describe('Räkenskapsår', () => {
  test('IPC listar FY och period-status', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
      const { fiscalYearId } = await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({ timeout: 15_000 })

      const fyRes = await ctx.window.evaluate(async () => {
        return (window as unknown as { api: { listFiscalYears: () => Promise<unknown> } }).api.listFiscalYears()
      })
      const fys = fyRes as { success: boolean; data: Array<{ id: number }> }
      expect(fys.success).toBe(true)
      expect(fys.data.length).toBeGreaterThanOrEqual(1)

      const pRes = await ctx.window.evaluate(async (fy) => {
        return (window as unknown as { api: { listFiscalPeriods: (d: { fiscal_year_id: number }) => Promise<unknown> } }).api.listFiscalPeriods({ fiscal_year_id: fy })
      }, fiscalYearId)
      const periods = pRes as { success: boolean; data: Array<{ id: number; is_closed: number }> }
      expect(periods.success).toBe(true)
      expect(periods.data.length).toBe(12)
    } finally {
      await ctx.cleanup()
    }
  })
})
