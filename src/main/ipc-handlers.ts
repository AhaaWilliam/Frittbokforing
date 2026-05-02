import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import path from 'path'
import { dbProxy, getDbPath, getTableCount } from './db'
import { loadSettings, saveSettings } from './utils/settings'
import { getActiveCompanyId } from './utils/active-context'
import {
  createCompany,
  getCompanyById,
  listCompanies,
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
  setCounterpartyDefaultAccount,
} from './services/counterparty-service'
import { saveReceiptFile } from './services/receipt-storage'
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
  listExpenses,
  createExpenseCreditNoteDraft,
} from './services/expense-service'
import {
  getDashboardSummary,
  getLatestVerification,
} from './services/dashboard-service'
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
import { listImportedEntries } from './services/imported-entry-service'
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
import { createBackup, restoreBackup } from './services/backup-service'
import { performAutoBackupIfDue } from './services/auto-backup-service'
import { vacuumDatabase } from './services/maintenance-service'
import { getAccountStatement } from './services/account-statement-service'
import {
  createCorrectionEntry,
  canCorrectEntry,
} from './services/correction-service'
import { globalSearch } from './services/search-service'
import { getAgingReceivables, getAgingPayables } from './services/aging-service'
import { parseSie4 } from './services/sie4/sie4-import-parser'
import {
  validateSieParseResult,
  detectAccountConflicts,
} from './services/sie4/sie4-import-validator'
import { importSie4 } from './services/sie4/sie4-import-service'
import { parseSie5 } from './services/sie5/sie5-import-parser'
import {
  validateSie5ParseResult,
  detectSie5AccountConflicts,
} from './services/sie5/sie5-import-validator'
import { importSie5 } from './services/sie5/sie5-import-service'
import {
  validateBatchForExport,
  generatePain001,
  markBatchExported,
} from './services/payment/pain001-export-service'
import {
  createMandate,
  listMandates,
  revokeMandate,
  createCollection,
  createDirectDebitBatch,
  listCollections as listSepaCollections,
  listDirectDebitBatches,
} from './services/payment/sepa-dd-service'
import { generatePain008 } from './services/payment/pain008-export-service'
import {
  createAccrualSchedule,
  getAccrualSchedules,
  executeAccrualForPeriod,
  executeAllForPeriod,
  deactivateSchedule,
} from './services/accrual-service'
import {
  getBudgetLines,
  getBudgetTargets,
  saveBudgetTargets,
  getBudgetVsActual,
  copyBudgetFromPreviousFy,
  getBudgetSummaryByYear,
} from './services/budget-service'
import {
  createFixedAsset,
  updateFixedAsset,
  listFixedAssets,
  getFixedAsset,
  disposeFixedAsset,
  deleteFixedAsset,
  executeDepreciationPeriod,
} from './services/depreciation-service'
import { getCashFlowStatement } from './services/cash-flow-service'
import {
  importBankStatement,
  listBankStatements,
  getBankStatement,
} from './services/bank/bank-statement-service'
import { matchBankTransaction } from './services/bank/bank-match-service'
import {
  unmatchBankTransaction,
  unmatchBankBatch,
} from './services/bank/bank-unmatch-service'
import {
  listBankTxMappings,
  upsertBankTxMapping,
  deleteBankTxMapping,
} from './services/bank/bank-tx-mapping-service'
import { createBankFeeEntry } from './services/bank/bank-fee-entry-service'
import { suggestMatchesForStatement } from './services/bank/bank-match-suggester'
import { getE2EFilePath, getE2EMockOpenFile } from './utils/e2e-helpers'
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
  JournalLatestVerificationInputSchema,
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
  AccountStatementInputSchema,
  ExportSie5Schema,
  ExportSie4Schema,
  ExportExcelSchema,
  SaveManualEntryDraftSchema,
  UpdateManualEntryDraftSchema,
  ManualEntryIdSchema,
  ManualEntryFinalizeSchema,
  ManualEntryListSchema,
  ListImportedEntriesSchema,
  FiscalYearCreateNewInputSchema,
  FiscalYearSwitchInputSchema,
  NetResultInputSchema,
  GenerateInvoicePdfSchema,
  SaveInvoicePdfSchema,
  SelectDirectorySchema,
  SavePdfBatchSchema,
  PayInvoicesBulkPayloadSchema,
  PayExpensesBulkPayloadSchema,
  CreateCreditNoteDraftSchema,
  CreateExpenseCreditNoteDraftSchema,
  CorrectJournalEntrySchema,
  CanCorrectSchema,
  GlobalSearchSchema,
  AgingInputSchema,
  Sie4SelectFileSchema,
  SelectReceiptFileSchema,
  Sie4ValidateSchema,
  Sie4ImportSchema,
  Sie5SelectFileSchema,
  Sie5ValidateSchema,
  Sie5ImportSchema,
  PaymentBatchValidateExportSchema,
  PaymentBatchExportPain001Schema,
  SepaDdCreateMandateSchema,
  SepaDdListMandatesSchema,
  SepaDdRevokeMandateSchema,
  SepaDdCreateCollectionSchema,
  SepaDdCreateBatchSchema,
  SepaDdExportPain008Schema,
  SepaDdListCollectionsSchema,
  SepaDdListBatchesSchema,
  AccrualCreateSchema,
  AccrualListSchema,
  AccrualExecuteSchema,
  AccrualExecuteAllSchema,
  AccrualDeactivateSchema,
  BudgetLinesSchema,
  BudgetGetSchema,
  BudgetSaveSchema,
  BudgetVarianceSchema,
  BudgetCopySchema,
  BudgetSummaryByYearSchema,
  DepreciationCreateAssetSchema,
  DepreciationUpdateAssetSchema,
  DepreciationListSchema,
  DepreciationIdSchema,
  DepreciationDisposeSchema,
  DepreciationExecutePeriodSchema,
  CashFlowInputSchema,
  BankStatementImportSchema,
  BankStatementListSchema,
  BankStatementGetSchema,
  BankMatchTransactionSchema,
  BankStatementSuggestMatchesSchema,
  BankUnmatchTransactionSchema,
  BankUnmatchBatchSchema,
  BankTxMappingUpsertSchema,
  BankTxMappingDeleteSchema,
  BankCreateFeeEntrySchema,
  CompanySwitchInputSchema,
  CreateCompanyInputSchema,
  UpdateCompanyInputSchema,
  CreateCounterpartyInputSchema,
  UpdateCounterpartyInputSchema,
  SetCounterpartyDefaultAccountSchema,
  AttachReceiptSchema,
  CreateProductInputSchema,
  UpdateProductInputSchema,
  SaveExpenseDraftSchema,
  UpdateExpenseDraftSchema,
  SaveDraftInputSchema,
  UpdateDraftInputSchema,
  PreviewJournalLinesInputSchema,
  ReceiptListInputSchema,
  CreateReceiptInputSchema,
  UpdateReceiptNotesInputSchema,
  ArchiveReceiptInputSchema,
  BulkArchiveReceiptInputSchema,
  ReceiptCountsInputSchema,
  LinkReceiptToExpenseInputSchema,
  PeriodChecksInputSchema,
} from './ipc-schemas'
import { previewJournalLines } from './services/preview-service'
import {
  listReceipts,
  createReceipt,
  updateReceiptNotes,
  archiveReceipt,
  bulkArchiveReceipts,
  getReceiptCounts,
  deleteReceipt,
  linkReceiptToExpense,
} from './services/receipt-service'
import { getPeriodChecks } from './services/period-checks-service'
import type { HealthCheckResponse, IpcResult } from '../shared/types'
import log from 'electron-log'
import { wrapIpcHandler } from './ipc/wrap-ipc-handler'

