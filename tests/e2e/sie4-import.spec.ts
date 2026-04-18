/**
 * S49 — SIE4 import E2E (F5 vakt).
 *
 * Happy-path: seed matching company → write fixture SIE4 → set E2E_MOCK_OPEN_FILE →
 * navigate to PageImport → select file → choose 'merge' strategy → import →
 * verify journal entries landed via __testApi.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import * as iconv from 'iconv-lite'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'
import { getJournalEntries } from './helpers/assertions'

function buildSie4(lines: string[]): Buffer {
  return iconv.encode(lines.join('\r\n') + '\r\n', 'cp437')
}

test('SIE4 import (merge strategy): creates accounts and entries', async () => {
  // Write fixture to a known location before launching app
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sie4-fixture-'))
  const fixturePath = path.join(fixtureDir, 'test-import.se')
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
    '#KONTO 1930 "Bank"',
    '#KONTO 3001 "Försäljning 25%"',
    '#KONTO 2610 "Utgående moms 25%"',
    '#VER "A" 1 20260315 "Import test faktura"',
    '{',
    '#TRANS 1930 {} 12500',
    '#TRANS 3001 {} -10000',
    '#TRANS 2610 {} -2500',
    '}',
  ])
  fs.writeFileSync(fixturePath, sieContent)

  // Set env BEFORE launching the app — the helper forwards process.env.
  process.env.E2E_MOCK_OPEN_FILE = fixturePath

  const ctx = await launchAppWithFreshDb()
  try {
    // Seed a matching company so 'merge' strategy has something to merge into.
    // Default fixture FY (2026-01-01 → 2026-12-31) matches seedCompanyViaIPC defaults.
    const { fiscalYearId } = await seedCompanyViaIPC(ctx.window, {
      orgNumber: '556036-0793',
    })

    // Navigate to import page
    await ctx.window.evaluate(() => {
      location.hash = '#/import'
    })
    await expect(ctx.window.getByTestId('page-import')).toBeVisible({
      timeout: 15_000,
    })

    // Click "Välj fil" — handler reads E2E_MOCK_OPEN_FILE
    await ctx.window.getByRole('button', { name: 'Välj fil' }).click()

    // Preview phase appears — scope to page content to avoid sidebar collision
    const page = ctx.window.getByTestId('page-import')
    await expect(page.getByText('Valideringsresultat')).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByText('Filen är giltig')).toBeVisible()
    await expect(page.getByText('E2E Testföretag AB')).toBeVisible()

    // Choose merge strategy
    await ctx.window.getByLabel(/Slå samman/).check()

    // Click Importera
    await ctx.window.getByRole('button', { name: 'Importera' }).click()

    // Done phase — scope to heading (toast has same text)
    await expect(
      ctx.window.getByRole('heading', { name: 'Import klar' }),
    ).toBeVisible({ timeout: 15_000 })

    // Verify journal entries landed
    const { entries } = await getJournalEntries(ctx.window, fiscalYearId)
    // Merge creates a new "I" series (imported)
    const importedEntries = entries.filter((e) => e.verification_series === 'I')
    expect(importedEntries.length).toBe(1)
  } finally {
    delete process.env.E2E_MOCK_OPEN_FILE
    fs.rmSync(fixtureDir, { recursive: true, force: true })
    await ctx.cleanup()
  }
})
