import { ipcMain, app, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDb, getDbPath, getTableCount } from './db'
import {
  createCompany,
  getCompany,
  updateCompany,
} from './services/company-service'
import {
  listFiscalYears,
  listFiscalPeriods,
  closePeriod,
  reopenPeriod,
  createNewFiscalYear,
} from './services/fiscal-service'
import {
  calculateNetResult,
  reTransferOpeningBalance,
} from './services/opening-balance-service'
import {
  listCounterparties,
  getCounterparty,
  createCounterparty,
  updateCounterparty,
  deactivateCounterparty,
} from './services/counterparty-service'
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deactivateProduct,
  setCustomerPrice,
  removeCustomerPrice,
  getPriceForCustomer,
} from './services/product-service'
import {
  saveDraft,
  getDraft,
  updateDraft,
  deleteDraft,
  listDrafts,
  nextInvoiceNumber,
  finalizeDraft,
  updateSentInvoice,
  listInvoices,
  ensureInvoiceIndexes,
  refreshInvoiceStatuses,
  payInvoice,
  payInvoicesBulk,
  getPayments,
  createCreditNoteDraft,
} from './services/invoice-service'
import {
  saveExpenseDraft,
  getExpenseDraft,
  updateExpenseDraft,
  deleteExpenseDraft,
  listExpenseDrafts,
  finalizeExpense,
  payExpense,
  payExpensesBulk,
  getExpensePayments,
  getExpense,
  refreshExpenseStatuses,
  ensureExpenseIndexes,
  listExpenses,
  createExpenseCreditNoteDraft,
} from './services/expense-service'
import { getDashboardSummary } from './services/dashboard-service'
import { getTaxForecast } from './services/tax-service'
import { getVatReport } from './services/vat-report-service'
import { exportSie5 } from './services/sie5/sie5-export-service'
import {
  saveManualEntryDraft,
  getManualEntry,
  updateManualEntryDraft,
  deleteManualEntryDraft,
  listManualEntryDrafts,
  listManualEntries,
  finalizeManualEntry,
} from './services/manual-entry-service'
import { exportSie4 } from './services/sie4/sie4-export-service'
import { exportExcel } from './services/excel/excel-export-service'
import {
  getIncomeStatement,
  getBalanceSheet,
} from './services/report/report-service'
import { generateInvoicePdf } from './services/pdf/invoice-pdf-service'
import { listVatCodes } from './services/vat-service'
import {
  listAccounts,
  listAllAccounts,
  createAccount,
  updateAccount,
  toggleAccountActive,
} from './services/account-service'
import { createBackup } from './services/backup-service'
import { getE2EFilePath } from './utils/e2e-helpers'
import {
  FiscalPeriodListInputSchema,
  PeriodActionInputSchema,
  CounterpartyListInputSchema,
  CounterpartyIdSchema,
  ProductListInputSchema,
  ProductIdSchema,
  SetCustomerPriceInputSchema,
  RemoveCustomerPriceInputSchema,
  GetPriceForCustomerInputSchema,
  VatCodeListInputSchema,
  InvoiceListInputSchema,
  PayInvoiceInputSchema,
  DashboardSummaryInputSchema,
  TaxForecastInputSchema,
  VatReportInputSchema,
  ExpenseIdSchema,
  ListExpenseDraftsSchema,
  FinalizeExpenseSchema,
  PayExpenseInputSchema,
  GetExpensePaymentsSchema,
  GetExpenseSchema,
  ListExpensesSchema,
  ReportRequestSchema,
  ExportWriteFileRequestSchema,
  GetPaymentsInputSchema,
  InvoiceIdSchema,
  DraftListInputSchema,
  NextNumberInputSchema,
  FinalizeInvoiceInputSchema,
  UpdateSentInvoiceInputSchema,
  AccountListInputSchema,
  AccountListAllInputSchema,
  AccountCreateInputSchema,
  AccountUpdateInputSchema,
  AccountToggleActiveInputSchema,
  ExportSie5Schema,
  ExportSie4Schema,
  ExportExcelSchema,
  SaveManualEntryDraftSchema,
  UpdateManualEntryDraftSchema,
  ManualEntryIdSchema,
  ManualEntryFinalizeSchema,
  ManualEntryListSchema,
  FiscalYearCreateNewInputSchema,
  FiscalYearSwitchInputSchema,
  NetResultInputSchema,
  GenerateInvoicePdfSchema,
  SaveInvoicePdfSchema,
  PayInvoicesBulkPayloadSchema,
  PayExpensesBulkPayloadSchema,
  CreateCreditNoteDraftSchema,
  CreateExpenseCreditNoteDraftSchema,
} from './ipc-schemas'
import type { HealthCheckResponse, IpcResult } from '../shared/types'
import log from 'electron-log'
import { wrapIpcHandler } from './ipc/wrap-ipc-handler'

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'fritt-settings.json')
}

function loadSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(getSettingsPath(), 'utf-8'))
  } catch {
    return {}
  }
}

function saveSettings(data: Record<string, unknown>): void {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(data, null, 2))
}

export function registerIpcHandlers(): void {
  const db = getDb()

  // Startup: ensure indexes and refresh overdue statuses
  ensureInvoiceIndexes(db)
  refreshInvoiceStatuses(db)
  ensureExpenseIndexes(db)
  refreshExpenseStatuses(db)

  ipcMain.handle('db:health-check', (): HealthCheckResponse => {
    try {
      const version = db.pragma('user_version', { simple: true }) as number
      const tableCount = getTableCount(db)
      return { ok: true, path: getDbPath(), schemaVersion: version, tableCount }
    } catch (err) {
      log.error('db:health-check failed:', err)
      return { ok: false, path: '', schemaVersion: 0, tableCount: 0 }
    }
  })

  // === Company ===
  ipcMain.handle('company:create', (_event, input: unknown) =>
    createCompany(db, input),
  )
  ipcMain.handle('company:get', () => getCompany(db))
  ipcMain.handle('company:update', (_event, input: unknown) =>
    updateCompany(db, input),
  )

  // === Fiscal Years ===
  ipcMain.handle('fiscal-year:list', () => listFiscalYears(db))

  // === Fiscal Periods ===
  ipcMain.handle('fiscal-period:list', (_event, input: unknown) => {
    const parsed = FiscalPeriodListInputSchema.safeParse(input)
    if (!parsed.success) return []
    return listFiscalPeriods(db, parsed.data.fiscal_year_id)
  })

  ipcMain.handle('fiscal-period:close', (_event, input: unknown) => {
    const parsed = PeriodActionInputSchema.safeParse(input)
    if (!parsed.success) {
      log.warn('[fiscal-period:close] Validation error:', parsed.error.issues)
      return {
        success: false,
        error: 'Ogiltigt period-id.',
        code: 'VALIDATION_ERROR' as const,
      }
    }
    return closePeriod(db, parsed.data.period_id)
  })

  ipcMain.handle('fiscal-period:reopen', (_event, input: unknown) => {
    const parsed = PeriodActionInputSchema.safeParse(input)
    if (!parsed.success) {
      log.warn('[fiscal-period:reopen] Validation error:', parsed.error.issues)
      return {
        success: false,
        error: 'Ogiltigt period-id.',
        code: 'VALIDATION_ERROR' as const,
      }
    }
    return reopenPeriod(db, parsed.data.period_id)
  })

  // === Fiscal Year Create / Switch / Net Result ===
  ipcMain.handle('fiscal-year:create-new', (_event, input: unknown) => {
    const parsed = FiscalYearCreateNewInputSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: 'Ogiltiga parametrar.',
        code: 'VALIDATION_ERROR' as const,
      }
    try {
      const settings = loadSettings()
      const activeFyId = settings.last_fiscal_year_id as number | undefined
      if (!activeFyId)
        return {
          success: false,
          error: 'Inget aktivt räkenskapsår.',
          code: 'VALIDATION_ERROR' as const,
        }

      const company = db.prepare('SELECT id FROM companies LIMIT 1').get() as
        | { id: number }
        | undefined
      if (!company)
        return {
          success: false,
          error: 'Inget företag hittat.',
          code: 'VALIDATION_ERROR' as const,
        }

      const result = createNewFiscalYear(db, company.id, activeFyId, {
        confirmBookResult: parsed.data.confirmBookResult ?? false,
        netResultOre: parsed.data.netResultOre ?? 0,
      })

      // F2-fix: closeFiscalYear sker nu atomärt INI createNewFiscalYear-transaktionen.

      // Update settings to new FY
      settings.last_fiscal_year_id = result.fiscalYear.id
      saveSettings(settings)

      return { success: true, data: result }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err) {
        const e = err as { code: string; error: string; field?: string }
        return { success: false, error: e.error, code: e.code, field: e.field }
      }
      return {
        success: false,
        error:
          err instanceof Error ? err.message : 'Kunde inte skapa räkenskapsår.',
        code: 'UNEXPECTED_ERROR' as const,
      }
    }
  })

  ipcMain.handle('fiscal-year:switch', (_event, input: unknown) => {
    const parsed = FiscalYearSwitchInputSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: 'Ogiltigt FY-id.',
        code: 'VALIDATION_ERROR' as const,
      }
    const fy = db
      .prepare('SELECT * FROM fiscal_years WHERE id = ?')
      .get(parsed.data.fiscalYearId) as
      | import('../shared/types').FiscalYear
      | undefined
    if (!fy)
      return {
        success: false,
        error: 'Räkenskapsår hittades inte.',
        code: 'NOT_FOUND' as const,
      }
    const settings = loadSettings()
    settings.last_fiscal_year_id = fy.id
    saveSettings(settings)
    return { success: true, data: fy }
  })

  ipcMain.handle('opening-balance:re-transfer', () => {
    try {
      const settings = loadSettings()
      const activeFyId = settings.last_fiscal_year_id as number | undefined
      if (!activeFyId)
        return {
          success: false,
          error: 'Inget aktivt räkenskapsår.',
          code: 'VALIDATION_ERROR' as const,
        }
      const result = reTransferOpeningBalance(db, activeFyId)
      return { success: true, data: result }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err) {
        const e = err as { code: string; error: string; field?: string }
        return { success: false, error: e.error, code: e.code, field: e.field }
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Kunde inte uppdatera IB.',
        code: 'UNEXPECTED_ERROR' as const,
      }
    }
  })

  ipcMain.handle('opening-balance:net-result', (_event, input: unknown) => {
    const parsed = NetResultInputSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: 'Ogiltigt FY-id.',
        code: 'VALIDATION_ERROR' as const,
      }
    const netResultOre = calculateNetResult(db, parsed.data.fiscalYearId)
    return {
      success: true,
      data: {
        netResultOre,
        isAlreadyBooked: netResultOre === 0,
      },
    }
  })

  // === Counterparties ===
  ipcMain.handle('counterparty:list', (_event, input: unknown) => {
    const parsed = CounterpartyListInputSchema.safeParse(input ?? {})
    if (!parsed.success) return []
    return listCounterparties(db, parsed.data)
  })

  ipcMain.handle('counterparty:get', (_event, input: unknown) => {
    const parsed = CounterpartyIdSchema.safeParse(input)
    if (!parsed.success) return null
    return getCounterparty(db, parsed.data.id)
  })

  ipcMain.handle('counterparty:create', (_event, input: unknown) =>
    createCounterparty(db, input),
  )

  ipcMain.handle('counterparty:update', (_event, input: unknown) =>
    updateCounterparty(db, input),
  )

  ipcMain.handle('counterparty:deactivate', (_event, input: unknown) => {
    const parsed = CounterpartyIdSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: 'Ogiltigt id.',
        code: 'VALIDATION_ERROR' as const,
      }
    return deactivateCounterparty(db, parsed.data.id)
  })

  // === Products ===
  ipcMain.handle('product:list', (_event, input: unknown) => {
    const parsed = ProductListInputSchema.safeParse(input ?? {})
    if (!parsed.success) return []
    return listProducts(db, parsed.data)
  })

  ipcMain.handle('product:get', (_event, input: unknown) => {
    const parsed = ProductIdSchema.safeParse(input)
    if (!parsed.success) return null
    return getProduct(db, parsed.data.id)
  })

  ipcMain.handle('product:create', (_event, input: unknown) =>
    createProduct(db, input),
  )

  ipcMain.handle('product:update', (_event, input: unknown) =>
    updateProduct(db, input),
  )

  ipcMain.handle('product:deactivate', (_event, input: unknown) => {
    const parsed = ProductIdSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: 'Ogiltigt id.',
        code: 'VALIDATION_ERROR' as const,
      }
    return deactivateProduct(db, parsed.data.id)
  })

  // === Product pricing ===
  ipcMain.handle('product:set-customer-price', (_event, input: unknown) => {
    const parsed = SetCustomerPriceInputSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: 'Ogiltigt input.',
        code: 'VALIDATION_ERROR' as const,
      }
    return setCustomerPrice(db, parsed.data)
  })

  ipcMain.handle('product:remove-customer-price', (_event, input: unknown) => {
    const parsed = RemoveCustomerPriceInputSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: 'Ogiltigt input.',
        code: 'VALIDATION_ERROR' as const,
      }
    return removeCustomerPrice(db, parsed.data)
  })

  ipcMain.handle('product:get-price-for-customer', (_event, input: unknown) => {
    const parsed = GetPriceForCustomerInputSchema.safeParse(input)
    if (!parsed.success) return { price_ore: 0, source: 'default' }
    return getPriceForCustomer(db, parsed.data)
  })

  // === Expenses ===
  ipcMain.handle('expense:save-draft', (_event, input: unknown) =>
    saveExpenseDraft(db, input),
  )

  ipcMain.handle('expense:get-draft', (_event, input: unknown) => {
    const parsed = ExpenseIdSchema.safeParse(input)
    if (!parsed.success) return { success: true, data: null }
    return getExpenseDraft(db, parsed.data.id)
  })

  ipcMain.handle('expense:update-draft', (_event, input: unknown) =>
    updateExpenseDraft(db, input),
  )

  ipcMain.handle('expense:delete-draft', (_event, input: unknown) => {
    const parsed = ExpenseIdSchema.safeParse(input)
    if (!parsed.success)
      return { success: false, error: 'Ogiltigt id.', code: 'VALIDATION_ERROR' }
    return deleteExpenseDraft(db, parsed.data.id)
  })

  ipcMain.handle('expense:list-drafts', (_event, input: unknown) => {
    const parsed = ListExpenseDraftsSchema.safeParse(input)
    if (!parsed.success) return { success: true, data: [] }
    return listExpenseDrafts(db, parsed.data.fiscal_year_id)
  })

  ipcMain.handle('expense:finalize', (_event, input: unknown) => {
    const parsed = FinalizeExpenseSchema.safeParse(input)
    if (!parsed.success) {
      log.warn('[expense:finalize] Validation error:', parsed.error.issues)
      return { success: false, error: 'Ogiltigt id.', code: 'VALIDATION_ERROR' }
    }
    return finalizeExpense(db, parsed.data.id)
  })

  ipcMain.handle('expense:pay', (_event, input: unknown) => {
    const parsed = PayExpenseInputSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: 'Ogiltigt input.',
        code: 'VALIDATION_ERROR',
      }
    return payExpense(db, parsed.data)
  })

  ipcMain.handle('expense:payBulk', (_event, input: unknown) => {
    const parsed = PayExpensesBulkPayloadSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join('; '),
        code: 'VALIDATION_ERROR',
      }
    return payExpensesBulk(db, parsed.data)
  })

  ipcMain.handle('expense:payments', wrapIpcHandler(
    GetExpensePaymentsSchema,
    (parsed) => getExpensePayments(db, parsed.expense_id),
  ))

  ipcMain.handle('expense:get', (_event, input: unknown) => {
    const parsed = GetExpenseSchema.safeParse(input)
    if (!parsed.success) return { success: true, data: null }
    return getExpense(db, parsed.data.id)
  })

  ipcMain.handle('expense:list', wrapIpcHandler(
    ListExpensesSchema,
    (parsed) => listExpenses(db, parsed),
  ))

  ipcMain.handle('expense:create-credit-note-draft', wrapIpcHandler(
    CreateExpenseCreditNoteDraftSchema,
    (parsed) => createExpenseCreditNoteDraft(db, parsed),
  ))

  // === Stödjande ===
  ipcMain.handle('vat-code:list', (_event, input: unknown) => {
    const parsed = VatCodeListInputSchema.safeParse(input ?? {})
    if (!parsed.success) return []
    return listVatCodes(db, parsed.data.direction)
  })

  ipcMain.handle('account:list', (_event, input: unknown) => {
    const parsed = AccountListInputSchema.safeParse(input)
    if (!parsed.success) return []
    return listAccounts(db, parsed.data)
  })

  ipcMain.handle('account:list-all', (_event, input: unknown) => {
    const parsed = AccountListAllInputSchema.safeParse(input ?? {})
    if (!parsed.success) return []
    return listAllAccounts(db, parsed.data)
  })

  ipcMain.handle('account:create', (_event, input: unknown) => {
    const parsed = AccountCreateInputSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Ogiltigt input.',
        code: 'VALIDATION_ERROR',
      }
    return createAccount(db, parsed.data)
  })

  ipcMain.handle('account:update', (_event, input: unknown) => {
    const parsed = AccountUpdateInputSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: 'Ogiltigt input.',
        code: 'VALIDATION_ERROR',
      }
    return updateAccount(db, parsed.data)
  })

  ipcMain.handle('account:toggle-active', (_event, input: unknown) => {
    const parsed = AccountToggleActiveInputSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: 'Ogiltigt input.',
        code: 'VALIDATION_ERROR',
      }
    return toggleAccountActive(db, parsed.data)
  })

  ipcMain.handle('backup:create', async () => {
    return createBackup(db)
  })

  // === Invoices ===
  ipcMain.handle('invoice:save-draft', (_event, input: unknown) =>
    saveDraft(db, input),
  )

  ipcMain.handle('invoice:get-draft', (_event, input: unknown) => {
    const parsed = InvoiceIdSchema.safeParse(input)
    if (!parsed.success) return null
    return getDraft(db, parsed.data.id)
  })

  ipcMain.handle('invoice:update-draft', (_event, input: unknown) =>
    updateDraft(db, input),
  )

  ipcMain.handle('invoice:delete-draft', (_event, input: unknown) => {
    const parsed = InvoiceIdSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: 'Ogiltigt id.',
        code: 'VALIDATION_ERROR' as const,
      }
    return deleteDraft(db, parsed.data.id)
  })

  ipcMain.handle('invoice:list-drafts', (_event, input: unknown) => {
    const parsed = DraftListInputSchema.safeParse(input)
    if (!parsed.success) return []
    return listDrafts(db, parsed.data.fiscal_year_id)
  })

  ipcMain.handle('invoice:next-number', (_event, input: unknown) => {
    const parsed = NextNumberInputSchema.safeParse(input)
    if (!parsed.success) return { preview: 1 }
    return nextInvoiceNumber(db, parsed.data.fiscal_year_id)
  })

  ipcMain.handle('invoice:list', wrapIpcHandler(
    InvoiceListInputSchema,
    (parsed) => listInvoices(db, parsed),
  ))

  ipcMain.handle('invoice:finalize', (_event, input: unknown) => {
    const parsed = FinalizeInvoiceInputSchema.safeParse(input)
    if (!parsed.success) {
      log.warn('[invoice:finalize] Validation error:', parsed.error.issues)
      return {
        success: false,
        error: 'Ogiltigt id.',
        code: 'VALIDATION_ERROR' as const,
      }
    }
    return finalizeDraft(db, parsed.data.id)
  })

  ipcMain.handle('invoice:pay', (_event, input: unknown) => {
    const parsed = PayInvoiceInputSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: 'Ogiltigt input.',
        code: 'VALIDATION_ERROR',
      }
    return payInvoice(db, parsed.data)
  })

  ipcMain.handle('invoice:payBulk', (_event, input: unknown) => {
    const parsed = PayInvoicesBulkPayloadSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join('; '),
        code: 'VALIDATION_ERROR',
      }
    return payInvoicesBulk(db, parsed.data)
  })

  ipcMain.handle('invoice:payments', wrapIpcHandler(
    GetPaymentsInputSchema,
    (parsed) => getPayments(db, parsed.invoice_id),
  ))

  ipcMain.handle('invoice:update-sent', (_event, input: unknown) => {
    const parsed = UpdateSentInvoiceInputSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: 'Ogiltigt input.',
        code: 'VALIDATION_ERROR' as const,
      }
    return updateSentInvoice(db, parsed.data)
  })

  ipcMain.handle('invoice:create-credit-note-draft', wrapIpcHandler(
    CreateCreditNoteDraftSchema,
    (parsed) => createCreditNoteDraft(db, parsed),
  ))

  // === Dashboard ===
  ipcMain.handle('dashboard:summary', wrapIpcHandler(
    DashboardSummaryInputSchema,
    (parsed) => getDashboardSummary(db, parsed.fiscalYearId),
  ))

  // === VAT Report ===
  ipcMain.handle('vat:report', wrapIpcHandler(
    VatReportInputSchema,
    (parsed) => getVatReport(db, parsed.fiscal_year_id),
  ))

  // === Tax ===
  ipcMain.handle('tax:forecast', wrapIpcHandler(
    TaxForecastInputSchema,
    (parsed) => getTaxForecast(db, parsed.fiscalYearId),
  ))

  // === SIE5 Export ===
  ipcMain.handle('export:sie5', wrapIpcHandler(
    ExportSie5Schema,
    (parsed) => exportSie5(db, { fiscalYearId: parsed.fiscal_year_id }),
  ))

  // === SIE4 Export ===
  ipcMain.handle('export:sie4', wrapIpcHandler(
    ExportSie4Schema,
    (parsed) => {
      const result = exportSie4(db, { fiscalYearId: parsed.fiscal_year_id })
      return {
        buffer: new Uint8Array(result.content),
        filename: result.filename,
      }
    },
  ))

  // === Manual Entries ===
  ipcMain.handle('manual-entry:save-draft', (_event, input: unknown) => {
    const parsed = SaveManualEntryDraftSchema.safeParse(input)
    if (!parsed.success) {
      log.warn(
        '[manual-entry:save-draft] Validation error:',
        parsed.error.issues,
      )
      return {
        success: false,
        error: 'Ogiltigt input.',
        code: 'VALIDATION_ERROR',
      }
    }
    return saveManualEntryDraft(db, parsed.data)
  })

  ipcMain.handle('manual-entry:get', (_event, input: unknown) => {
    const parsed = ManualEntryIdSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: 'Ogiltigt input.',
        code: 'VALIDATION_ERROR',
      }
    return getManualEntry(db, parsed.data.id)
  })

  ipcMain.handle('manual-entry:update-draft', (_event, input: unknown) => {
    const parsed = UpdateManualEntryDraftSchema.safeParse(input)
    if (!parsed.success) {
      log.warn(
        '[manual-entry:update-draft] Validation error:',
        parsed.error.issues,
      )
      return {
        success: false,
        error: 'Ogiltigt input.',
        code: 'VALIDATION_ERROR',
      }
    }
    return updateManualEntryDraft(db, parsed.data)
  })

  ipcMain.handle('manual-entry:delete-draft', (_event, input: unknown) => {
    const parsed = ManualEntryIdSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: 'Ogiltigt input.',
        code: 'VALIDATION_ERROR',
      }
    return deleteManualEntryDraft(db, parsed.data.id)
  })

  ipcMain.handle('manual-entry:list-drafts', (_event, input: unknown) => {
    const parsed = ManualEntryListSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: 'Ogiltigt input.',
        code: 'VALIDATION_ERROR',
      }
    return listManualEntryDrafts(db, parsed.data.fiscal_year_id)
  })

  ipcMain.handle('manual-entry:list', (_event, input: unknown) => {
    const parsed = ManualEntryListSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: 'Ogiltigt input.',
        code: 'VALIDATION_ERROR',
      }
    return listManualEntries(db, parsed.data.fiscal_year_id)
  })

  ipcMain.handle('manual-entry:finalize', (_event, input: unknown) => {
    const parsed = ManualEntryFinalizeSchema.safeParse(input)
    if (!parsed.success) {
      log.warn('[manual-entry:finalize] Validation error:', parsed.error.issues)
      return {
        success: false,
        error: 'Ogiltigt input.',
        code: 'VALIDATION_ERROR',
      }
    }
    return finalizeManualEntry(db, parsed.data.id, parsed.data.fiscal_year_id)
  })

  // === Excel Export ===
  ipcMain.handle('export:excel', wrapIpcHandler(
    ExportExcelSchema,
    async (parsed) => {
      const result = await exportExcel(db, {
        fiscalYearId: parsed.fiscal_year_id,
        startDate: parsed.start_date,
        endDate: parsed.end_date,
      })
      return {
        buffer: new Uint8Array(result.buffer),
        filename: result.filename,
      }
    },
  ))

  // === Reports ===
  ipcMain.handle('report:income-statement', wrapIpcHandler(
    ReportRequestSchema,
    (parsed) => getIncomeStatement(db, parsed.fiscal_year_id, parsed.date_range),
  ))

  ipcMain.handle('report:balance-sheet', wrapIpcHandler(
    ReportRequestSchema,
    (parsed) => getBalanceSheet(db, parsed.fiscal_year_id, parsed.date_range),
  ))

  // === Export Write File ===
  ipcMain.handle('export:write-file', wrapIpcHandler(
    ExportWriteFileRequestSchema,
    async (parsed) => {
      const { format, fiscal_year_id, date_range } = parsed
      let buffer: Uint8Array
      let defaultFilename: string
      let filterName: string
      let filterExtension: string

      if (format === 'sie5') {
        const xml = exportSie5(db, { fiscalYearId: fiscal_year_id })
        buffer = new TextEncoder().encode(xml)
        defaultFilename = `SIE5_export.xml`
        filterName = 'SIE5 XML'
        filterExtension = 'xml'
      } else if (format === 'sie4') {
        const result = exportSie4(db, { fiscalYearId: fiscal_year_id })
        buffer = new Uint8Array(result.content)
        defaultFilename = result.filename
        filterName = 'SIE4'
        filterExtension = 'se'
      } else {
        const result = await exportExcel(db, {
          fiscalYearId: fiscal_year_id,
          startDate: date_range?.from,
          endDate: date_range?.to,
        })
        buffer = new Uint8Array(result.buffer)
        defaultFilename = result.filename
        filterName = 'Excel'
        filterExtension = 'xlsx'
      }

      // E2E dialog bypass (M63)
      const e2eExportPath = getE2EFilePath(defaultFilename, 'save')
      if (e2eExportPath) {
        fs.writeFileSync(e2eExportPath, buffer)
        return { filePath: e2eExportPath }
      }

      const dialogResult = await dialog.showSaveDialog({
        defaultPath: defaultFilename,
        filters: [{ name: filterName, extensions: [filterExtension] }],
      })

      if (dialogResult.canceled || !dialogResult.filePath) {
        return { cancelled: true }
      }

      fs.writeFileSync(dialogResult.filePath, buffer)
      return { filePath: dialogResult.filePath }
    },
  ))

  // === Invoice PDF ===
  ipcMain.handle('invoice:generate-pdf', wrapIpcHandler<{ invoiceId: number }, { data: string }>(
    GenerateInvoicePdfSchema,
    async (parsed) => {
      const buffer = await generateInvoicePdf(db, parsed.invoiceId)
      return { data: buffer.toString('base64') }
    },
  ))

  ipcMain.handle('invoice:save-pdf', wrapIpcHandler(
    SaveInvoicePdfSchema,
    async (parsed): Promise<IpcResult<{ success: boolean; filePath?: string }>> => {
      // E2E dialog bypass (M63)
      const e2ePdfPath = getE2EFilePath(parsed.defaultFileName, 'save')
      if (e2ePdfPath) {
        const buffer = Buffer.from(parsed.data, 'base64')
        fs.writeFileSync(e2ePdfPath, buffer)
        return { success: true, data: { success: true, filePath: e2ePdfPath } }
      }

      const win =
        BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const { canceled, filePath } = await dialog.showSaveDialog(win!, {
        defaultPath: parsed.defaultFileName,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      })
      if (canceled || !filePath)
        return { success: true, data: { success: false } }

      const buffer = Buffer.from(parsed.data, 'base64')
      fs.writeFileSync(filePath, buffer)
      return { success: true, data: { success: true, filePath } }
    },
  ))

  // === Settings ===
  ipcMain.handle('settings:get', (_event, key: string) => {
    const settings = loadSettings()
    return settings[key] ?? null
  })

  ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
    const settings = loadSettings()
    settings[key] = value
    saveSettings(settings)
  })

  // Test-only IPC endpoints — registered ONLY when FRITT_TEST=1
  if (process.env.FRITT_TEST === '1') {
    const { registerTestHandlers } = require('./ipc/test-handlers')
    registerTestHandlers(db)
  }
}