/**
 * Post-unlock startup tasks. Called from the auth unlock hook after the
 * per-user encrypted DB is opened. Runs per login because it targets the
 * just-opened connection, which may differ between users.
 */
export function runPostUnlockStartup(): void {
  // Indexes flyttade till migration 048 (F13).
  // refreshInvoice/ExpenseStatuses scopas numera per fiscal_year_id
  // (regel 14) och körs on-demand från listInvoices/listExpenses.
  // Ingen global overdue-refresh vid login.

  // Sprint G: auto-backup om det är dags. Tyst i bakgrunden — blockerar
  // inte unlock-flödet. Test-mode skippas (E2E bör inte skriva filer
  // till Documents-mappen).
  if (process.env.FRITT_TEST !== '1' && process.env.E2E_TESTING !== 'true') {
    performAutoBackupIfDue(dbProxy).catch((err) => {
      log.error('[auto-backup] Oväntat fel vid post-unlock-backup:', err)
    })
  }
}

export function registerIpcHandlers(): void {
  // `db` is a lazy proxy resolving getDb() on each property access.
  // This lets us register handlers once at startup even though the real
  // DB is only opened after auth unlock (M158+ROAD — see ADR 004 §7).
  const db = dbProxy

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
  ipcMain.handle(
    'company:create',
    wrapIpcHandler(CreateCompanyInputSchema, (data) => createCompany(db, data)),
  )
  ipcMain.handle(
    'company:get',
    wrapIpcHandler(null, () => {
      // Sprint MC1: returnerar aktivt bolag (settings.last_company_id) med
      // fallback till första bolaget. Bakåtkompatibel med single-company-UI.
      const id = getActiveCompanyId(db, loadSettings())
      return id ? getCompanyById(db, id) : null
    }),
  )
  ipcMain.handle(
    'company:list',
    wrapIpcHandler(null, () => listCompanies(db)),
  )
  ipcMain.handle(
    'company:switch',
    wrapIpcHandler(CompanySwitchInputSchema, (data) => {
      const company = getCompanyById(db, data.company_id)
      if (!company) {
        throw {
          code: 'NOT_FOUND',
          error: 'Företaget hittades inte.',
          field: 'company_id',
        }
      }
      const settings = loadSettings()
      settings.last_company_id = company.id
      saveSettings(settings)
      return company
    }),
  )
  ipcMain.handle(
    'company:update',
    wrapIpcHandler(UpdateCompanyInputSchema, (data) => updateCompany(db, data)),
  )

  // === Fiscal Years ===
  ipcMain.handle(
    'fiscal-year:list',
    wrapIpcHandler(null, () => listFiscalYears(db)),
  )

  // === Fiscal Periods ===
  ipcMain.handle(
    'fiscal-period:list',
    wrapIpcHandler(FiscalPeriodListInputSchema, (data) =>
      listFiscalPeriods(db, data.fiscal_year_id),
    ),
  )

  ipcMain.handle(
    'fiscal-period:close',
    wrapIpcHandler(PeriodActionInputSchema, (data) =>
      closePeriod(db, data.period_id),
    ),
  )

  ipcMain.handle(
    'fiscal-period:reopen',
    wrapIpcHandler(PeriodActionInputSchema, (data) =>
      reopenPeriod(db, data.period_id),
    ),
  )

  // === Fiscal Year Create / Switch / Net Result ===
  ipcMain.handle(
    'fiscal-year:create-new',
    wrapIpcHandler(FiscalYearCreateNewInputSchema, (data) => {
      const settings = loadSettings()
      const activeFyId = settings.last_fiscal_year_id as number | undefined
      if (!activeFyId) {
        throw { code: 'VALIDATION_ERROR', error: 'Inget aktivt räkenskapsår.' }
      }

      const companyId = getActiveCompanyId(db, settings)
      if (!companyId) {
        throw { code: 'VALIDATION_ERROR', error: 'Inget företag hittat.' }
      }

      const result = createNewFiscalYear(db, companyId, activeFyId, {
        confirmBookResult: data.confirmBookResult ?? false,
        netResultOre: data.netResultOre ?? 0,
      })

      // F2-fix: closeFiscalYear sker nu atomärt INI createNewFiscalYear-transaktionen.

      // Update settings to new FY
      settings.last_fiscal_year_id = result.fiscalYear.id
      saveSettings(settings)

      return result
    }),
  )

  ipcMain.handle(
    'fiscal-year:switch',
    wrapIpcHandler(FiscalYearSwitchInputSchema, (data) => {
      const fy = db
        .prepare('SELECT * FROM fiscal_years WHERE id = ?')
        .get(data.fiscalYearId) as
        | import('../shared/types').FiscalYear
        | undefined
      if (!fy) {
        throw { code: 'NOT_FOUND', error: 'Räkenskapsår hittades inte.' }
      }
      const settings = loadSettings()
      settings.last_fiscal_year_id = fy.id
      saveSettings(settings)
      return fy
    }),
  )

  ipcMain.handle(
    'opening-balance:re-transfer',
    wrapIpcHandler(null, () => {
      const settings = loadSettings()
      const activeFyId = settings.last_fiscal_year_id as number | undefined
      if (!activeFyId) {
        throw {
          code: 'VALIDATION_ERROR',
          error: 'Inget aktivt räkenskapsår.',
        }
      }
      return reTransferOpeningBalance(db, activeFyId)
    }),
  )

  ipcMain.handle(
    'opening-balance:net-result',
    wrapIpcHandler(NetResultInputSchema, (data) => {
      const netResultOre = calculateNetResult(db, data.fiscalYearId)
      return { netResultOre, isAlreadyBooked: netResultOre === 0 }
    }),
  )

  // === Counterparties ===
  ipcMain.handle(
    'counterparty:list',
    wrapIpcHandler(CounterpartyListInputSchema, (data) =>
      listCounterparties(db, data),
    ),
  )

  ipcMain.handle(
    'counterparty:get',
    wrapIpcHandler(CounterpartyIdSchema, (data) =>
      getCounterparty(db, data.id, data.company_id),
    ),
  )

  ipcMain.handle(
    'counterparty:create',
    wrapIpcHandler(CreateCounterpartyInputSchema, (data) =>
      createCounterparty(db, data),
    ),
  )

  ipcMain.handle(
    'counterparty:update',
    wrapIpcHandler(UpdateCounterpartyInputSchema, (data) =>
      updateCounterparty(db, data),
    ),
  )

  ipcMain.handle(
    'counterparty:deactivate',
    wrapIpcHandler(CounterpartyIdSchema, (data) =>
      deactivateCounterparty(db, data.id, data.company_id),
    ),
  )

  ipcMain.handle(
    'counterparty:set-default-account',
    wrapIpcHandler(SetCounterpartyDefaultAccountSchema, (data) =>
      setCounterpartyDefaultAccount(db, data),
    ),
  )

  // === Products ===
  ipcMain.handle(
    'product:list',
    wrapIpcHandler(ProductListInputSchema, (data) => listProducts(db, data)),
  )

  ipcMain.handle(
    'product:get',
    wrapIpcHandler(ProductIdSchema, (data) =>
      getProduct(db, data.id, data.company_id),
    ),
  )

  ipcMain.handle(
    'product:create',
    wrapIpcHandler(CreateProductInputSchema, (data) => createProduct(db, data)),
  )

  ipcMain.handle(
    'product:update',
    wrapIpcHandler(UpdateProductInputSchema, (data) => updateProduct(db, data)),
  )

  ipcMain.handle(
    'product:deactivate',
    wrapIpcHandler(ProductIdSchema, (data) =>
      deactivateProduct(db, data.id, data.company_id),
    ),
  )

  // === Product pricing ===
  ipcMain.handle(
    'product:set-customer-price',
    wrapIpcHandler(SetCustomerPriceInputSchema, (data) =>
      setCustomerPrice(db, data),
    ),
  )

  ipcMain.handle(
    'product:remove-customer-price',
    wrapIpcHandler(RemoveCustomerPriceInputSchema, (data) =>
      removeCustomerPrice(db, data),
    ),
  )

  ipcMain.handle(
    'product:get-price-for-customer',
    wrapIpcHandler(GetPriceForCustomerInputSchema, (data) =>
      getPriceForCustomer(db, data),
    ),
  )

  // === Expenses ===
  ipcMain.handle(
    'expense:save-draft',
    wrapIpcHandler(SaveExpenseDraftSchema, (data) =>
      saveExpenseDraft(db, data),
    ),
  )

  ipcMain.handle(
    'expense:get-draft',
    wrapIpcHandler(ExpenseIdSchema, (data) => getExpenseDraft(db, data.id)),
  )

  ipcMain.handle(
    'expense:update-draft',
    wrapIpcHandler(UpdateExpenseDraftSchema, (data) =>
      updateExpenseDraft(db, data),
    ),
  )

  ipcMain.handle(
    'expense:delete-draft',
    wrapIpcHandler(ExpenseIdSchema, (data) => deleteExpenseDraft(db, data.id)),
  )

  ipcMain.handle(
    'expense:list-drafts',
    wrapIpcHandler(ListExpenseDraftsSchema, (data) =>
      listExpenseDrafts(db, data.fiscal_year_id),
    ),
  )

  ipcMain.handle(
    'expense:finalize',
    wrapIpcHandler(FinalizeExpenseSchema, (data) =>
      finalizeExpense(db, data.id),
    ),
  )

  ipcMain.handle(
    'expense:attach-receipt',
    wrapIpcHandler(AttachReceiptSchema, (data) => saveReceiptFile(db, data)),
  )

  ipcMain.handle(
    'expense:pay',
    wrapIpcHandler(PayExpenseInputSchema, (data) => payExpense(db, data)),
  )

  ipcMain.handle(
    'expense:payBulk',
    wrapIpcHandler(PayExpensesBulkPayloadSchema, (data) =>
      payExpensesBulk(db, data),
    ),
  )

  ipcMain.handle(
    'expense:payments',
    wrapIpcHandler(GetExpensePaymentsSchema, (parsed) =>
      getExpensePayments(db, parsed.expense_id),
    ),
  )

  ipcMain.handle(
    'expense:get',
    wrapIpcHandler(GetExpenseSchema, (data) => getExpense(db, data.id)),
  )

  ipcMain.handle(
    'expense:list',
    wrapIpcHandler(ListExpensesSchema, (parsed) => listExpenses(db, parsed)),
  )

  ipcMain.handle(
    'expense:create-credit-note-draft',
    wrapIpcHandler(CreateExpenseCreditNoteDraftSchema, (parsed) =>
      createExpenseCreditNoteDraft(db, parsed),
    ),
  )

  // === Stödjande ===
  ipcMain.handle(
    'vat-code:list',
    wrapIpcHandler(VatCodeListInputSchema, (data) =>
      listVatCodes(db, data.direction),
    ),
  )

  ipcMain.handle(
    'account:list',
    wrapIpcHandler(AccountListInputSchema, (data) => listAccounts(db, data)),
  )

  ipcMain.handle(
    'account:list-all',
    wrapIpcHandler(AccountListAllInputSchema, (data) =>
      listAllAccounts(db, data),
    ),
  )

  ipcMain.handle(
    'account:create',
    wrapIpcHandler(AccountCreateInputSchema, (data) => createAccount(db, data)),
  )

  ipcMain.handle(
    'account:update',
    wrapIpcHandler(AccountUpdateInputSchema, (data) => updateAccount(db, data)),
  )

  ipcMain.handle(
    'account:toggle-active',
    wrapIpcHandler(AccountToggleActiveInputSchema, (data) =>
      toggleAccountActive(db, data),
    ),
  )

  ipcMain.handle(
    'account:get-statement',
    wrapIpcHandler(AccountStatementInputSchema, (data) =>
      getAccountStatement(db, data),
    ),
  )

  ipcMain.handle('backup:create', async () => {
    return createBackup(db)
  })

  ipcMain.handle('backup:restore-dialog', async () => {
    return restoreBackup(db)
  })

  ipcMain.handle(
    'maintenance:vacuum',
    wrapIpcHandler(null, () => vacuumDatabase(db)),
  )

  // === Invoices ===
  ipcMain.handle(
    'invoice:save-draft',
    wrapIpcHandler(SaveDraftInputSchema, (data) => saveDraft(db, data)),
  )

  ipcMain.handle(
    'invoice:get-draft',
    wrapIpcHandler(InvoiceIdSchema, (data) => getDraft(db, data.id)),
  )

  ipcMain.handle(
    'invoice:update-draft',
    wrapIpcHandler(UpdateDraftInputSchema, (data) => updateDraft(db, data)),
  )

  ipcMain.handle(
    'invoice:delete-draft',
    wrapIpcHandler(InvoiceIdSchema, (data) => deleteDraft(db, data.id)),
  )

  ipcMain.handle(
    'invoice:list-drafts',
    wrapIpcHandler(DraftListInputSchema, (data) =>
      listDrafts(db, data.fiscal_year_id),
    ),
  )

  ipcMain.handle(
    'invoice:next-number',
    wrapIpcHandler(NextNumberInputSchema, (data) =>
      nextInvoiceNumber(db, data.fiscal_year_id),
    ),
  )

  ipcMain.handle(
    'invoice:list',
    wrapIpcHandler(InvoiceListInputSchema, (parsed) =>
      listInvoices(db, parsed),
    ),
  )

  ipcMain.handle(
    'invoice:finalize',
    wrapIpcHandler(FinalizeInvoiceInputSchema, (data) =>
      finalizeDraft(db, data.id),
    ),
  )

  ipcMain.handle(
    'invoice:pay',
    wrapIpcHandler(PayInvoiceInputSchema, (data) => payInvoice(db, data)),
  )

  ipcMain.handle(
    'invoice:payBulk',
    wrapIpcHandler(PayInvoicesBulkPayloadSchema, (data) =>
      payInvoicesBulk(db, data),
    ),
  )

  ipcMain.handle(
    'invoice:payments',
    wrapIpcHandler(GetPaymentsInputSchema, (parsed) =>
      getPayments(db, parsed.invoice_id),
    ),
  )

  ipcMain.handle(
    'invoice:update-sent',
    wrapIpcHandler(UpdateSentInvoiceInputSchema, (data) =>
      updateSentInvoice(db, data),
    ),
  )

  ipcMain.handle(
    'invoice:create-credit-note-draft',
    wrapIpcHandler(CreateCreditNoteDraftSchema, (parsed) =>
      createCreditNoteDraft(db, parsed),
    ),
  )

  // === Dashboard ===
  ipcMain.handle(
    'dashboard:summary',
    wrapIpcHandler(DashboardSummaryInputSchema, (parsed) =>
      getDashboardSummary(db, parsed.fiscalYearId),
    ),
  )

  // VS-42: hero-pill "Senast bokfört" på Vardag-skärmen.
  ipcMain.handle(
    'journal:latest-verification',
    wrapIpcHandler(JournalLatestVerificationInputSchema, (parsed) =>
      getLatestVerification(db, parsed.fiscalYearId),
    ),
  )

  // === VAT Report ===
  ipcMain.handle(
    'vat:report',
    wrapIpcHandler(VatReportInputSchema, (parsed) =>
      getVatReport(db, parsed.fiscal_year_id),
    ),
  )

  // === Tax ===
  ipcMain.handle(
    'tax:forecast',
    wrapIpcHandler(TaxForecastInputSchema, (parsed) =>
      getTaxForecast(db, parsed.fiscalYearId),
    ),
  )

  // === SIE5 Export ===
  ipcMain.handle(
    'export:sie5',
    wrapIpcHandler(ExportSie5Schema, (parsed) =>
      exportSie5(db, { fiscalYearId: parsed.fiscal_year_id }),
    ),
  )

  // === SIE4 Export ===
  ipcMain.handle(
    'export:sie4',
    wrapIpcHandler(ExportSie4Schema, (parsed) => {
      const result = exportSie4(db, { fiscalYearId: parsed.fiscal_year_id })
      return {
        buffer: new Uint8Array(result.content),
        filename: result.filename,
      }
    }),
  )

  // === Manual Entries ===
  ipcMain.handle(
    'manual-entry:save-draft',
    wrapIpcHandler(SaveManualEntryDraftSchema, (data) =>
      saveManualEntryDraft(db, data),
    ),
  )

  ipcMain.handle(
    'manual-entry:get',
    wrapIpcHandler(ManualEntryIdSchema, (data) => getManualEntry(db, data.id)),
  )

  ipcMain.handle(
    'manual-entry:update-draft',
    wrapIpcHandler(UpdateManualEntryDraftSchema, (data) =>
      updateManualEntryDraft(db, data),
    ),
  )

  ipcMain.handle(
    'manual-entry:delete-draft',
    wrapIpcHandler(ManualEntryIdSchema, (data) =>
      deleteManualEntryDraft(db, data.id),
    ),
  )

  ipcMain.handle(
    'manual-entry:list-drafts',
    wrapIpcHandler(ManualEntryListSchema, (data) =>
      listManualEntryDrafts(db, data.fiscal_year_id),
    ),
  )

  ipcMain.handle(
    'manual-entry:list',
    wrapIpcHandler(ManualEntryListSchema, (data) =>
      listManualEntries(db, data.fiscal_year_id),
    ),
  )

  ipcMain.handle(
    'manual-entry:finalize',
    wrapIpcHandler(ManualEntryFinalizeSchema, (data) =>
      finalizeManualEntry(db, data.id, data.fiscal_year_id),
    ),
  )

  // === Journal Entry Corrections ===
  ipcMain.handle(
    'journal-entry:correct',
    wrapIpcHandler(CorrectJournalEntrySchema, (data) =>
      createCorrectionEntry(db, data),
    ),
  )

  ipcMain.handle(
    'journal-entry:can-correct',
    wrapIpcHandler(CanCorrectSchema, (data) =>
      canCorrectEntry(db, data.journal_entry_id),
    ),
  )

  ipcMain.handle(
    'journal-entry:list-imported',
    wrapIpcHandler(ListImportedEntriesSchema, (data) =>
      listImportedEntries(db, data.fiscal_year_id),
    ),
  )

  // === Excel Export ===
  ipcMain.handle(
    'export:excel',
    wrapIpcHandler(ExportExcelSchema, async (parsed) => {
      const result = await exportExcel(db, {
        fiscalYearId: parsed.fiscal_year_id,
        startDate: parsed.start_date,
        endDate: parsed.end_date,
      })
      return {
        buffer: new Uint8Array(result.buffer),
        filename: result.filename,
      }
    }),
  )

  // === Reports ===
  ipcMain.handle(
    'report:income-statement',
    wrapIpcHandler(ReportRequestSchema, (parsed) =>
      getIncomeStatement(db, parsed.fiscal_year_id, parsed.date_range),
    ),
  )

  ipcMain.handle(
    'report:balance-sheet',
    wrapIpcHandler(ReportRequestSchema, (parsed) =>
      getBalanceSheet(db, parsed.fiscal_year_id, parsed.date_range),
    ),
  )

  // === Export Write File ===
  ipcMain.handle(
    'export:write-file',
    wrapIpcHandler(ExportWriteFileRequestSchema, async (parsed) => {
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
    }),
  )

  // === Invoice PDF ===
  ipcMain.handle(
    'invoice:generate-pdf',
    wrapIpcHandler<{ invoiceId: number }, { data: string }>(
      GenerateInvoicePdfSchema,
      async (parsed) => {
        const buffer = await generateInvoicePdf(db, parsed.invoiceId)
        return { data: buffer.toString('base64') }
      },
    ),
  )

  ipcMain.handle(
    'invoice:save-pdf',
    wrapIpcHandler(
      SaveInvoicePdfSchema,
      async (
        parsed,
      ): Promise<IpcResult<{ success: boolean; filePath?: string }>> => {
        // E2E dialog bypass (M63)
        const e2ePdfPath = getE2EFilePath(parsed.defaultFileName, 'save')
        if (e2ePdfPath) {
          const buffer = Buffer.from(parsed.data, 'base64')
          fs.writeFileSync(e2ePdfPath, buffer)
          return {
            success: true,
            data: { success: true, filePath: e2ePdfPath },
          }
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
    ),
  )

  ipcMain.handle(
    'invoice:select-directory',
    wrapIpcHandler(SelectDirectorySchema, async () => {
      // E2E dialog bypass (M63) — use E2E_DOWNLOAD_DIR as chosen directory
      if (process.env.E2E_TESTING === 'true') {
        const dir = process.env.E2E_DOWNLOAD_DIR
        if (dir) {
          fs.mkdirSync(dir, { recursive: true })
          return { directory: dir }
        }
      }

      const win =
        BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openDirectory'],
      })
      if (result.canceled || !result.filePaths[0]) return null
      return { directory: result.filePaths[0] }
    }),
  )

  ipcMain.handle(
    'invoice:save-pdf-batch',
    wrapIpcHandler(SavePdfBatchSchema, async (parsed) => {
      const succeeded: number[] = []
      const failed: Array<{ invoiceId: number; error: string }> = []

      for (const inv of parsed.invoices) {
        try {
          const buffer = await generateInvoicePdf(db, inv.invoiceId)
          fs.writeFileSync(path.join(parsed.directory, inv.fileName), buffer)
          succeeded.push(inv.invoiceId)
        } catch (err) {
          // Strukturerat fel från service → använd fältet; annars logga och
          // returnera generisk text (err.message kan innehålla intern info).
          let msg: string
          if (
            err != null &&
            typeof err === 'object' &&
            'error' in err &&
            typeof (err as { error: unknown }).error === 'string'
          ) {
            msg = (err as { error: string }).error
          } else {
            log.error('[invoice:save-pdf-batch] PDF failed:', err)
            msg = 'PDF-generering misslyckades'
          }
          failed.push({ invoiceId: inv.invoiceId, error: msg })
        }
      }

      return { succeeded: succeeded.length, failed }
    }),
  )

  // === Global Search ===
  ipcMain.handle(
    'search:global',
    wrapIpcHandler(GlobalSearchSchema, (data) => globalSearch(db, data)),
  )

  // === Aging Report ===
  ipcMain.handle(
    'aging:receivables',
    wrapIpcHandler(AgingInputSchema, (data) =>
      getAgingReceivables(db, data.fiscal_year_id, data.as_of_date),
    ),
  )

  ipcMain.handle(
    'aging:payables',
    wrapIpcHandler(AgingInputSchema, (data) =>
      getAgingPayables(db, data.fiscal_year_id, data.as_of_date),
    ),
  )

  ipcMain.handle(
    'expense:select-receipt-file',
    wrapIpcHandler(SelectReceiptFileSchema, async () => {
      // E2E dialog bypass (M63 + M147) — E2E_MOCK_OPEN_FILE env points to fixture
      const e2eMockPath = getE2EMockOpenFile()
      if (e2eMockPath) return { filePath: e2eMockPath }

      const win =
        BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openFile'],
        filters: [
          {
            name: 'Kvitto',
            extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'heic'],
          },
        ],
      })
      if (result.canceled || !result.filePaths[0]) return null
      return { filePath: result.filePaths[0] }
    }),
  )

  // === SIE4 Import ===
  ipcMain.handle(
    'import:sie4-select-file',
    wrapIpcHandler(Sie4SelectFileSchema, async () => {
      // E2E dialog bypass (M63) — E2E_MOCK_OPEN_FILE env points to fixture
      const e2eMockPath = getE2EMockOpenFile()
      if (e2eMockPath) return { filePath: e2eMockPath }

      const win =
        BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openFile'],
        filters: [{ name: 'SIE', extensions: ['se', 'si', 'sie'] }],
      })
      if (result.canceled || !result.filePaths[0]) return null
      return { filePath: result.filePaths[0] }
    }),
  )

  ipcMain.handle(
    'import:sie4-validate',
    wrapIpcHandler(Sie4ValidateSchema, (data) => {
      const buffer = fs.readFileSync(data.filePath)
      const parseResult = parseSie4(buffer)
      const validation = validateSieParseResult(parseResult)
      // Sprint 57 B3a: berika med konto-namnkonflikter mot DB (merge-flöde)
      validation.conflicts = detectAccountConflicts(db, parseResult)
      return validation
    }),
  )

  ipcMain.handle(
    'import:sie4-execute',
    wrapIpcHandler(Sie4ImportSchema, (data) => {
      const buffer = fs.readFileSync(data.filePath)
      const parseResult = parseSie4(buffer)
      const validation = validateSieParseResult(parseResult)
      if (!validation.valid) {
        return {
          success: false,
          error: `SIE4-filen har ${validation.errors.length} fel: ${validation.errors[0]?.message ?? ''}`,
          code: 'VALIDATION_ERROR',
        } as const
      }
      // Sprint 57 B3a: filtrera bort stale/främmande conflict_resolutions-nycklar.
      let filteredResolutions:
        | Record<string, 'keep' | 'overwrite' | 'skip'>
        | undefined
      if (data.conflict_resolutions) {
        const conflicts = detectAccountConflicts(db, parseResult)
        const validKeys = new Set(conflicts.map((c) => c.account_number))
        filteredResolutions = {}
        for (const [key, val] of Object.entries(data.conflict_resolutions)) {
          if (validKeys.has(key)) {
            filteredResolutions[key] = val
          } else {
            log.warn(
              `sie4-execute: ignorerar conflict_resolutions[${key}] — ingen konflikt för detta konto`,
            )
          }
        }
      }
      return importSie4(db, parseResult, {
        strategy: data.strategy,
        fiscalYearId: data.fiscal_year_id,
        targetCompanyId: getActiveCompanyId(db, loadSettings()) ?? undefined,
        conflict_resolutions: filteredResolutions,
      })
    }),
  )

  // === SIE5 Import (Sprint U2) ===
  ipcMain.handle(
    'import:sie5-select-file',
    wrapIpcHandler(Sie5SelectFileSchema, async () => {
      // E2E dialog bypass (M147) — E2E_MOCK_OPEN_FILE env points to fixture
      const e2eMockPath = getE2EMockOpenFile()
      if (e2eMockPath) return { filePath: e2eMockPath }

      const win =
        BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openFile'],
        filters: [{ name: 'SIE5', extensions: ['sie', 'xml', 'se'] }],
      })
      if (result.canceled || !result.filePaths[0]) return null
      return { filePath: result.filePaths[0] }
    }),
  )

  ipcMain.handle(
    'import:sie5-validate',
    wrapIpcHandler(Sie5ValidateSchema, (data) => {
      const buffer = fs.readFileSync(data.filePath)
      const parseResult = parseSie5(buffer)
      const validation = validateSie5ParseResult(parseResult)
      validation.conflicts = detectSie5AccountConflicts(db, parseResult)
      return validation
    }),
  )

  ipcMain.handle(
    'import:sie5-execute',
    wrapIpcHandler(Sie5ImportSchema, (data) => {
      const buffer = fs.readFileSync(data.filePath)
      const parseResult = parseSie5(buffer)
      const validation = validateSie5ParseResult(parseResult)
      if (!validation.valid) {
        return {
          success: false,
          error: `SIE5-filen har ${validation.errors.length} fel: ${validation.errors[0]?.message ?? ''}`,
          code: 'VALIDATION_ERROR',
        } as const
      }
      let filteredResolutions:
        | Record<string, 'keep' | 'overwrite' | 'skip'>
        | undefined
      if (data.conflict_resolutions) {
        const conflicts = detectSie5AccountConflicts(db, parseResult)
        const validKeys = new Set(conflicts.map((c) => c.account_number))
        filteredResolutions = {}
        for (const [key, val] of Object.entries(data.conflict_resolutions)) {
          if (validKeys.has(key)) {
            filteredResolutions[key] = val
          } else {
            log.warn(
              `sie5-execute: ignorerar conflict_resolutions[${key}] — ingen konflikt för detta konto`,
            )
          }
        }
      }
      return importSie5(db, parseResult, {
        strategy: data.strategy,
        fiscalYearId: data.fiscal_year_id,
        targetCompanyId: getActiveCompanyId(db, loadSettings()) ?? undefined,
        conflict_resolutions: filteredResolutions,
      })
    }),
  )

  // === Payment Batch Export ===
  ipcMain.handle(
    'payment-batch:validate-export',
    wrapIpcHandler(PaymentBatchValidateExportSchema, (data) =>
      validateBatchForExport(db, data.batch_id),
    ),
  )

  ipcMain.handle(
    'payment-batch:export-pain001',
    wrapIpcHandler(PaymentBatchExportPain001Schema, async (data) => {
      const genResult = generatePain001(db, data.batch_id)
      if (!genResult.success) return genResult

      // E2E dialog bypass (M63)
      const e2ePainPath = getE2EFilePath(genResult.data.filename, 'save')
      if (e2ePainPath) {
        fs.writeFileSync(e2ePainPath, genResult.data.xml, 'utf8')
        markBatchExported(db, data.batch_id, 'pain001', e2ePainPath)
        return { saved: true, filePath: e2ePainPath }
      }

      const win =
        BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const { canceled, filePath } = await dialog.showSaveDialog(win!, {
        defaultPath: genResult.data.filename,
        filters: [{ name: 'XML', extensions: ['xml'] }],
      })
      if (canceled || !filePath) {
        return { saved: false }
      }

      fs.writeFileSync(filePath, genResult.data.xml, 'utf8')
      markBatchExported(db, data.batch_id, 'pain001', filePath)
      return { saved: true, filePath }
    }),
  )

  // === SEPA DD (Sprint U1 — backend-only MVP) ===
  ipcMain.handle(
    'sepa-dd:create-mandate',
    wrapIpcHandler(SepaDdCreateMandateSchema, (data) =>
      createMandate(db, data),
    ),
  )
  ipcMain.handle(
    'sepa-dd:list-mandates',
    wrapIpcHandler(SepaDdListMandatesSchema, (data) =>
      listMandates(db, data.counterparty_id),
    ),
  )
  ipcMain.handle(
    'sepa-dd:revoke-mandate',
    wrapIpcHandler(SepaDdRevokeMandateSchema, (data) =>
      revokeMandate(db, data.mandate_id),
    ),
  )
  ipcMain.handle(
    'sepa-dd:create-collection',
    wrapIpcHandler(SepaDdCreateCollectionSchema, (data) =>
      createCollection(db, data),
    ),
  )
  ipcMain.handle(
    'sepa-dd:create-batch',
    wrapIpcHandler(SepaDdCreateBatchSchema, (data) =>
      createDirectDebitBatch(db, data),
    ),
  )
  ipcMain.handle(
    'sepa-dd:list-collections',
    wrapIpcHandler(SepaDdListCollectionsSchema, (data) =>
      listSepaCollections(db, data.fiscal_year_id),
    ),
  )
  ipcMain.handle(
    'sepa-dd:list-batches',
    wrapIpcHandler(SepaDdListBatchesSchema, (data) =>
      listDirectDebitBatches(db, data.fiscal_year_id),
    ),
  )
  ipcMain.handle(
    'sepa-dd:export-pain008',
    wrapIpcHandler(SepaDdExportPain008Schema, async (data) => {
      const genResult = generatePain008(db, data.batch_id)
      if (!genResult.success) return genResult

      // E2E dialog bypass (M63 / M147)
      const e2ePath = getE2EFilePath(genResult.data.filename, 'save')
      if (e2ePath) {
        fs.writeFileSync(e2ePath, genResult.data.xml, 'utf8')
        markBatchExported(db, data.batch_id, 'pain008', e2ePath)
        return { saved: true, filePath: e2ePath }
      }

      const win =
        BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
      const { canceled, filePath } = await dialog.showSaveDialog(win!, {
        defaultPath: genResult.data.filename,
        filters: [{ name: 'XML', extensions: ['xml'] }],
      })
      if (canceled || !filePath) {
        return { saved: false }
      }

      fs.writeFileSync(filePath, genResult.data.xml, 'utf8')
      markBatchExported(db, data.batch_id, 'pain008', filePath)
      return { saved: true, filePath }
    }),
  )

  // === Accruals ===
  ipcMain.handle(
    'accrual:create',
    wrapIpcHandler(AccrualCreateSchema, (data) =>
      createAccrualSchedule(db, data),
    ),
  )

  ipcMain.handle(
    'accrual:list',
    wrapIpcHandler(AccrualListSchema, (data) =>
      getAccrualSchedules(db, data.fiscal_year_id),
    ),
  )

  ipcMain.handle(
    'accrual:execute',
    wrapIpcHandler(AccrualExecuteSchema, (data) =>
      executeAccrualForPeriod(db, data.schedule_id, data.period_number),
    ),
  )

  ipcMain.handle(
    'accrual:execute-all',
    wrapIpcHandler(AccrualExecuteAllSchema, (data) =>
      executeAllForPeriod(db, data.fiscal_year_id, data.period_number),
    ),
  )

  ipcMain.handle(
    'accrual:deactivate',
    wrapIpcHandler(AccrualDeactivateSchema, (data) =>
      deactivateSchedule(db, data.schedule_id),
    ),
  )

  // === Budget ===
  ipcMain.handle(
    'budget:lines',
    wrapIpcHandler(BudgetLinesSchema, () => getBudgetLines()),
  )

  ipcMain.handle(
    'budget:get',
    wrapIpcHandler(BudgetGetSchema, (data) =>
      getBudgetTargets(db, data.fiscal_year_id),
    ),
  )

  ipcMain.handle(
    'budget:save',
    wrapIpcHandler(BudgetSaveSchema, (data) =>
      saveBudgetTargets(db, data.fiscal_year_id, data.targets),
    ),
  )

  ipcMain.handle(
    'budget:variance',
    wrapIpcHandler(BudgetVarianceSchema, (data) =>
      getBudgetVsActual(db, data.fiscal_year_id),
    ),
  )

  ipcMain.handle(
    'budget:copy-from-previous',
    wrapIpcHandler(BudgetCopySchema, (data) =>
      copyBudgetFromPreviousFy(
        db,
        data.target_fiscal_year_id,
        data.source_fiscal_year_id,
      ),
    ),
  )

  ipcMain.handle(
    'budget:getSummaryByYear',
    wrapIpcHandler(BudgetSummaryByYearSchema, (data) =>
      getBudgetSummaryByYear(db, data.fiscal_year_id),
    ),
  )

  // === Depreciation (Sprint 53 F62) ===
  ipcMain.handle(
    'depreciation:create-asset',
    wrapIpcHandler(DepreciationCreateAssetSchema, (data) => {
      const companyId = getActiveCompanyId(db, loadSettings())
      if (!companyId) {
        throw { code: 'VALIDATION_ERROR', error: 'Inget företag hittat.' }
      }
      return createFixedAsset(db, data, companyId)
    }),
  )

  ipcMain.handle(
    'depreciation:update-asset',
    wrapIpcHandler(DepreciationUpdateAssetSchema, (data) =>
      updateFixedAsset(db, data.id, data.input),
    ),
  )

  ipcMain.handle(
    'depreciation:list',
    wrapIpcHandler(DepreciationListSchema, (data) =>
      listFixedAssets(db, data.fiscal_year_id),
    ),
  )

  ipcMain.handle(
    'depreciation:get',
    wrapIpcHandler(DepreciationIdSchema, (data) => getFixedAsset(db, data.id)),
  )

  ipcMain.handle(
    'depreciation:dispose',
    wrapIpcHandler(DepreciationDisposeSchema, (data) =>
      disposeFixedAsset(
        db,
        data.id,
        data.disposed_date,
        data.generate_journal_entry ?? false,
        data.sale_price_ore ?? 0,
        data.proceeds_account ?? null,
      ),
    ),
  )

  ipcMain.handle(
    'depreciation:delete',
    wrapIpcHandler(DepreciationIdSchema, (data) =>
      deleteFixedAsset(db, data.id),
    ),
  )

  ipcMain.handle(
    'depreciation:execute-period',
    wrapIpcHandler(DepreciationExecutePeriodSchema, (data) =>
      executeDepreciationPeriod(db, data.fiscal_year_id, data.period_end_date),
    ),
  )

  // === Cash Flow (Sprint 53 F65) ===
  ipcMain.handle(
    'report:cash-flow',
    wrapIpcHandler(CashFlowInputSchema, (data) =>
      getCashFlowStatement(db, data.fiscal_year_id),
    ),
  )

  // === Bank statement / reconciliation (Sprint 55 F66-a) ===
  ipcMain.handle(
    'bank-statement:import',
    wrapIpcHandler(BankStatementImportSchema, (data) =>
      importBankStatement(db, data),
    ),
  )

  ipcMain.handle(
    'bank-statement:list',
    wrapIpcHandler(BankStatementListSchema, (data) =>
      listBankStatements(db, data.fiscal_year_id),
    ),
  )

  ipcMain.handle(
    'bank-statement:get',
    wrapIpcHandler(BankStatementGetSchema, (data) =>
      getBankStatement(db, data.statement_id),
    ),
  )

  ipcMain.handle(
    'bank-statement:match-transaction',
    wrapIpcHandler(BankMatchTransactionSchema, (data) =>
      matchBankTransaction(db, data),
    ),
  )

  ipcMain.handle(
    'bank-statement:suggest-matches',
    wrapIpcHandler(BankStatementSuggestMatchesSchema, (data) =>
      suggestMatchesForStatement(db, data.statement_id),
    ),
  )

  ipcMain.handle(
    'bank-statement:unmatch-transaction',
    wrapIpcHandler(BankUnmatchTransactionSchema, (data) =>
      unmatchBankTransaction(db, data),
    ),
  )

  ipcMain.handle(
    'bank-statement:unmatch-batch',
    wrapIpcHandler(BankUnmatchBatchSchema, (data) =>
      unmatchBankBatch(db, data),
    ),
  )

  ipcMain.handle(
    'bank-statement:create-fee-entry',
    wrapIpcHandler(BankCreateFeeEntrySchema, (data) =>
      createBankFeeEntry(db, data),
    ),
  )

  ipcMain.handle('bank-tx-mapping:list', () => listBankTxMappings(db))

  ipcMain.handle(
    'bank-tx-mapping:upsert',
    wrapIpcHandler(BankTxMappingUpsertSchema, (data) =>
      upsertBankTxMapping(db, data),
    ),
  )

  ipcMain.handle(
    'bank-tx-mapping:delete',
    wrapIpcHandler(BankTxMappingDeleteSchema, (data) =>
      deleteBankTxMapping(db, data),
    ),
  )

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

  // Sprint 16 — Live verifikat-preview (ADR 006). Read-only kanal som
  // beräknar journal-lines från form-input utan att skriva till DB.
  //
  // Sprint 20 — defense-in-depth: aktivera `pragma query_only = ON` för
  // anropets duration. Pragmat blockerar INSERT/UPDATE/DELETE på connection-
  // nivå. better-sqlite3 delar connection mellan handlers, så vi måste
  // återställa till OFF efter — try/finally garanterar det även vid kast.
  // En framtida bug som av misstag introducerar mutation i preview-pathen
  // failar då med SQLITE_READONLY istället för att skriva data.
  ipcMain.handle(
    'preview:journal-lines',
    wrapIpcHandler(PreviewJournalLinesInputSchema, (data) => {
      db.pragma('query_only = ON')
      try {
        return previewJournalLines(db, data)
      } finally {
        db.pragma('query_only = OFF')
      }
    }),
  )

  // === Receipts / Inkorgen (Sprint VS-108) ===
  // Validering via Zod-scheman; service hanterar fil-IO och dedup.
  ipcMain.handle(
    'receipt:list',
    wrapIpcHandler(ReceiptListInputSchema, (data) => listReceipts(db, data)),
  )
  ipcMain.handle(
    'receipt:create',
    wrapIpcHandler(CreateReceiptInputSchema, (data) => createReceipt(db, data)),
  )
  ipcMain.handle(
    'receipt:update-notes',
    wrapIpcHandler(UpdateReceiptNotesInputSchema, (data) =>
      updateReceiptNotes(db, data),
    ),
  )
  ipcMain.handle(
    'receipt:archive',
    wrapIpcHandler(ArchiveReceiptInputSchema, (data) =>
      archiveReceipt(db, data),
    ),
  )
  ipcMain.handle(
    'receipt:archive-bulk',
    wrapIpcHandler(BulkArchiveReceiptInputSchema, (data) =>
      bulkArchiveReceipts(db, data),
    ),
  )
  ipcMain.handle(
    'receipt:counts',
    wrapIpcHandler(ReceiptCountsInputSchema, (data) =>
      getReceiptCounts(db, data),
    ),
  )
  ipcMain.handle(
    'receipt:delete',
    wrapIpcHandler(ArchiveReceiptInputSchema, (data) =>
      deleteReceipt(db, data),
    ),
  )
  ipcMain.handle(
    'receipt:link-to-expense',
    wrapIpcHandler(LinkReceiptToExpenseInputSchema, (data) =>
      linkReceiptToExpense(db, data),
    ),
  )

  // Sprint VS-113: Månadsstängnings-checks (advisory).
  ipcMain.handle(
    'period:checks',
    wrapIpcHandler(PeriodChecksInputSchema, (data) =>
      getPeriodChecks(db, data),
    ),
  )

  // Test-only IPC endpoints — registered ONLY when FRITT_TEST=1.
  // Conditional require undviker att ladda test-handlers i produktion;
  // top-level import skulle bundla in dem oavsett.
  if (process.env.FRITT_TEST === '1') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { registerTestHandlers } = require('./ipc/test-handlers')
    registerTestHandlers(db)
  }
}
