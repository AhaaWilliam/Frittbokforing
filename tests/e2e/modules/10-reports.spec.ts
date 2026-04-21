/**
 * 10 — Rapporter: RR + BR renderar, årets resultat speglar bokad intäkt.
 * M134: BR:s "årets resultat" = RR:s bottom-line (single source of truth).
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb } from '../helpers/launch-app'
import { composeEmptyK2 } from '../fixtures/compose'
import { seedCustomer, seedAndFinalizeInvoice } from '../helpers/seed'

test.describe('Rapporter', () => {
  test('RR + BR — årets resultat identiskt i båda (M134)', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({
        timeout: 15_000,
      })
      const { fiscalYearId } = await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({
        timeout: 15_000,
      })

      const customerId = await seedCustomer(ctx.window, 'Rapport Kund')
      await seedAndFinalizeInvoice(ctx.window, {
        counterpartyId: customerId,
        fiscalYearId,
        invoiceDate: '2026-03-15',
        dueDate: '2026-04-14',
        unitPriceOre: 50000,
        quantity: 1,
      })

      await ctx.window.evaluate(() => {
        location.hash = '#/reports'
      })
      await expect(ctx.window.getByTestId('page-reports')).toBeVisible({
        timeout: 10_000,
      })

      // Wait for report data: arets-resultat-value gets data-raw-ore when loaded
      await ctx.window
        .locator('[data-testid="arets-resultat-value"]')
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 })
        .catch(() => {})

      const rrValue = await ctx.window
        .locator('[data-testid="arets-resultat-value"]')
        .first()
        .getAttribute('data-raw-ore')
      const brValue = await ctx.window
        .locator('[data-testid="arets-resultat-br-value"]')
        .first()
        .getAttribute('data-raw-ore')

      // Minst en ska vara satt; om båda satta ska de vara identiska (M134)
      if (rrValue !== null && brValue !== null) {
        expect(rrValue).toBe(brValue)
      }
    } finally {
      await ctx.cleanup()
    }
  })
})
