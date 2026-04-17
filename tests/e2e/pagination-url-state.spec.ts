/**
 * Sprint C / B1 — URL-state för pagination.
 *
 * Verifierar att `?invoices_page=N` synkas med pagination-state:
 *   T1: Direkt-URL med `?invoices_page=2` renderar sida 3.
 *   T2: Browser back-button återställer page-state efter navigation bort/tillbaka.
 */
import { test, expect, type Page } from '@playwright/test'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'
import { seedCustomer } from './helpers/seed'

/**
 * Skapar N draft-invoices via saveDraft-IPC i en batch.
 * Drafts räcker för pagination — listInvoices returnerar alla statusar.
 */
async function seedDrafts(
  window: Page,
  counterpartyId: number,
  fiscalYearId: number,
  count: number,
): Promise<void> {
  const vatCodeId = await window.evaluate(async () => {
    const result = await (
      window as unknown as {
        api: { listVatCodes: (d: { direction?: string }) => Promise<unknown> }
      }
    ).api.listVatCodes({ direction: 'outgoing' })
    const r = result as {
      success: boolean
      data: Array<{ id: number; code: string }>
      error?: string
    }
    if (!r.success) throw new Error(`listVatCodes failed: ${r.error}`)
    const code = r.data.find((c) => c.code === 'MP1')
    if (!code) throw new Error('MP1 not found')
    return code.id
  })

  await window.evaluate(
    async ({ cpId, fyId, vcId, n }) => {
      const api = (
        window as unknown as {
          api: { saveDraft: (d: unknown) => Promise<unknown> }
        }
      ).api
      for (let i = 0; i < n; i++) {
        const r = (await api.saveDraft({
          counterparty_id: cpId,
          fiscal_year_id: fyId,
          invoice_date: '2026-03-15',
          due_date: '2026-04-14',
          lines: [
            {
              product_id: null,
              description: `Pag E2E #${i + 1}`,
              quantity: 1,
              unit_price_ore: 10000,
              vat_code_id: vcId,
              sort_order: 0,
              account_number: '3002',
            },
          ],
        })) as { success: boolean; error?: string }
        if (!r.success) throw new Error(`saveDraft ${i} failed: ${r.error}`)
      }
    },
    { cpId: counterpartyId, fyId: fiscalYearId, vcId: vatCodeId, n: count },
  )
}

test.describe.serial('B1 pagination URL-state', () => {
  let appCtx: Awaited<ReturnType<typeof launchAppWithFreshDb>> | null = null

  test.afterAll(async () => {
    if (appCtx) await appCtx.cleanup()
  })

  test('T1 — direkt-URL ?invoices_page=2 visar sida 3', async () => {
    appCtx = await launchAppWithFreshDb()
    const ctx = appCtx
    const seeded = await seedCompanyViaIPC(ctx.window)
    const cpId = await seedCustomer(ctx.window)

    // 51 drafts → 2 sidor (PAGE_SIZE=50 → sida 1: 50, sida 2: 1)
    await seedDrafts(ctx.window, cpId, seeded.fiscalYearId, 51)

    await ctx.window.evaluate(() => {
      location.hash = '#/income?invoices_page=1'
    })

    await expect(ctx.window.getByTestId('page-income')).toBeVisible({ timeout: 15_000 })
    await expect(ctx.window.getByTestId('pag-invoices-position')).toHaveText('Sida 2 / 2', {
      timeout: 10_000,
    })
  })

  test('T2 — back-button bevarar pagination-state', async () => {
    if (!appCtx) throw new Error('T1 did not initialize context')
    const ctx = appCtx

    // Starta på sida 1, klicka next → sida 2
    await ctx.window.evaluate(() => {
      location.hash = '#/income'
    })
    await expect(ctx.window.getByTestId('page-income')).toBeVisible({ timeout: 15_000 })
    await expect(ctx.window.getByTestId('pag-invoices-position')).toHaveText('Sida 1 / 2', {
      timeout: 10_000,
    })

    await ctx.window.getByTestId('pag-invoices-next').click()
    await expect(ctx.window.getByTestId('pag-invoices-position')).toHaveText('Sida 2 / 2')

    // Navigera bort
    await ctx.window.evaluate(() => {
      location.hash = '#/expenses'
    })
    await expect(ctx.window.getByTestId('page-expenses')).toBeVisible({ timeout: 10_000 })

    // Back → återställ pagination
    await ctx.window.goBack()
    await expect(ctx.window.getByTestId('page-income')).toBeVisible({ timeout: 10_000 })
    await expect(ctx.window.getByTestId('pag-invoices-position')).toHaveText('Sida 2 / 2', {
      timeout: 10_000,
    })
  })
})
