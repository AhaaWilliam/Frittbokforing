/**
 * 04 — Kundfakturor (A-serie): skapa, boka, betala, delbetala.
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb } from '../helpers/launch-app'
import { composeEmptyK2 } from '../fixtures/compose'
import { seedCustomer, seedAndFinalizeInvoice } from '../helpers/seed'
import { getInvoices, getJournalEntries } from '../helpers/assertions'

test.describe('Kundfakturor', () => {
  test.beforeEach(() => {
    // Frys innan launch så overdue-refresh vid appstart inte markerar som overdue
    process.env.FRITT_NOW = '2026-03-20T12:00:00.000Z'
  })
  test.afterEach(() => {
    delete process.env.FRITT_NOW
  })
  test('skapa + boka → A1 skapas och listas @critical', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({
        timeout: 15_000,
      })
      const { fiscalYearId } = await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({
        timeout: 15_000,
      })

      const customerId = await seedCustomer(ctx.window, 'Faktureringskund AB')
      const { invoiceId } = await seedAndFinalizeInvoice(ctx.window, {
        counterpartyId: customerId,
        fiscalYearId,
        invoiceDate: '2026-03-15',
        dueDate: '2030-12-31',
        unitPriceOre: 50000,
        quantity: 1,
      })

      await ctx.window.evaluate(() => {
        location.hash = '#/income'
      })
      await expect(ctx.window.getByTestId('page-income')).toBeVisible({
        timeout: 10_000,
      })
      await expect(ctx.window.getByText('A1')).toBeVisible({ timeout: 10_000 })

      const invoices = await getInvoices(ctx.window, fiscalYearId)
      expect(invoices.length).toBe(1)
      expect(invoices[0].id).toBe(invoiceId)
      expect(invoices[0].status).toBe('unpaid')

      const { entries } = await getJournalEntries(ctx.window, fiscalYearId)
      const a1 = entries.find(
        (e) => e.verification_series === 'A' && e.verification_number === 1,
      )
      expect(a1).toBeDefined()
      expect(a1!.status).toBe('booked')
    } finally {
      await ctx.cleanup()
    }
  })

  test('full betalning → status=paid @critical', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({
        timeout: 15_000,
      })
      const { fiscalYearId } = await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({
        timeout: 15_000,
      })

      const customerId = await seedCustomer(ctx.window, 'Betalningskund')
      const { invoiceId } = await seedAndFinalizeInvoice(ctx.window, {
        counterpartyId: customerId,
        fiscalYearId,
        invoiceDate: '2026-03-15',
        dueDate: '2030-12-31',
        unitPriceOre: 100000,
        quantity: 1,
      })

      // Betala via IPC (full betalning)
      const invList = await getInvoices(ctx.window, fiscalYearId)
      const total = invList.find((i) => i.id === invoiceId)!.total_amount_ore

      const payResult = await ctx.window.evaluate(
        async (args) => {
          return (
            window as unknown as {
              api: { payInvoice: (d: unknown) => Promise<unknown> }
            }
          ).api.payInvoice({
            invoice_id: args.id,
            amount_ore: args.amount,
            payment_date: '2026-03-20',
            payment_method: 'bankgiro',
            account_number: '1930',
          })
        },
        { id: invoiceId, amount: total },
      )
      expect((payResult as { success: boolean }).success).toBe(true)

      const after = await getInvoices(ctx.window, fiscalYearId)
      const paid = after.find((i) => i.id === invoiceId)!
      expect(paid.status).toBe('paid')
      expect(paid.paid_amount_ore).toBe(total)
    } finally {
      await ctx.cleanup()
    }
  })

  test('delbetalning → status=partially_paid', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({
        timeout: 15_000,
      })
      const { fiscalYearId } = await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({
        timeout: 15_000,
      })

      const customerId = await seedCustomer(ctx.window, 'Delbetkund')
      const { invoiceId } = await seedAndFinalizeInvoice(ctx.window, {
        counterpartyId: customerId,
        fiscalYearId,
        invoiceDate: '2026-03-15',
        dueDate: '2030-12-31',
        unitPriceOre: 200000,
        quantity: 1,
      })

      const invList = await getInvoices(ctx.window, fiscalYearId)
      const total = invList.find((i) => i.id === invoiceId)!.total_amount_ore

      const payResult = await ctx.window.evaluate(
        async (args) => {
          return (
            window as unknown as {
              api: { payInvoice: (d: unknown) => Promise<unknown> }
            }
          ).api.payInvoice({
            invoice_id: args.id,
            amount_ore: args.amount,
            payment_date: '2026-03-20',
            payment_method: 'bankgiro',
            account_number: '1930',
          })
        },
        { id: invoiceId, amount: Math.floor(total / 2) },
      )
      const pr = payResult as {
        success: boolean
        error?: string
        code?: string
      }
      expect(pr.success, `payInvoice failed: ${pr.error} (${pr.code})`).toBe(
        true,
      )

      const after = await getInvoices(ctx.window, fiscalYearId)
      expect(after.find((i) => i.id === invoiceId)!.status).toBe('partial')
    } finally {
      await ctx.cleanup()
    }
  })

  test('overdue-refresh: förfallen faktura får status=overdue vid appstart', async () => {
    // Frys tid EFTER due_date så refresh-loggiken markerar som overdue.
    process.env.FRITT_NOW = '2026-05-01T12:00:00.000Z'
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({
        timeout: 15_000,
      })
      const { fiscalYearId } = await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({
        timeout: 15_000,
      })

      const customerId = await seedCustomer(ctx.window, 'Förfallen AB')
      await seedAndFinalizeInvoice(ctx.window, {
        counterpartyId: customerId,
        fiscalYearId,
        invoiceDate: '2026-02-01',
        dueDate: '2026-03-15',
        unitPriceOre: 50000,
        quantity: 1,
      })

      // Navigera till income — appstart/visning triggar overdue-refresh
      await ctx.window.evaluate(() => {
        location.hash = '#/income'
      })
      await expect(ctx.window.getByTestId('page-income')).toBeVisible({
        timeout: 10_000,
      })
      // page-income visible confirms navigation; IPC via __testApi reads DB directly
      const invoices = await getInvoices(ctx.window, fiscalYearId)
      expect(invoices[0].status).toBe('overdue')
    } finally {
      delete process.env.FRITT_NOW
      await ctx.cleanup()
    }
  })
})
