/**
 * S55 A7b — camt.053 duplicate rejection.
 *
 * Importera samma fil två gånger → andra körningen avvisas med tydligt felmeddelande.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'camt053-happy.xml')

test('S55 A7b: duplicate camt.053 avvisas med tydligt fel', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    const { companyId, fiscalYearId } = await seedCompanyViaIPC(ctx.window)
    const xml = fs.readFileSync(FIXTURE_PATH, 'utf8')

    const first = await ctx.window.evaluate(
      async (p) => {
        return await (
          window as unknown as {
            api: {
              importBankStatement: (d: unknown) => Promise<{ success: boolean }>
            }
          }
        ).api.importBankStatement(p)
      },
      { company_id: companyId, fiscal_year_id: fiscalYearId, xml_content: xml },
    )
    expect(first.success).toBe(true)

    const second = await ctx.window.evaluate(
      async (p) => {
        return await (
          window as unknown as {
            api: {
              importBankStatement: (
                d: unknown,
              ) => Promise<{ success: boolean; error?: string; code?: string }>
            }
          }
        ).api.importBankStatement(p)
      },
      { company_id: companyId, fiscal_year_id: fiscalYearId, xml_content: xml },
    )
    expect(second.success).toBe(false)
    expect(second.code).toBe('VALIDATION_ERROR')
    expect(second.error).toMatch(/redan importerats/i)
  } finally {
    await ctx.cleanup()
  }
})
