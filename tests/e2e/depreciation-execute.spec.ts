/**
 * S-B / F62-c — Asset lifecycle E2E: create → depreciate → dispose.
 *
 * T1, T2 delar state via test.describe.serial (T2 förutsätter T1:s avskrivning).
 * T3 seedar eget state (separat från T1/T2).
 *
 * Verifierar disposal-bokföring (E-serie, M151/M154) via __testApi — DOM-assertioner
 * är sköra pga sv-SE currency-formatering (\u00A0/\u202F, se M136).
 */
import { test, expect, type Page } from '@playwright/test'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'
import { getJournalEntries } from './helpers/assertions'

// ---- IPC helpers (sparar en self-contained context per test) ----

async function ensureAccount(
  window: Page,
  account_number: string,
  name: string,
): Promise<void> {
  const result = await window.evaluate(
    async ({ an, n }) => {
      return await (
        window as unknown as {
          api: { accountCreate: (d: unknown) => Promise<unknown> }
        }
      ).api.accountCreate({
        account_number: an,
        name: n,
        k2_allowed: true,
        k3_only: false,
      })
    },
    { an: account_number, n: name },
  )
  const r = result as { success: boolean; error?: string; code?: string }
  // Tolerera duplicate — kontot kan redan finnas i default-kontoplanen
  if (!r.success && r.code !== 'ACCOUNT_DUPLICATE') {
    throw new Error(`ensureAccount(${account_number}) failed: ${r.error}`)
  }
}

async function createAsset(
  window: Page,
  overrides?: Partial<{
    name: string
    acquisition_cost_ore: number
    residual_value_ore: number
    useful_life_months: number
  }>,
): Promise<number> {
  const input = {
    name: overrides?.name ?? 'E2E Dator',
    acquisition_date: '2026-01-01',
    acquisition_cost_ore: overrides?.acquisition_cost_ore ?? 15_000_000,
    residual_value_ore: overrides?.residual_value_ore ?? 0,
    useful_life_months: overrides?.useful_life_months ?? 36,
    method: 'linear' as const,
    account_asset: '1220',
    account_accumulated_depreciation: '1229',
    account_depreciation_expense: '7832',
  }
  const result = await window.evaluate(
    async (data) =>
      await (
        window as unknown as {
          api: { createFixedAsset: (d: unknown) => Promise<unknown> }
        }
      ).api.createFixedAsset(data),
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
      await (
        window as unknown as {
          api: { executeDepreciationPeriod: (d: unknown) => Promise<unknown> }
        }
      ).api.executeDepreciationPeriod({
        fiscal_year_id: fy,
        period_end_date: ped,
      }),
    { fy: fiscalYearId, ped: period_end_date },
  )
  const r = result as { success: boolean; error?: string }
  if (!r.success)
    throw new Error(`executeDepreciationPeriod failed: ${r.error}`)
}

async function disposeAsset(
  window: Page,
  id: number,
  opts: { sale_price_ore?: number; proceeds_account?: string | null } = {},
): Promise<void> {
  const result = await window.evaluate(
    async (data) =>
      await (
        window as unknown as {
          api: { disposeFixedAsset: (d: unknown) => Promise<unknown> }
        }
      ).api.disposeFixedAsset(data),
    {
      id,
      disposed_date: '2026-02-01',
      generate_journal_entry: true,
      sale_price_ore: opts.sale_price_ore,
      proceeds_account: opts.proceeds_account ?? null,
    },
  )
  const r = result as { success: boolean; error?: string }
  if (!r.success) throw new Error(`disposeFixedAsset failed: ${r.error}`)
}

// ─── T1 + T2 delar state ────────────────────────────────────────────

