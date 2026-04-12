/**
 * S51 — Full bokföringscykel E2E (ett test).
 *
 * Happy-path genom full stack:
 * 1. Onboarding via UI — Åkerlund & Öberg AB (testar CP437 + SIE-escape)
 * 2. Seed kund + produkt + faktura via IPC (proven i S50)
 * 3. UI: registrera betalning → A2-verifikat
 * 4. UI: skapa manuell C-entry (6110 debit / 1930 credit, 500 kr)
 * 5. Verify A1 + C-series via __testApi
 * 6. UI: exportera SIE4
 * 7. Läs SIE4-fil, verifiera #FNAMN med CP437-dekodning
 *
 * Värdet: ett grönt test bevisar hela stacken fungerar.
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb } from './helpers/launch-app'
import { seedCustomer, seedAndFinalizeInvoice } from './helpers/seed'
import { getJournalEntries } from './helpers/assertions'
import * as iconv from 'iconv-lite'
import fs from 'fs'
import path from 'path'

test('Full bokföringscykel: onboarding → faktura → betalning → manuell entry → SIE4-export', async () => {
  const { window, downloadDir, cleanup } = await launchAppWithFreshDb()
  try {
    // ── 1. Onboarding via UI ───────────────────────────────────────
    await expect(window.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })

    // Step 1: Company details — Åkerlund & Öberg AB tests CP437 and SIE-escape
    await window.getByPlaceholder('AB Företaget').fill('Åkerlund & Öberg AB')
    await window.getByPlaceholder('NNNNNN-NNNN').fill('556036-0793')
    // Share capital defaults to 25000 — OK
    // Registration date
    await window.locator('input[type="date"]').fill('2020-01-15')
    // K2 is default
    await window.getByText('Nästa').click()

    // Step 2: Fiscal Year — defaults to calendar year
    await window.getByText('Nästa').click()

    // Step 3: Confirm + submit
    await expect(window.getByText('Sammanfattning')).toBeVisible({ timeout: 5_000 })
    await window.getByText('Starta bokföringen').click()

    // Wait for app shell
    await expect(window.getByTestId('app-ready')).toBeVisible({ timeout: 15_000 })

    // ── 2. Seed kund + faktura via IPC (proven approach from S50) ──
    const customerId = await seedCustomer(window, 'Testkund Fullcykel')

    // Get FY id
    const fyList = await window.evaluate(async () => {
      return await (window as unknown as { api: { listFiscalYears: () => Promise<unknown> } }).api.listFiscalYears()
    }) as Array<{ id: number }>
    const fyId = fyList[0].id

    // Seed and finalize invoice (1 line, 125 kr, 25% VAT)
    const { invoiceId } = await seedAndFinalizeInvoice(window, {
      counterpartyId: customerId,
      fiscalYearId: fyId,
      invoiceDate: '2020-06-15',
      dueDate: '2020-07-15',
      unitPriceOre: 12500,
      quantity: 2,
    })

    // ── 3. UI: registrera betalning ────────────────────────────────
    // Navigate to invoices
    await window.evaluate(() => { window.location.hash = '#/income' })
    await expect(window.getByTestId('page-income')).toBeVisible({ timeout: 10_000 })
    await expect(window.locator('table tbody tr')).toHaveCount(1, { timeout: 10_000 })

    // Verify A1 appears
    await expect(window.getByText('A1')).toBeVisible()

    // Click "Betala" action button in the row (action column, stopPropagation)
    await window.locator('table tbody tr').first().locator('button[title="Registrera betalning"]').click()

    // Payment dialog opens
    const payDialog = window.locator('.fixed.inset-0').last()
    await expect(payDialog).toBeVisible({ timeout: 5_000 })

    // Submit (amount pre-filled with full remaining)
    const submitPayBtn = payDialog.locator('button').filter({ hasText: /Registrera/i })
    await submitPayBtn.click()

    // Wait for toast/success
    await window.waitForTimeout(1000)

    // ── 4. UI: skapa manuell C-entry ───────────────────────────────
    await window.evaluate(() => { window.location.hash = '#/manual-entries/create' })
    await expect(window.getByTestId('page-manual-entries')).toBeVisible({ timeout: 10_000 })

    // Date
    await window.locator('input[type="date"]').first().fill('2020-06-20')

    // Description
    await window.getByPlaceholder('T.ex. Periodisering hyra').fill('Kontorshyra juni')

    // Line 1: account 6110, debit 500
    const accountInputs = window.locator('input[placeholder="1910"]')
    await accountInputs.first().fill('6110')

    // Debit/credit inputs are placeholder="0"
    const zeroInputs = window.locator('input[placeholder="0"]')
    // Line 1: debit is first "0" input, credit is second
    await zeroInputs.nth(0).fill('500')

    // Add second line
    await window.getByText('+ Lägg till rad').click()
    await window.waitForTimeout(200)

    // Line 2: account 1930, credit 500
    const accountInputs2 = window.locator('input[placeholder="1910"]')
    await accountInputs2.nth(1).fill('1930')

    const zeroInputs2 = window.locator('input[placeholder="0"]')
    // Line 2: debit is nth(2), credit is nth(3)
    await zeroInputs2.nth(3).fill('500')

    // Click "Bokför" button (use role to avoid nav/heading matches)
    const bookBtn = window.getByRole('button', { name: 'Bokför' })
    await expect(bookBtn).toBeEnabled({ timeout: 3_000 })
    await bookBtn.click()

    // Wait for confirmation/success
    await window.waitForTimeout(1000)

    // ── 5. Verify verifications via __testApi ──────────────────────
    const { entries } = await getJournalEntries(window, fyId)
    const bookedEntries = entries.filter(e => e.status === 'booked')
    const series = bookedEntries.map(e => `${e.verification_series}${e.verification_number}`)

    expect(series).toContain('A1') // invoice booking
    // Check for C-series entry
    const cEntries = bookedEntries.filter(e => e.verification_series === 'C')
    expect(cEntries.length).toBeGreaterThanOrEqual(1)

    // ── 6. UI: exportera SIE4 ──────────────────────────────────────
    await window.evaluate(() => { window.location.hash = '#/export' })
    await expect(window.getByTestId('page-export')).toBeVisible({ timeout: 10_000 })

    await window.getByText('Exportera SIE4').click()

    // Wait for export success (file saved via E2E bypass to downloadDir)
    await window.waitForTimeout(2000)

    // ── 7. Read and verify SIE4 file ───────────────────────────────
    const files = fs.readdirSync(downloadDir)
    const sie4File = files.find(f => f.endsWith('.se'))
    expect(sie4File).toBeDefined()

    const sie4Buffer = fs.readFileSync(path.join(downloadDir, sie4File!))
    const sie4Content = iconv.decode(Buffer.from(sie4Buffer), 'cp437')

    // #FNAMN must contain correctly decoded company name
    const fnamLine = sie4Content.split('\n').find(l => l.startsWith('#FNAMN'))
    expect(fnamLine).toBeDefined()
    expect(fnamLine).toContain('Åkerlund & Öberg AB')

    // Verify we have #VER records
    expect(sie4Content).toContain('#VER')

    // Verify C-series verification exists in SIE4
    expect(sie4Content).toContain('#VER "C"')

  } finally {
    await cleanup()
  }
})
