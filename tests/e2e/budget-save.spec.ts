/**
 * S49 — Budget save + variance E2E (F2 vakt).
 *
 * Happy-path: fyll budget i grid via UI → Spara → reload → värden kvar.
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'

test('Budget save persists and reload shows values', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    const { fiscalYearId } = await seedCompanyViaIPC(ctx.window)

    // Navigate to budget page
    await ctx.window.evaluate(() => {
      location.hash = '#/budget'
    })
    await expect(ctx.window.getByTestId('page-budget')).toBeVisible({
      timeout: 15_000,
    })

    // Wait for grid to render (Nettoomsättning row appears once lines load)
    await expect(ctx.window.getByText('Nettoomsättning')).toBeVisible({
      timeout: 10_000,
    })

    // Fill P1 and P2 for Nettoomsättning (first row)
    const p1Input = ctx.window.getByLabel('Nettoomsättning P1', { exact: true })
    const p2Input = ctx.window.getByLabel('Nettoomsättning P2', { exact: true })
    await p1Input.fill('10000')
    await p2Input.fill('15000')

    // Click Spara
    await ctx.window.getByRole('button', { name: 'Spara' }).click()

    // Wait for save to complete (toast or button re-disabled)
    await expect(ctx.window.getByText('Budget sparad')).toBeVisible({
      timeout: 5_000,
    })

    // Verify persistence via IPC
    const targets = (await ctx.window.evaluate(async (fyId) => {
      return await (
        window as unknown as {
          api: {
            getBudgetTargets: (d: {
              fiscal_year_id: number
            }) => Promise<unknown>
          }
        }
      ).api.getBudgetTargets({ fiscal_year_id: fyId })
    }, fiscalYearId)) as {
      success: boolean
      data: Array<{
        line_id: string
        period_number: number
        amount_ore: number
      }>
    }
    expect(targets.success).toBe(true)

    const p1 = targets.data.find(
      (t) => t.line_id === 'net_revenue' && t.period_number === 1,
    )
    const p2 = targets.data.find(
      (t) => t.line_id === 'net_revenue' && t.period_number === 2,
    )
    expect(p1?.amount_ore).toBe(1_000_000)
    expect(p2?.amount_ore).toBe(1_500_000)

    // Reload window and verify values still shown in UI
    await ctx.window.reload()
    await expect(ctx.window.getByTestId('page-budget')).toBeVisible({
      timeout: 15_000,
    })
    await expect(
      ctx.window.getByLabel('Nettoomsättning P1', { exact: true }),
    ).toHaveValue('10000', { timeout: 10_000 })
    await expect(
      ctx.window.getByLabel('Nettoomsättning P2', { exact: true }),
    ).toHaveValue('15000')
  } finally {
    await ctx.cleanup()
  }
})
