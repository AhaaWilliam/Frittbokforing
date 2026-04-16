/**
 * 05 — Leverantörsfakturor (B-serie).
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb } from '../helpers/launch-app'
import { composeEmptyK2 } from '../fixtures/compose'
import { seedSupplier } from '../helpers/seed'
import { getJournalEntries } from '../helpers/assertions'
import { getExpenses } from '../helpers/ipc-testapi'

async function createAndFinalizeExpense(
  window: import('@playwright/test').Page,
  opts: { supplierId: number; fiscalYearId: number; invoiceDate: string; amount_ore: number },
): Promise<number> {
  const vatCode = await window.evaluate(async () => {
    const result = await (window as unknown as { api: { listVatCodes: (d: unknown) => Promise<unknown> } }).api.listVatCodes({ direction: 'incoming' })
    const r = result as { success: boolean; data: Array<{ id: number; code: string }> }
    return r.data.find(c => c.code === 'IP1')
  })
  if (!vatCode) throw new Error('VAT code IP1 (incoming) not found')

  const draft = await window.evaluate(async (args) => {
    return (window as unknown as { api: { saveExpenseDraft: (d: unknown) => Promise<unknown> } }).api.saveExpenseDraft({
      counterparty_id: args.supplierId,
      fiscal_year_id: args.fiscalYearId,
      expense_date: args.invoiceDate,
      due_date: args.invoiceDate,
      description: 'E2E leverantörsfaktura',
      supplier_invoice_number: `INV-${Date.now()}`,
      lines: [{
        description: 'E2E exp',
        quantity: 1,
        unit_price_ore: args.amount_ore,
        vat_code_id: args.vatCodeId,
        account_number: '6110',
        sort_order: 0,
      }],
    })
  }, { ...opts, vatCodeId: vatCode.id })
  const dr = draft as { success: boolean; data: { id: number }; error?: string }
  if (!dr.success) throw new Error(`saveExpenseDraft failed: ${dr.error}`)

  const fin = await window.evaluate(async (id) => {
    return (window as unknown as { api: { finalizeExpense: (d: { id: number }) => Promise<unknown> } }).api.finalizeExpense({ id })
  }, dr.data.id)
  const fr = fin as { success: boolean; error?: string }
  if (!fr.success) throw new Error(`finalizeExpense failed: ${fr.error}`)

  return dr.data.id
}

test.describe('Leverantörsfakturor', () => {
  test('skapa + boka → B1 skapas', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
      const { fiscalYearId } = await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({ timeout: 15_000 })

      const supplierId = await seedSupplier(ctx.window, 'Lev B-serie AB')
      const expenseId = await createAndFinalizeExpense(ctx.window, {
        supplierId, fiscalYearId, invoiceDate: '2026-03-15', amount_ore: 80000,
      })

      const expenses = await getExpenses(ctx.window, fiscalYearId)
      expect(expenses.length).toBe(1)
      expect(expenses[0].id).toBe(expenseId)

      const { entries } = await getJournalEntries(ctx.window, fiscalYearId)
      const b1 = entries.find(e => e.verification_series === 'B' && e.verification_number === 1)
      expect(b1).toBeDefined()
      expect(b1!.status).toBe('booked')
    } finally {
      await ctx.cleanup()
    }
  })

  test('B-serie gapless oberoende av A-serie', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
      const { fiscalYearId } = await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({ timeout: 15_000 })

      const supplierId = await seedSupplier(ctx.window, 'Lev Gapless')
      await createAndFinalizeExpense(ctx.window, { supplierId, fiscalYearId, invoiceDate: '2026-03-15', amount_ore: 10000 })
      await createAndFinalizeExpense(ctx.window, { supplierId, fiscalYearId, invoiceDate: '2026-03-16', amount_ore: 20000 })

      const { entries } = await getJournalEntries(ctx.window, fiscalYearId)
      const bEntries = entries.filter(e => e.verification_series === 'B' && e.status === 'booked')
      expect(bEntries.map(e => e.verification_number).sort((a, b) => a - b)).toEqual([1, 2])
    } finally {
      await ctx.cleanup()
    }
  })
})