test.describe.serial('Asset lifecycle: create → depreciate → dispose', () => {
  let assetId: number
  let fiscalYearId: number
  let appCtx: Awaited<ReturnType<typeof launchAppWithFreshDb>> | null = null

  test.afterAll(async () => {
    if (appCtx) await appCtx.cleanup()
  })

  test('T1 — skapa tillgång + kör avskrivning för period 1', async () => {
    appCtx = await launchAppWithFreshDb()
    const ctx = appCtx
    const seeded = await seedCompanyViaIPC(ctx.window)
    fiscalYearId = seeded.fiscalYearId

    // 7970 + 3970 behövs för framtida disposal (och är inte i default-kontoplan)
    await ensureAccount(ctx.window, '7970', 'Förlust vid avyttring')
    await ensureAccount(ctx.window, '3970', 'Vinst vid avyttring')

    assetId = await createAsset(ctx.window)

    // Navigera till PageFixedAssets för att verifiera UI-kontraktet
    await ctx.window.evaluate(() => {
      location.hash = '#/fixed-assets'
    })
    await expect(ctx.window.getByTestId('page-fixed-assets')).toBeVisible({
      timeout: 15_000,
    })
    await expect(ctx.window.getByTestId(`fa-row-${assetId}`)).toBeVisible()

    // Kör avskrivning för 2026-01
    await executePeriod(ctx.window, fiscalYearId, '2026-01-31')

    // Verifiera E-serie-verifikat
    const { entries, lines } = await getJournalEntries(ctx.window, fiscalYearId)
    const eEntries = entries.filter(
      (e) => e.verification_series === 'E' && e.status === 'booked',
    )
    expect(eEntries.length).toBe(1)

    // Avskrivning: 15_000_000 / 36 = 416_666.67 → round = 416_667 öre
    const depLines = lines.filter((l) => l.journal_entry_id === eEntries[0].id)
    const debit = depLines.find((l) => l.debit_ore > 0)
    const credit = depLines.find((l) => l.credit_ore > 0)
    expect(debit?.account_number).toBe('7832')
    expect(credit?.account_number).toBe('1229')
    expect(debit?.debit_ore).toBe(416_667)
    expect(credit?.credit_ore).toBe(416_667)
  })

  test('T2 — Avyttra utan försäljningspris → full förlust på 7970', async () => {
    if (!appCtx) throw new Error('T1 did not initialize context')
    // T1-state: 1 avskrivning körd (416 667 öre)
    const { window } = appCtx

    await disposeAsset(window, assetId)

    const { entries, lines } = await getJournalEntries(window, fiscalYearId)
    const eEntries = entries
      .filter((e) => e.verification_series === 'E' && e.status === 'booked')
      .sort((a, b) => a.verification_number - b.verification_number)
    // 2 verifikat: [0] avskrivning från T1, [1] disposal
    expect(eEntries.length).toBe(2)
    const disposalId = eEntries[1].id
    const disposalLines = lines
      .filter((l) => l.journal_entry_id === disposalId)
      .sort((a, b) => a.line_number - b.line_number)

    // Förväntat (book_value = 15_000_000 − 416_667 = 14_583_333):
    //   D 1229  416 667    (ack.avskr återföring)
    //   K 1220  15 000 000 (anskaffningsvärde bort)
    //   D 7970  14 583 333 (förlust = book_value)
    expect(disposalLines.length).toBe(3)
    expect(disposalLines[0]).toMatchObject({
      account_number: '1229',
      debit_ore: 416_667,
      credit_ore: 0,
    })
    expect(disposalLines[1]).toMatchObject({
      account_number: '1220',
      debit_ore: 0,
      credit_ore: 15_000_000,
    })
    expect(disposalLines[2]).toMatchObject({
      account_number: '7970',
      debit_ore: 14_583_333,
      credit_ore: 0,
    })

    // Balanserar
    const debitSum = disposalLines.reduce((s, l) => s + l.debit_ore, 0)
    const creditSum = disposalLines.reduce((s, l) => s + l.credit_ore, 0)
    expect(debitSum).toBe(creditSum)
  })
})

// ─── T3 isolerad seed (F62-c-extension) ─────────────────────────────

test('T3 — Avyttra med försäljningspris över bokfört värde → K 3970 vinst', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    const { fiscalYearId } = await seedCompanyViaIPC(ctx.window)
    await ensureAccount(ctx.window, '7970', 'Förlust vid avyttring')
    await ensureAccount(ctx.window, '3970', 'Vinst vid avyttring')

    // Ny tillgång, inga avskrivningar — book_value = 15_000_000
    const assetId = await createAsset(ctx.window, { name: 'E2E Server' })

    // Avyttring med sale_price 16_000_000 → vinst 1_000_000 via 1930
    await disposeAsset(ctx.window, assetId, {
      sale_price_ore: 16_000_000,
      proceeds_account: '1930',
    })

    const { entries, lines } = await getJournalEntries(ctx.window, fiscalYearId)
    const eEntries = entries.filter(
      (e) => e.verification_series === 'E' && e.status === 'booked',
    )
    expect(eEntries.length).toBe(1)

    const disposalLines = lines
      .filter((l) => l.journal_entry_id === eEntries[0].id)
      .sort((a, b) => a.line_number - b.line_number)

    // Inga avskrivningar → 1229-rad utelämnas. 3 rader:
    //   K 1220  15 000 000
    //   D 1930  16 000 000
    //   K 3970   1 000 000 (vinst)
    expect(disposalLines.length).toBe(3)
    expect(disposalLines[0]).toMatchObject({
      account_number: '1220',
      debit_ore: 0,
      credit_ore: 15_000_000,
    })
    expect(disposalLines[1]).toMatchObject({
      account_number: '1930',
      debit_ore: 16_000_000,
      credit_ore: 0,
    })
    expect(disposalLines[2]).toMatchObject({
      account_number: '3970',
      debit_ore: 0,
      credit_ore: 1_000_000,
    })

    const debitSum = disposalLines.reduce((s, l) => s + l.debit_ore, 0)
    const creditSum = disposalLines.reduce((s, l) => s + l.credit_ore, 0)
    expect(debitSum).toBe(creditSum)
  } finally {
    await ctx.cleanup()
  }
})
