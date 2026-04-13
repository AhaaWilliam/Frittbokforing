/**
 * Mock för window.api. Validerar input mot channelMap innan svar returneras.
 *
 * Kanaler utan schema-validering (anropas direkt utan channelMap-uppslag):
 *   - db:health-check          (inga args)
 *   - company:get              (inga args)
 *   - fiscal-year:list         (inga args)
 *   - opening-balance:re-transfer  (inga args)
 *   - backup:create            (inga args)
 *   - settings:get             (raw string key)
 *   - settings:set             (raw key + value)
 *
 * __testApi-kanaler mockas inte — de ligger på window.__testApi och
 * används bara när FRITT_TEST=1.
 */
import { vi, afterEach } from 'vitest'
import { channelMap, type ChannelName } from '../../src/shared/ipc-schemas'

// ── No-schema channels ────────────────────────────────────────────────
const NO_SCHEMA_CHANNELS = [
  'db:health-check',
  'company:get',
  'fiscal-year:list',
  'opening-balance:re-transfer',
  'backup:create',
  'settings:get',
  'settings:set',
] as const

type NoSchemaChannel = (typeof NO_SCHEMA_CHANNELS)[number]

const noSchemaSet = new Set<string>(NO_SCHEMA_CHANNELS)

// ── Method → channel mapping (mirrors src/main/preload.ts) ───────────
const methodToChannel: Record<string, ChannelName | NoSchemaChannel> = {
  // Health
  healthCheck: 'db:health-check',
  // Company
  createCompany: 'company:create',
  getCompany: 'company:get',
  updateCompany: 'company:update',
  // Fiscal Years
  listFiscalYears: 'fiscal-year:list',
  createNewFiscalYear: 'fiscal-year:create-new',
  switchFiscalYear: 'fiscal-year:switch',
  // Opening Balance
  reTransferOpeningBalance: 'opening-balance:re-transfer',
  getNetResult: 'opening-balance:net-result',
  // Fiscal Periods
  listFiscalPeriods: 'fiscal-period:list',
  closePeriod: 'fiscal-period:close',
  reopenPeriod: 'fiscal-period:reopen',
  // Counterparties
  listCounterparties: 'counterparty:list',
  getCounterparty: 'counterparty:get',
  createCounterparty: 'counterparty:create',
  updateCounterparty: 'counterparty:update',
  deactivateCounterparty: 'counterparty:deactivate',
  // Products
  listProducts: 'product:list',
  getProduct: 'product:get',
  createProduct: 'product:create',
  updateProduct: 'product:update',
  deactivateProduct: 'product:deactivate',
  setCustomerPrice: 'product:set-customer-price',
  removeCustomerPrice: 'product:remove-customer-price',
  getPriceForCustomer: 'product:get-price-for-customer',
  // VAT & Accounts
  listVatCodes: 'vat-code:list',
  listAccounts: 'account:list',
  listAllAccounts: 'account:list-all',
  accountCreate: 'account:create',
  accountUpdate: 'account:update',
  accountToggleActive: 'account:toggle-active',
  // Backup
  backupCreate: 'backup:create',
  // Invoices
  saveDraft: 'invoice:save-draft',
  getDraft: 'invoice:get-draft',
  updateDraft: 'invoice:update-draft',
  deleteDraft: 'invoice:delete-draft',
  listDrafts: 'invoice:list-drafts',
  nextInvoiceNumber: 'invoice:next-number',
  listInvoices: 'invoice:list',
  finalizeInvoice: 'invoice:finalize',
  updateSentInvoice: 'invoice:update-sent',
  payInvoice: 'invoice:pay',
  payInvoicesBulk: 'invoice:payBulk',
  getPayments: 'invoice:payments',
  generateInvoicePdf: 'invoice:generate-pdf',
  saveInvoicePdf: 'invoice:save-pdf',
  // Expenses
  saveExpenseDraft: 'expense:save-draft',
  getExpenseDraft: 'expense:get-draft',
  updateExpenseDraft: 'expense:update-draft',
  deleteExpenseDraft: 'expense:delete-draft',
  listExpenseDrafts: 'expense:list-drafts',
  finalizeExpense: 'expense:finalize',
  payExpense: 'expense:pay',
  payExpensesBulk: 'expense:payBulk',
  getExpensePayments: 'expense:payments',
  getExpense: 'expense:get',
  listExpenses: 'expense:list',
  // Manual Entries
  saveManualEntryDraft: 'manual-entry:save-draft',
  getManualEntry: 'manual-entry:get',
  updateManualEntryDraft: 'manual-entry:update-draft',
  deleteManualEntryDraft: 'manual-entry:delete-draft',
  listManualEntryDrafts: 'manual-entry:list-drafts',
  listManualEntries: 'manual-entry:list',
  finalizeManualEntry: 'manual-entry:finalize',
  // Dashboard & Reports
  getDashboardSummary: 'dashboard:summary',
  getVatReport: 'vat:report',
  getTaxForecast: 'tax:forecast',
  getIncomeStatement: 'report:income-statement',
  getBalanceSheet: 'report:balance-sheet',
  // Exports
  exportSie5: 'export:sie5',
  exportSie4: 'export:sie4',
  exportExcel: 'export:excel',
  exportWriteFile: 'export:write-file',
  // Settings
  getSetting: 'settings:get',
  setSetting: 'settings:set',
}

