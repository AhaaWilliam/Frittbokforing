/**
 * S24b — E2E: Årets resultat identisk i RR och BR.
 *
 * Acceptanskriteriet för F19 (BR-result-konsistens).
 * Scenario med klass 8 + 89xx-skatt eftersom det var det case
 * där den gamla BR-koden (filter via startsWith) divergerade.
 *
 * Locale-oberoende assertion via data-raw-ore attribute.
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'

/**
 * Seed a manual entry (draft + finalize) via IPC.
 * Returns the manual entry id.
 */
async function seedAndFinalizeManualEntry(
  window: import('@playwright/test').Page,
  opts: {
    fiscalYearId: number
    date: string
    description: string
    lines: Array<{
      account_number: string
      debit_ore: number
      credit_ore: number
    }>
  },
): Promise<number> {
  const draftResult = await window.evaluate(
    async (d) => {
      return await (
        window as unknown as {
          api: {
            saveManualEntryDraft: (d: unknown) => Promise<unknown>
          }
        }
      ).api.saveManualEntryDraft(d)
    },
    {
      fiscal_year_id: opts.fiscalYearId,
      entry_date: opts.date,
      description: opts.description,
      lines: opts.lines.map((l, i) => ({
        ...l,
        description: '',
      })),
    },
  )

  const dr = draftResult as {
    success: boolean
    data: { id: number }
    error?: string
  }
  if (!dr.success) throw new Error(`saveManualEntryDraft failed: ${dr.error}`)

  const finalResult = await window.evaluate(
    async (d) => {
      return await (
        window as unknown as {
          api: {
            finalizeManualEntry: (d: {
              id: number
              fiscal_year_id: number
            }) => Promise<unknown>
          }
        }
      ).api.finalizeManualEntry(d)
    },
    { id: dr.data.id, fiscal_year_id: opts.fiscalYearId },
  )

  const fr = finalResult as { success: boolean; error?: string }
  if (!fr.success) throw new Error(`finalizeManualEntry failed: ${fr.error}`)

  return dr.data.id
}

test('årets resultat identisk i RR och BR med klass 8 + skatt', async () => {
  const { window, cleanup } = await launchAppWithFreshDb()

  try {
    // 1. Onboarding via UI
    await expect(window.getByTestId('wizard')).toBeVisible({
      timeout: 15_000,
    })
    await window.getByPlaceholder('AB Företaget').fill('Result Test AB')
    await window.getByPlaceholder('NNNNNN-NNNN').fill('556036-0793')
    await window.locator('input[type="date"]').fill('2020-01-15')
    await window.getByText('Nästa').click()
    await window.getByText('Nästa').click()
    await expect(window.getByText('Sammanfattning')).toBeVisible({
      timeout: 5_000,
    })
    await window.getByText('Starta bokföringen').click()
    await expect(window.getByTestId('app-ready')).toBeVisible({
      timeout: 15_000,
    })

    // 2. Get fiscal year id
    const fyResult = (await window.evaluate(async () => {
      return await (
        window as unknown as {
          api: { listFiscalYears: () => Promise<unknown> }
        }
      ).api.listFiscalYears()
    })) as { success: boolean; data: Array<{ id: number }> }
    const fyId = fyResult.data[0].id

    // 3. Seed journal entries: Revenue 200k, financial expense 10k, tax 20k
    //    Expected net result: 200k - 10k - 20k = 170k = 17_000_000 ören
    //    Dates in 2020 to match wizard's FY (registration_date = 2020-01-15)
    await seedAndFinalizeManualEntry(window, {
      fiscalYearId: fyId,
      date: '2020-03-01',
      description: 'Revenue 200k',
      lines: [
        { account_number: '1930', debit_ore: 20_000_000, credit_ore: 0 },
        { account_number: '3002', debit_ore: 0, credit_ore: 20_000_000 },
      ],
    })

    await seedAndFinalizeManualEntry(window, {
      fiscalYearId: fyId,
      date: '2020-06-30',
      description: 'Financial expense 10k',
      lines: [
        { account_number: '8410', debit_ore: 1_000_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 1_000_000 },
      ],
    })

    await seedAndFinalizeManualEntry(window, {
      fiscalYearId: fyId,
      date: '2020-12-31',
      description: 'Tax 20k',
      lines: [
        { account_number: '8910', debit_ore: 2_000_000, credit_ore: 0 },
        { account_number: '2510', debit_ore: 0, credit_ore: 2_000_000 },
      ],
    })

    // 4. Navigate to reports page (both RR and BR on same page)
    await window.evaluate(() => {
      location.hash = '#/reports'
    })

    // 5. Read RR value (Resultaträkning tab is default)
    //    .first() because PageReports renders both normal and printMode versions
    const rrLocator = window.getByTestId('arets-resultat-value').first()
    await expect(rrLocator).toBeVisible({ timeout: 10_000 })
    const rrValue = await rrLocator.getAttribute('data-raw-ore')

    // 6. Switch to Balansräkning tab and read BR value
    await window.getByRole('button', { name: 'Balansräkning' }).click()
    const brLocator = window.getByTestId('arets-resultat-br-value').first()
    await expect(brLocator).toBeVisible({ timeout: 10_000 })
    const brValue = await brLocator.getAttribute('data-raw-ore')

    // 7. Assert: both non-null, both 17_000_000, both identical
    expect(rrValue).not.toBeNull()
    expect(brValue).not.toBeNull()
    expect(rrValue).toBe('17000000')
    expect(brValue).toBe('17000000')
    expect(rrValue).toBe(brValue)
  } finally {
    await cleanup()
  }
})
