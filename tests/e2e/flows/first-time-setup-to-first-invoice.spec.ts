/**
 * Demo-flöde: tom DB → bokförd + betald faktura → dashboard.
 * Smoke-test som blockerar release om det failar. UI-wizard testas separat
 * i 01-onboarding; här startar vi från composeEmptyK2 för snabbare iteration.
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb } from '../helpers/launch-app'
import { composeEmptyK2 } from '../fixtures/compose'
import { seedCustomer, seedAndFinalizeInvoice } from '../helpers/seed'
import { getInvoices, getJournalEntries } from '../helpers/assertions'

test.beforeEach(() => {
  process.env.FRITT_NOW = '2026-03-20T12:00:00.000Z'
})
test.afterEach(() => {
  delete process.env.FRITT_NOW
})

test('Demo-flöde: tom DB → bokförd + betald faktura på dashboard @critical @smoke', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    await expect(ctx.window.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
    const { fiscalYearId } = await composeEmptyK2(ctx.window)
    await expect(ctx.window.getByTestId('app-ready')).toBeVisible({ timeout: 15_000 })

    const customerId = await seedCustomer(ctx.window, 'Demo Kund AB')
    const { invoiceId } = await seedAndFinalizeInvoice(ctx.window, {
      counterpartyId: customerId,
      fiscalYearId,
      invoiceDate: '2026-03-15',
      dueDate: '2030-12-31',
      unitPriceOre: 125000,
      quantity: 1,
    })

    const invList = await getInvoices(ctx.window, fiscalYearId)
    const total = invList.find(i => i.id === invoiceId)!.total_amount_ore
    const payResult = await ctx.window.evaluate(async (args) => {
      return (window as unknown as { api: { payInvoice: (d: unknown) => Promise<unknown> } }).api.payInvoice({
        invoice_id: args.id, amount_ore: args.amount, payment_date: '2026-03-20',
        payment_method: 'bankgiro', account_number: '1930',
      })
    }, { id: invoiceId, amount: total })
    expect((payResult as { success: boolean }).success).toBe(true)

    const { entries } = await getJournalEntries(ctx.window, fiscalYearId)
    const series = entries.filter(e => e.status === 'booked').map(e => `${e.verification_series}${e.verification_number}`).sort()
    expect(series).toContain('A1')
    expect(series).toContain('A2')

    await ctx.window.evaluate(() => { location.hash = '#/overview' })
    await expect(ctx.window.getByTestId('page-overview')).toBeVisible({ timeout: 10_000 })
  } finally {
    await ctx.cleanup()
  }
})