// ── Override storage ──────────────────────────────────────────────────

interface ResponseOverride {
  type: 'response'
  value: unknown
}
interface PendingOverride {
  type: 'pending'
}
interface DelayedOverride {
  type: 'delayed'
  value: unknown
  delayMs: number
}
type Override = ResponseOverride | PendingOverride | DelayedOverride

let overrides = new Map<string, Override>()

// ── Default response ─────────────────────────────────────────────────

const DEFAULT_RESPONSE = { success: true as const, data: null }

// ── Build mock API object ────────────────────────────────────────────

function createMockApi(): Record<string, ReturnType<typeof vi.fn>> {
  const api: Record<string, ReturnType<typeof vi.fn>> = {}

  for (const [method, channel] of Object.entries(methodToChannel)) {
    api[method] = vi.fn((...args: unknown[]): Promise<unknown> => {
      // Validate input against schema for schema-protected channels
      if (channel in channelMap) {
        const schema = channelMap[channel as ChannelName]
        const input = args[0]
        const parseResult = schema.safeParse(input)
        if (!parseResult.success) {
          return Promise.reject(
            new Error(
              `Mock-IPC: input violates schema for channel '${channel}': ${parseResult.error.message}`,
            ),
          )
        }
      } else if (!noSchemaSet.has(channel)) {
        return Promise.reject(
          new Error(`Mock-IPC: unknown channel '${channel}'`),
        )
      }

      // Check per-channel override
      const override = overrides.get(channel)
      if (override) {
        switch (override.type) {
          case 'response':
            return Promise.resolve(override.value)
          case 'pending':
            return new Promise(() => {}) // Never resolves
          case 'delayed':
            return new Promise((resolve) =>
              setTimeout(() => resolve(override.value), override.delayMs),
            )
        }
      }

      return Promise.resolve(DEFAULT_RESPONSE)
    })
  }

  return api
}

// ── Public API ────────────────────────────────────────────────────────

let afterEachRegistered = false

/**
 * Set up window.api mock. Call in beforeEach or beforeAll.
 * Registers afterEach cleanup automatically (once per file).
 */
export function setupMockIpc(): void {
  ;(window as Record<string, unknown>).api = createMockApi()

  if (!afterEachRegistered) {
    afterEach(() => resetMockIpc())
    afterEachRegistered = true
  }
}

/** Override response for a specific channel. */
export function mockIpcResponse(channel: string, response: unknown): void {
  overrides.set(channel, { type: 'response', value: response })
}

/** Make a channel return a promise that never resolves (loading state). */
export function mockIpcPending(channel: string): void {
  overrides.set(channel, { type: 'pending' })
}

/** Make a channel return a response after a delay. */
export function mockIpcDelayed(
  channel: string,
  response: unknown,
  delayMs: number,
): void {
  overrides.set(channel, { type: 'delayed', value: response, delayMs })
}

/** Reset all overrides and recreate mock API. */
export function resetMockIpc(): void {
  overrides.clear()
  ;(window as Record<string, unknown>).api = createMockApi()
}
