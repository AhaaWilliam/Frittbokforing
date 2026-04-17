/**
 * Sprint C / F62-d — Edit fixed asset E2E.
 *
 * T1, T2 delar state via test.describe.serial:
 *   T1: Redigera pristine asset via UI → verifiera update.
 *   T2: Exekvera avskrivning på samma asset → verifiera att edit-knappen försvinner från DOM.
 */
import { test, expect, type Page } from '@playwright/test'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'

async function createAsset(window: Page, name: string): Promise<number> {
  const input = {
    name,
    acquisition_date: '2026-01-01',
    acquisition_cost_ore: 10_000_000,
    residual_value_ore: 0,
    useful_life_months: 36,
    method: 'linear' as const,
    account_asset: '1220',
    account_accumulated_depreciation: '1229',
    account_depreciation_expense: '7832',
  }
  const result = await window.evaluate(
    async (data) =>
      await (window as unknown as { api: { createFixedAsset: (d: unknown) => Promise<unknown> } }).api.createFixedAsset(data),
    input,
  )
  const r = result as { success: boolean; data: { id: number }; error?: string }
  if (!r.success) throw new Error(`createFixedAsset failed: ${r.error}`)
  return r.data.id
}

async function executePeriod(
  window: Page,
  fiscalYearId: number,
  period_end_date: string,
): Promise<void> {
  const result = await window.evaluate(
    async ({ fy, ped }) =>
      await (window as unknown as { api: { executeDepreciationPeriod: (d: unknown) => Promise<unknown> } }).api.executeDepreciationPeriod({
        fiscal_year_id: fy,
        period_end_date: ped,
      }),
    { fy: fiscalYearId, ped: period_end_date },
  )
  const r = result as { success: boolean; error?: string }
  if (!r.success) throw new Error(`executeDepreciationPeriod failed: ${r.error}`)
}

test.describe.serial('F62-d asset edit', () => {
  let assetId: number
  let fiscalYearId: number
  let appCtx: Awaited<ReturnType<typeof launchAppWithFreshDb>> | null = null

  test.afterAll(async () => {
    if (appCtx) await appCtx.cleanup()
  })

  test('T1 — Redigera namn + cost på orörd asset', async () => {
    appCtx = await launchAppWithFreshDb()
    const ctx = appCtx
    const seeded = await seedCompanyViaIPC(ctx.window)
    fiscalYearId = seeded.fiscalYearId

    assetId = await createAsset(ctx.window, 'E2E Ursprungligt')

    await ctx.window.evaluate(() => {
      location.hash = '#/fixed-assets'
    })
    await expect(ctx.window.getByTestId('page-fixed-assets')).toBeVisible({ timeout: 15_000 })
    await expect(ctx.window.getByTestId(`fa-row-${assetId}`)).toBeVisible()
    await expect(ctx.window.getByTestId(`fa-edit-${assetId}`)).toBeVisible()

    await ctx.window.getByTestId(`fa-edit-${assetId}`).click()
    await expect(ctx.window.getByTestId('fixed-asset-form-dialog')).toBeVisible()

    const nameInput = ctx.window.getByTestId('fa-name')
    await nameInput.fill('E2E Omdöpt')
    const costInput = ctx.window.getByTestId('fa-cost')
    await costInput.fill('20000')

    await ctx.window.getByTestId('fa-submit').click()

    // Verifiera via API (robust mot locale-formatering av belopp)
    const result = await ctx.window.evaluate(
      async (id) =>
        await (window as unknown as { api: { getFixedAsset: (d: unknown) => Promise<unknown> } }).api.getFixedAsset({ id }),
      assetId,
    )
    const r = result as { success: boolean; data: { name: string; acquisition_cost_ore: number } }
    expect(r.success).toBe(true)
    expect(r.data.name).toBe('E2E Omdöpt')
    expect(r.data.acquisition_cost_ore).toBe(2_000_000)
  })

  test('T2 — Efter exekverad avskrivning saknar edit-knapp', async () => {
    if (!appCtx) throw new Error('T1 did not initialize context')
    const ctx = appCtx

    await executePeriod(ctx.window, fiscalYearId, '2026-01-31')

    await ctx.window.evaluate(() => {
      location.hash = '#/overview'
    })
    await ctx.window.evaluate(() => {
      location.hash = '#/fixed-assets'
    })
    await expect(ctx.window.getByTestId('page-fixed-assets')).toBeVisible({ timeout: 15_000 })
    await expect(ctx.window.getByTestId(`fa-row-${assetId}`)).toBeVisible()

    await expect(ctx.window.getByTestId(`fa-edit-${assetId}`)).toHaveCount(0)
    await expect(ctx.window.getByTestId(`fa-dispose-${assetId}`)).toBeVisible()
  })
})
