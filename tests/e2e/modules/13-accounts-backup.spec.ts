/**
 * 13 — Kontoplan + Backup: list accounts, create backup via dialog-bypass.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import { launchAppWithFreshDb } from '../helpers/launch-app'
import { composeEmptyK2 } from '../fixtures/compose'

test.describe('Kontoplan + Backup', () => {
  test('kontoplan listas via IPC och page-accounts renderar', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({
        timeout: 15_000,
      })
      await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({
        timeout: 15_000,
      })

      const result = await ctx.window.evaluate(async () => {
        return (
          window as unknown as {
            api: { listAllAccounts: (d: unknown) => Promise<unknown> }
          }
        ).api.listAllAccounts({})
      })
      const r = result as {
        success: boolean
        data: Array<{ account_number: string }>
      }
      expect(r.success).toBe(true)
      expect(r.data.length).toBeGreaterThan(50)

      await ctx.window.evaluate(() => {
        location.hash = '#/accounts'
      })
      await expect(ctx.window.getByTestId('page-accounts')).toBeVisible({
        timeout: 10_000,
      })
    } finally {
      await ctx.cleanup()
    }
  })

  test('backup via dialog-bypass skapar .db-fil i downloadDir', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({
        timeout: 15_000,
      })
      await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({
        timeout: 15_000,
      })

      const result = await ctx.window.evaluate(async () => {
        return (
          window as unknown as { api: { backupCreate: () => Promise<unknown> } }
        ).api.backupCreate()
      })
      const r = result as {
        success: boolean
        data?: { filePath: string | null }
        error?: string
      }
      // Backup kan returnera antingen IpcResult-wrapper eller raw
      if (r.success !== undefined) {
        expect(r.success).toBe(true)
      }

      const files = fs.readdirSync(ctx.downloadDir)
      const dbBackup = files.find((f) => f.endsWith('.db'))
      expect(dbBackup).toBeDefined()
    } finally {
      await ctx.cleanup()
    }
  })
})
