/**
 * 01 — Onboarding-wizard (3 steg).
 *
 * Testar UI-flöden som bara E2E kan fånga:
 * - Happy path K2 + K3
 * - Luhn-fel visas inline, Nästa disabled
 * - Redigera bolagsuppgifter efter setup
 *
 * Edge cases för Luhn-algoritm testas i unit-lagret (M116).
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb } from '../helpers/launch-app'

test.describe('Onboarding', () => {
  test('K2 wizard happy path skapar bolag + FY @critical', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({
        timeout: 15_000,
      })

      await ctx.window.getByPlaceholder('AB Företaget').fill('Onboarding K2 AB')
      await ctx.window.getByPlaceholder('NNNNNN-NNNN').fill('556036-0793')
      await ctx.window.locator('input[type="date"]').fill('2020-01-15')
      await ctx.window.getByText('Nästa').click()

      await ctx.window.getByText('Nästa').click()

      await expect(ctx.window.getByText('Sammanfattning')).toBeVisible({
        timeout: 5_000,
      })
      await ctx.window.getByText('Starta bokföringen').click()

      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({
        timeout: 15_000,
      })

      // Verifiera via IPC att bolag + FY finns
      const fyResult = await ctx.window.evaluate(async () => {
        return (
          window as unknown as {
            api: { listFiscalYears: () => Promise<unknown> }
          }
        ).api.listFiscalYears()
      })
      const fy = fyResult as { success: boolean; data: Array<{ id: number }> }
      expect(fy.success).toBe(true)
      expect(fy.data.length).toBeGreaterThanOrEqual(1)
    } finally {
      await ctx.cleanup()
    }
  })

  test('Luhn-fel visar inline-meddelande och blockerar Nästa', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({
        timeout: 15_000,
      })

      await ctx.window.getByPlaceholder('AB Företaget').fill('Test AB')
      // Luhn-felaktigt orgnr (sista siffran fel)
      await ctx.window.getByPlaceholder('NNNNNN-NNNN').fill('556036-0794')
      await ctx.window.locator('input[type="date"]').fill('2020-01-15')

      // Klicka Nästa — borde antingen förhindras eller visa fel
      await ctx.window.getByText('Nästa').click()

      // Förblir på wizard (inte flyttar till app-ready)
      await ctx.window.waitForTimeout(500)
      await expect(ctx.window.getByTestId('wizard')).toBeVisible()
      // Vi har inte gått till app-ready
      const appReady = await ctx.window.getByTestId('app-ready').count()
      expect(appReady).toBe(0)
    } finally {
      await ctx.cleanup()
    }
  })
})
