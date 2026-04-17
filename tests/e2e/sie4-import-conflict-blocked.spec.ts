/**
 * Sprint 57 B4 negative — V6 invariant-blockad.
 *
 * Seed company med 1930 → SIE-fil med 1930 + verifikat som refererar 1930
 * → preview visar konflikt → välj "Skippa" → assert Importera-knappen
 * disabled, varningstext synlig.
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

test('S57 B4 negative: skip på used-account → Importera disabled', async () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sie4-blocked-'))
  const fixturePath = path.join(fixtureDir, 'blocked.se')

  // SIE-filen har 1930 med nytt namn (DB-default är "Företagskonto") OCH
  // refererar 1930 i ett verifikat
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
    '#KONTO 1930 "Bankkonto"',
    '#KONTO 3001 "Försäljning 25%"',
    '#KONTO 2610 "Utgående moms 25%"',
    '#VER "A" 1 20260315 "Försäljning"',
    '{',
    '#TRANS 1930 {} 12500',
    '#TRANS 3001 {} -10000',
    '#TRANS 2610 {} -2500',
    '}',
  ])
  fs.writeFileSync(fixturePath, sieContent)

  process.env.E2E_MOCK_OPEN_FILE = fixturePath

  const ctx = await launchAppWithFreshDb()
  try {
    await seedCompanyViaIPC(ctx.window, { orgNumber: '556036-0793' })

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
    await expect(ctx.window.getByTestId('conflict-1930')).toBeVisible()

    // Välj "Skippa"
    await ctx.window.getByTestId('conflict-1930-skip').check()

    // Varningstext + Importera disabled
    await expect(
      ctx.window.getByTestId('conflict-1930-invalid-skip'),
    ).toBeVisible()
    await expect(ctx.window.getByTestId('sie4-import-btn')).toBeDisabled()
  } finally {
    delete process.env.E2E_MOCK_OPEN_FILE
    fs.rmSync(fixtureDir, { recursive: true, force: true })
    await ctx.cleanup()
  }
})
