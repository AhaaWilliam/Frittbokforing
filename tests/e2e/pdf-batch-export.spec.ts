/**
 * S49 — PDF batch-export E2E (F1 vakt).
 *
 * Flow: seed 2 finalized invoices → navigate /income → markera båda →
 * klick "Exportera PDF:er" → dialog bypass skriver till E2E_DOWNLOAD_DIR →
 * verify 2 PDF-filer på disk med non-zero storlek.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'
import { seedCustomer, seedAndFinalizeInvoice } from './helpers/seed'

test('PDF batch export: markera 2 fakturor → 2 PDF:er på disk', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    const { fiscalYearId } = await seedCompanyViaIPC(ctx.window)
    const customerId = await seedCustomer(ctx.window, 'PDF Batch Kund')

    // Seed 2 finalized invoices
    await seedAndFinalizeInvoice(ctx.window, {
      counterpartyId: customerId,
      fiscalYearId,
      invoiceDate: '2026-03-10',
      dueDate: '2026-04-10',
      unitPriceOre: 10000,
    })
    await seedAndFinalizeInvoice(ctx.window, {
      counterpartyId: customerId,
      fiscalYearId,
      invoiceDate: '2026-03-12',
      dueDate: '2026-04-12',
      unitPriceOre: 20000,
    })

    // Navigate to income page
    await ctx.window.evaluate(() => {
      location.hash = '#/income'
    })
    await expect(ctx.window.getByTestId('page-income')).toBeVisible({
      timeout: 15_000,
    })
    await expect(ctx.window.locator('table tbody tr')).toHaveCount(2, {
      timeout: 10_000,
    })

    // Select both rows
    await ctx.window.locator('table thead input[type="checkbox"]').click()
    await expect(ctx.window.getByText('2 valda')).toBeVisible()

    // Count existing PDFs (should be 0)
    const beforePdfs = fs
      .readdirSync(ctx.downloadDir)
      .filter((f) => f.endsWith('.pdf'))
    expect(beforePdfs.length).toBe(0)

    // Click "Exportera PDF:er"
    await ctx.window.getByRole('button', { name: /exportera pdf/i }).click()

    // Wait for success toast
    await expect(ctx.window.getByText(/2 PDF:er exporterade/)).toBeVisible({
      timeout: 30_000,
    })

    // Verify 2 PDFs on disk with non-zero size
    const afterPdfs = fs
      .readdirSync(ctx.downloadDir)
      .filter((f) => f.endsWith('.pdf'))
    expect(afterPdfs.length).toBe(2)
    for (const f of afterPdfs) {
      const stat = fs.statSync(path.join(ctx.downloadDir, f))
      expect(stat.size).toBeGreaterThan(0)
    }
  } finally {
    await ctx.cleanup()
  }
})
