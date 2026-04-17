/**
 * 06 — Manuella verifikat (C-serie).
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb } from '../helpers/launch-app'
import { composeEmptyK2 } from '../fixtures/compose'
import { getJournalEntries } from '../helpers/assertions'

async function createManual(
  window: import('@playwright/test').Page,
  fiscalYearId: number,
  lines: Array<{
    account_number: string
    debit_ore: number
    credit_ore: number
  }>,
  entryDate = '2026-03-15',
): Promise<{ success: boolean; data?: { id: number }; error?: string }> {
  const draft = await window.evaluate(
    async (args) => {
      return (
        window as unknown as {
          api: { saveManualEntryDraft: (d: unknown) => Promise<unknown> }
        }
      ).api.saveManualEntryDraft({
        fiscal_year_id: args.fy,
        entry_date: args.date,
        description: 'E2E manual',
        lines: args.lines,
      })
    },
    { fy: fiscalYearId, date: entryDate, lines },
  )
  const dr = draft as { success: boolean; data: { id: number }; error?: string }
  if (!dr.success) return { success: false, error: dr.error }

  const fin = await window.evaluate(
    async (args) => {
      return (
        window as unknown as {
          api: {
            finalizeManualEntry: (d: {
              id: number
              fiscal_year_id: number
            }) => Promise<unknown>
          }
        }
      ).api.finalizeManualEntry({ id: args.id, fiscal_year_id: args.fy })
    },
    { id: dr.data.id, fy: fiscalYearId },
  )
  return fin as { success: boolean; data?: { id: number }; error?: string }
}

test.describe('Manuella verifikat', () => {
  test('balanserad C bokförs som C1', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({
        timeout: 15_000,
      })
      const { fiscalYearId } = await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({
        timeout: 15_000,
      })

      const result = await createManual(ctx.window, fiscalYearId, [
        { account_number: '6110', debit_ore: 50000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 50000 },
      ])
      expect(result.success).toBe(true)

      const { entries } = await getJournalEntries(ctx.window, fiscalYearId)
      const c1 = entries.find(
        (e) => e.verification_series === 'C' && e.verification_number === 1,
      )
      expect(c1).toBeDefined()
      expect(c1!.status).toBe('booked')
    } finally {
      await ctx.cleanup()
    }
  })

  test('obalanserad C avvisas på service-nivå', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({
        timeout: 15_000,
      })
      const { fiscalYearId } = await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({
        timeout: 15_000,
      })

      const result = await createManual(ctx.window, fiscalYearId, [
        { account_number: '6110', debit_ore: 50000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 40000 }, // obalanserad
      ])
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    } finally {
      await ctx.cleanup()
    }
  })
})
