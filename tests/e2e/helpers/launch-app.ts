/**
 * E2E helper: launch Electron app with a fresh temp database.
 *
 * The app creates and migrates the DB itself via getDb().
 * FRITT_DB_PATH env points Electron at a temp file.
 *
 * DB handle contract:
 * - Electron owns the primary read-write handle.
 * - Test code seeds data via IPC calls through the renderer (window.evaluate).
 * - After app.close(), tests may inspect the db file via better-sqlite3
 *   (but only when electron-rebuild hasn't changed the native module ABI).
 */
import { _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { randomUUID } from 'crypto'

const APP_ENTRY = path.join(__dirname, '../../../dist/main/main/index.js')

export interface AppContext {
  app: ElectronApplication
  window: Page
  dbPath: string
  downloadDir: string
  cleanup: () => Promise<void>
}

/**
 * Launch Electron with a fresh temp database.
 * The app runs migrations automatically via getDb().
 * Caller must call cleanup() in afterEach/finally.
 */
export async function launchAppWithFreshDb(): Promise<AppContext> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fritt-e2e-'))
  const dbPath = path.join(tmpDir, `e2e-${randomUUID()}.db`)
  const userDataDir = path.join(tmpDir, 'userData')
  const downloadDir = path.join(tmpDir, 'downloads')
  fs.mkdirSync(userDataDir, { recursive: true })
  fs.mkdirSync(downloadDir, { recursive: true })

  const app = await electron.launch({
    args: [APP_ENTRY],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      FRITT_TEST: '1',
      FRITT_DB_PATH: dbPath,
      E2E_USER_DATA: userDataDir,
      E2E_TESTING: 'true',
      E2E_DOWNLOAD_DIR: downloadDir,
    },
  })

  const window = await app.firstWindow({ timeout: 30_000 })

  const cleanup = async () => {
    try { await app.close() } catch { /* already closed */ }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* best effort */ }
  }

  return { app, window, dbPath, downloadDir, cleanup }
}

/**
 * Seed a company with FY + periods via IPC (runs in renderer→main process).
 * Returns { companyId, fiscalYearId }.
 */
export async function seedCompanyViaIPC(
  window: Page,
  overrides?: Partial<{
    name: string
    orgNumber: string
    fiscalRule: 'K2' | 'K3'
    startDate: string
    endDate: string
  }>,
): Promise<{ companyId: number; fiscalYearId: number }> {
  const input = {
    name: overrides?.name ?? 'E2E Testföretag AB',
    org_number: overrides?.orgNumber ?? '556036-0793',
    fiscal_rule: overrides?.fiscalRule ?? 'K2',
    share_capital: 2500000,
    registration_date: '2020-01-15',
    fiscal_year_start: overrides?.startDate ?? '2026-01-01',
    fiscal_year_end: overrides?.endDate ?? '2026-12-31',
  }

  // Step 1: Create company via IPC
  const companyResult = await window.evaluate(async (data) => {
    return await (window as unknown as { api: { createCompany: (d: unknown) => Promise<unknown> } }).api.createCompany(data)
  }, input)

  const cr = companyResult as { success: boolean; data: { id: number }; error?: string }
  if (!cr.success) throw new Error(`seedCompanyViaIPC createCompany failed: ${cr.error}`)

  // Step 2: Get fiscal years via IPC (returns FiscalYear[] directly, not IpcResult)
  const fyResult = await window.evaluate(async () => {
    return await (window as unknown as { api: { listFiscalYears: () => Promise<unknown> } }).api.listFiscalYears()
  })

  const fys = fyResult as Array<{ id: number }>
  if (!fys || fys.length === 0) throw new Error('seedCompanyViaIPC: no fiscal years found')

  return {
    companyId: cr.data.id,
    fiscalYearId: fys[0].id,
  }
}
