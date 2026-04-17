/**
 * S55 A7 — camt.053 import happy-path.
 *
 * Seed company → importera via IPC → verifiera UI-lista + detail.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'camt053-happy.xml')

test('S55 A7a: camt.053 import happy-path — lista + detail', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    const { companyId, fiscalYearId } = await seedCompanyViaIPC(ctx.window)
    const xml = fs.readFileSync(FIXTURE_PATH, 'utf8')

    // Import via IPC (FileReader-flödet i UI:t triggerar samma API)
    const importResult = await ctx.window.evaluate(
      async (payload) => {
        return await (
          window as unknown as {
            api: {
              importBankStatement: (d: unknown) => Promise<{
                success: boolean
                data?: { statement_id: number; transaction_count: number }
                error?: string
              }>
            }
          }
        ).api.importBankStatement(payload)
      },
      { company_id: companyId, fiscal_year_id: fiscalYearId, xml_content: xml },
    )
    expect(importResult.success).toBe(true)
    expect(importResult.data!.transaction_count).toBe(3)

    // Navigera till lista
    await ctx.window.evaluate(() => {
      location.hash = '#/bank-statements'
    })
    await expect(ctx.window.getByTestId('page-bank-statements')).toBeVisible({
      timeout: 10_000,
    })

    // Lista: ska visa importerat statement
    const listRow = ctx.window.locator('text=STMT-2026-04')
    await expect(listRow).toBeVisible()

    // Öppna detail
    await ctx.window
      .getByTestId(`bank-statement-${importResult.data!.statement_id}-open`)
      .click()
    await expect(ctx.window.locator('text=2026-04-05').first()).toBeVisible({
      timeout: 5_000,
    })
    // 3 transaktioner visas med match-knappar (alla unmatched)
    await expect(
      ctx.window.getByTestId(/^bank-match-\d+$/).first(),
    ).toBeVisible()
  } finally {
    await ctx.cleanup()
  }
})
