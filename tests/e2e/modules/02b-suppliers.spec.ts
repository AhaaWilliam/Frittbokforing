/**
 * 02b — Leverantörsregister.
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb } from '../helpers/launch-app'
import { composeEmptyK2 } from '../fixtures/compose'
import { seedSupplier } from '../helpers/seed'

test.describe('Leverantörsregister', () => {
  test('skapa + lista leverantör', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
      await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({ timeout: 15_000 })

      const supplierId = await seedSupplier(ctx.window, 'Leverantör X AB')
      expect(supplierId).toBeGreaterThan(0)

      await ctx.window.evaluate(() => { location.hash = '#/suppliers' })
      await expect(ctx.window.getByTestId('page-suppliers')).toBeVisible({ timeout: 10_000 })
      await expect(ctx.window.getByText('Leverantör X AB')).toBeVisible({ timeout: 5_000 })
    } finally {
      await ctx.cleanup()
    }
  })
})
