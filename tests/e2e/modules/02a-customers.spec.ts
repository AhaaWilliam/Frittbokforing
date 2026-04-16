/**
 * 02a — Kundregister: CRUD via IPC + UI-navigation.
 *
 * Bara E2E kan fånga: sidan renderar, dropdown-filter speglar soft-delete.
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb } from '../helpers/launch-app'
import { composeEmptyK2 } from '../fixtures/compose'
import { seedCustomer } from '../helpers/seed'

test.describe('Kundregister', () => {
  test('skapa + lista kund (IPC + UI) @critical', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
      await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({ timeout: 15_000 })

      const customerId = await seedCustomer(ctx.window, 'Alpha Systems AB')
      expect(customerId).toBeGreaterThan(0)

      await ctx.window.evaluate(() => { location.hash = '#/customers' })
      await expect(ctx.window.getByTestId('page-customers')).toBeVisible({ timeout: 10_000 })
      await expect(ctx.window.getByText('Alpha Systems AB')).toBeVisible({ timeout: 5_000 })
    } finally {
      await ctx.cleanup()
    }
  })

  test('UNIQUE orgnr-dublett avvisas', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
      await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({ timeout: 15_000 })

      // Första kunden
      const firstResult = await ctx.window.evaluate(async () => {
        return (window as unknown as { api: { createCounterparty: (d: unknown) => Promise<unknown> } }).api.createCounterparty({
          name: 'Dublett AB', type: 'customer', org_number: '556677-8899', default_payment_terms: 30,
        })
      })
      expect((firstResult as { success: boolean }).success).toBe(true)

      // Dublett med samma orgnr
      const dupResult = await ctx.window.evaluate(async () => {
        return (window as unknown as { api: { createCounterparty: (d: unknown) => Promise<unknown> } }).api.createCounterparty({
          name: 'Dublett Two AB', type: 'customer', org_number: '556677-8899', default_payment_terms: 30,
        })
      })
      const dup = dupResult as { success: boolean; error?: string; code?: string }
      expect(dup.success).toBe(false)
      expect(dup.error).toBeDefined()
    } finally {
      await ctx.cleanup()
    }
  })
})
