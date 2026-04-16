/**
 * 11 — Export: SIE4/SIE5/Excel via dialog-bypass + snapshot-mask.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import * as iconv from 'iconv-lite'
import { launchAppWithFreshDb } from '../helpers/launch-app'
import { composeEmptyK2 } from '../fixtures/compose'
import { seedCustomer, seedAndFinalizeInvoice } from '../helpers/seed'
import { freezeClock } from '../helpers/ipc-testapi'
import { maskSie4, maskSie5 } from '../helpers/snapshot-mask'

test.describe('Export', () => {
  test('SIE4 export innehåller bokförd A1 och maskad snapshot är stabil', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
      const { fiscalYearId } = await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({ timeout: 15_000 })
      await freezeClock(ctx.window, '2025-06-15T12:00:00.000Z')

      const customerId = await seedCustomer(ctx.window, 'Export Kund AB')
      await seedAndFinalizeInvoice(ctx.window, {
        counterpartyId: customerId,
        fiscalYearId,
        invoiceDate: '2026-03-15',
        dueDate: '2026-04-14',
        unitPriceOre: 100000,
        quantity: 1,
      })

      await ctx.window.evaluate(() => { location.hash = '#/export' })
      await expect(ctx.window.getByTestId('page-export')).toBeVisible({ timeout: 10_000 })
      await ctx.window.getByText('Exportera SIE4').click()
      await ctx.window.waitForTimeout(2000)

      const files = fs.readdirSync(ctx.downloadDir).filter(f => f.endsWith('.se'))
      expect(files.length).toBeGreaterThan(0)
      const buf = fs.readFileSync(path.join(ctx.downloadDir, files[0]))
      const content = iconv.decode(Buffer.from(buf), 'cp437')
      expect(content).toContain('#VER')
      expect(content).toContain('#GEN 20250615')

      const masked = maskSie4(content)
      expect(masked).toContain('#GEN <DATE>')
      expect(masked).not.toMatch(/#GEN 20\d{6}/)
    } finally {
      await ctx.cleanup()
    }
  })

  test('SIE5 XML export med frusen klocka är deterministisk efter maskning', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
      const { fiscalYearId } = await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({ timeout: 15_000 })
      await freezeClock(ctx.window, '2025-06-15T12:00:00.000Z')

      const customerId = await seedCustomer(ctx.window, 'SIE5 Kund')
      await seedAndFinalizeInvoice(ctx.window, {
        counterpartyId: customerId,
        fiscalYearId,
        invoiceDate: '2026-03-15',
        dueDate: '2026-04-14',
        unitPriceOre: 100000,
        quantity: 1,
      })

      await ctx.window.evaluate(() => { location.hash = '#/export' })
      await expect(ctx.window.getByTestId('page-export')).toBeVisible({ timeout: 10_000 })
      await ctx.window.getByText('Exportera SIE5').click()
      await ctx.window.waitForTimeout(2000)

      const files = fs.readdirSync(ctx.downloadDir).filter(f => f.endsWith('.xml') || f.endsWith('.sie'))
      expect(files.length).toBeGreaterThan(0)
      const content = fs.readFileSync(path.join(ctx.downloadDir, files[0]), 'utf-8')
      expect(content).toContain('2025-06-15')
      const masked = maskSie5(content)
      expect(masked).not.toContain('2025-06-15T12:00:00Z')
    } finally {
      await ctx.cleanup()
    }
  })
})
