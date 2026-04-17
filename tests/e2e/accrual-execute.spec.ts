/**
 * S49 — Accrual create + execute E2E (F3 vakt).
 *
 * Flow: skapa schedule via UI dialog → kör P1 → verifiera D-verifikat via __testApi.
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'
import { getJournalEntries } from './helpers/assertions'

test('Accrual: create schedule and execute P1 creates D-verifikat', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    const { fiscalYearId } = await seedCompanyViaIPC(ctx.window)

    // Navigate to accruals page
    await ctx.window.evaluate(() => {
      location.hash = '#/accruals'
    })
    await expect(ctx.window.getByTestId('page-accruals')).toBeVisible({
      timeout: 15_000,
    })

    // Open "Ny periodisering" dialog
    await ctx.window.getByRole('button', { name: /ny periodisering/i }).click()
    const dialog = ctx.window.getByRole('dialog', { name: /ny periodisering/i })
    await expect(dialog).toBeVisible()

    // Fill form: prepaid_expense, 1710 → 5010, 12000 kr over 3 periods from P1
    // Labels are not wired via htmlFor; use placeholder + positional instead.
    await dialog
      .getByPlaceholder('T.ex. Förutbetald hyra 2025')
      .fill('E2E förutbetald hyra')
    // Typ defaults to prepaid_expense
    await dialog.getByPlaceholder('1710').fill('1710')
    await dialog.getByPlaceholder('5010').fill('5010')
    // Totalbelopp — the only number input with step=0.01
    await dialog.locator('input[type="number"][step="0.01"]').fill('12000')
    // start_period defaults to P1, period_count defaults to 3

    await dialog.getByRole('button', { name: 'Skapa' }).click()

    // Toast + card appears
    await expect(
      ctx.window.getByText('Periodiseringsschema skapat'),
    ).toBeVisible({ timeout: 5_000 })
    await expect(
      ctx.window.getByRole('heading', { name: 'E2E förutbetald hyra' }),
    ).toBeVisible()

    // Click "Kör P1"
    await ctx.window.getByRole('button', { name: 'Kör P1' }).click()
    await expect(ctx.window.getByText('Period 1 bokförd')).toBeVisible({
      timeout: 5_000,
    })

    // Verify journal entry via __testApi
    const { entries, lines } = await getJournalEntries(ctx.window, fiscalYearId)
    // Accruals bokförs på C-serien (manual/korrigering)
    const cEntries = entries.filter(
      (e) => e.verification_series === 'C' && e.status === 'booked',
    )
    expect(cEntries.length).toBe(1)

    const periodLines = lines.filter(
      (l) => l.journal_entry_id === cEntries[0].id,
    )
    // 12000 / 3 = 4000 kr = 400_000 ören per period
    const debitLine = periodLines.find((l) => l.debit_ore > 0)
    const creditLine = periodLines.find((l) => l.credit_ore > 0)
    expect(debitLine?.debit_ore).toBe(400_000)
    expect(creditLine?.credit_ore).toBe(400_000)
    // Kontona från schedule (1710 / 5010) ska finnas i verifikatet
    const accountNumbers = periodLines.map((l) => l.account_number).sort()
    expect(accountNumbers).toEqual(['1710', '5010'])
  } finally {
    await ctx.cleanup()
  }
})
