/**
 * Sprint 57 B4 happy — SIE4-import med konto-konflikt + "Skriv över".
 *
 * Seed company med konto 1930 "Bank" → SIE-fil med 1930 "Företagskonto" +
 * inga refererande verifikat → preview visar konflikt → välj "Skriv över"
 * → Importera → assert kontonamn uppdaterat.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import * as iconv from 'iconv-lite'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'

function buildSie4(lines: string[]): Buffer {
  return iconv.encode(lines.join('\r\n') + '\r\n', 'cp437')
}

test('S57 B4 happy: "Skriv över"-konflikt uppdaterar kontonamn', async () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sie4-conflict-'))
  const fixturePath = path.join(fixtureDir, 'conflict.se')

  // SIE-filen har 1930 men med NYTT namn, och två balanserade transaktioner
  // MOT KONTON SOM INTE KONFLIKTAR (så skip-varning inte triggas).
  const sieContent = buildSie4([
    '#FLAGGA 0',
    '#PROGRAM "TestApp" "1.0"',
    '#FORMAT PC8',
    '#GEN 20260115 "admin"',
    '#SIETYP 4',
    '#FTYP AB',
    '#ORGNR 556036-0793',
    '#FNAMN "E2E Testföretag AB"',
    '#RAR 0 20260101 20261231',
    '#KPTYP BAS2014',
    '#VALUTA SEK',
    '#KONTO 1930 "Företagskonto"',
    '#KONTO 3002 "Försäljning"',
    // Refererar ENDAST 3002 (nytt konto) — 1930 har 0 refererade entries
    '#VER "A" 1 20260315 "Försäljning"',
    '{',
    '#TRANS 3002 {} 10000',
    '#TRANS 3002 {} -10000',
    '}',
  ])
  fs.writeFileSync(fixturePath, sieContent)

  process.env.E2E_MOCK_OPEN_FILE = fixturePath

  const ctx = await launchAppWithFreshDb()
  try {
    await seedCompanyViaIPC(ctx.window, { orgNumber: '556036-0793' })

    // Verifiera att DB har 1930 med standardnamn "Bank"
    await ctx.window.evaluate(() => {
      location.hash = '#/import'
    })
    await expect(ctx.window.getByTestId('page-import')).toBeVisible({
      timeout: 15_000,
    })

    await ctx.window.getByRole('button', { name: 'Välj fil' }).click()

    const page = ctx.window.getByTestId('page-import')
    await expect(page.getByText('Valideringsresultat')).toBeVisible({
      timeout: 10_000,
    })

    await ctx.window.getByLabel(/Slå samman/).check()

    // Konflikt-sektion ska synas
    await expect(
      ctx.window.getByTestId('sie4-conflicts-section'),
    ).toBeVisible()
    await expect(
      ctx.window.getByTestId('conflict-1930'),
    ).toBeVisible()

    // Välj "Skriv över"
    await ctx.window.getByTestId('conflict-1930-overwrite').check()

    // Klick Importera
    await ctx.window.getByTestId('sie4-import-btn').click()

    // Done
    await expect(
      ctx.window.getByRole('heading', { name: 'Import klar' }),
    ).toBeVisible({ timeout: 15_000 })

    // Assert att 1930 har nytt namn via __testApi (raw DB read via IPC)
    const accountName = await ctx.window.evaluate(async () => {
      const r = await (
        window as unknown as {
          api: { listAllAccounts: (d: unknown) => Promise<{ success: boolean; data?: Array<{ account_number: string; name: string }> }> }
        }
      ).api.listAllAccounts({})
      return r.data?.find((a) => a.account_number === '1930')?.name ?? null
    })
    expect(accountName).toBe('Företagskonto')
  } finally {
    delete process.env.E2E_MOCK_OPEN_FILE
    fs.rmSync(fixtureDir, { recursive: true, force: true })
    await ctx.cleanup()
  }
})
