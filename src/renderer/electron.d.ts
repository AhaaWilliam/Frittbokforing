import type {
  HealthCheckResponse,
  Company,
  CreateCompanyInput,
  UpdateCompanyInput,
  JournalEntry,
  IpcResult,
  FiscalYear,
  FiscalPeriod,
  Invoice,
  InvoiceWithLines,
  SaveDraftInput,
  UpdateDraftInput,
  Counterparty,
  CreateCounterpartyInput,
  UpdateCounterpartyInput,
  Product,
  CustomerPrice,
  CreateProductInput,
  UpdateProductInput,
  PriceResult,
  VatCode,
  Account,
  DashboardSummary,
  TaxForecast,
  VatReport,
  IncomeStatementResult,
  BalanceSheetResult,
  ExportWriteFileResult,
  SaveExpenseDraftInput,
  UpdateExpenseDraftInput,
  SaveManualEntryDraftInput,
  UpdateManualEntryDraftInput,
} from '../shared/types'
import type { GlobalSearchResponse } from '../shared/search-types'

interface ElectronAPI {
  healthCheck: () => Promise<HealthCheckResponse>
  createCompany: (data: CreateCompanyInput) => Promise<IpcResult<Company>>
  getCompany: () => Promise<IpcResult<Company | null>>
  updateCompany: (data: UpdateCompanyInput) => Promise<IpcResult<Company>>
  listFiscalYears: () => Promise<IpcResult<FiscalYear[]>>
  createNewFiscalYear: (data: {
    confirmBookResult: boolean
    netResultOre?: number
  }) => Promise<
    IpcResult<{
      fiscalYear: FiscalYear
      openingBalance: JournalEntry
    }>
  >
  switchFiscalYear: (data: {
    fiscalYearId: number
  }) => Promise<IpcResult<FiscalYear>>
  reTransferOpeningBalance: () => Promise<IpcResult<JournalEntry>>
  getNetResult: (data: { fiscalYearId: number }) => Promise<
    IpcResult<{
      netResultOre: number
      isAlreadyBooked: boolean
    }>
  >
  listFiscalPeriods: (data: {
    fiscal_year_id: number
  }) => Promise<IpcResult<FiscalPeriod[]>>
  closePeriod: (data: { period_id: number }) => Promise<IpcResult<FiscalPeriod>>
  reopenPeriod: (data: {
    period_id: number
  }) => Promise<IpcResult<FiscalPeriod>>
  listCounterparties: (data: {
    search?: string
    type?: string
    active_only?: boolean
  }) => Promise<IpcResult<Counterparty[]>>
  getCounterparty: (data: { id: number }) => Promise<IpcResult<Counterparty | null>>
  createCounterparty: (
    data: CreateCounterpartyInput,
  ) => Promise<IpcResult<Counterparty>>
  updateCounterparty: (
    data: UpdateCounterpartyInput,
  ) => Promise<IpcResult<Counterparty>>
  deactivateCounterparty: (data: {
    id: number
  }) => Promise<IpcResult<Counterparty>>
  listProducts: (data: {
    search?: string
    type?: string
    active_only?: boolean
  }) => Promise<IpcResult<Product[]>>
  getProduct: (data: {
    id: number
  }) => Promise<IpcResult<(Product & { customer_prices: CustomerPrice[] }) | null>>
  createProduct: (data: CreateProductInput) => Promise<IpcResult<Product>>
  updateProduct: (data: UpdateProductInput) => Promise<IpcResult<Product>>
  deactivateProduct: (data: { id: number }) => Promise<IpcResult<Product>>
  setCustomerPrice: (data: {
    product_id: number
    counterparty_id: number
    price_ore: number
  }) => Promise<IpcResult<CustomerPrice>>
  removeCustomerPrice: (data: {
    product_id: number
    counterparty_id: number
  }) => Promise<IpcResult<undefined>>
  getPriceForCustomer: (data: {
    product_id: number
    counterparty_id: number
  }) => Promise<IpcResult<PriceResult>>
  listVatCodes: (data: { direction?: string }) => Promise<IpcResult<VatCode[]>>
  listAccounts: (data: {
    fiscal_rule: string
    class?: number
    is_active?: boolean
  }) => Promise<IpcResult<Account[]>>
  listAllAccounts: (data: { is_active?: boolean }) => Promise<IpcResult<Account[]>>
  accountCreate: (data: {
    account_number: string
    name: string
    k2_allowed: boolean
    k3_only: boolean
  }) => Promise<IpcResult<{ account_number: string }>>
  accountUpdate: (data: {
    account_number: string
    name: string
    k2_allowed: boolean
    k3_only: boolean
  }) => Promise<IpcResult<{ success: true }>>
  accountToggleActive: (data: {
    account_number: string
    is_active: boolean
  }) => Promise<IpcResult<{ success: true }>>
  getAccountStatement: (data: {
    fiscal_year_id: number
    account_number: string
    date_from?: string
    date_to?: string
  }) => Promise<IpcResult<{
    account_number: string
    account_name: string
    lines: Array<{
      date: string
      verification_series: string
      verification_number: number
      description: string
      debit_ore: number
      credit_ore: number
      running_balance_ore: number
    }>
    summary: {
      opening_balance_ore: number
      total_debit_ore: number
      total_credit_ore: number
      closing_balance_ore: number
      transaction_count: number
    }
  }>>
  backupCreate: () => Promise<{ filePath: string | null }>
  backupRestore: () => Promise<{ restored: boolean; message?: string }>
  // Invoices
  payInvoice: (data: {
    invoice_id: number
    amount_ore: number
    payment_date: string
    payment_method: string
    account_number: string
  }) => Promise<
    IpcResult<{
      invoice: Invoice
      payment: import('../shared/types').InvoicePayment
    }>
  >
  payInvoicesBulk: (data: Record<string, unknown>) => Promise<IpcResult<import('../shared/types').BulkPaymentResult>>
  getPayments: (data: {
    invoice_id: number
  }) => Promise<IpcResult<import('../shared/types').InvoicePayment[]>>
  listInvoices: (data: {
    fiscal_year_id: number
    status?: string
    search?: string
    sort_by?: string
    sort_order?: string
  }) => Promise<
    IpcResult<{
      items: import('../shared/types').InvoiceListItem[]
      counts: import('../shared/types').InvoiceStatusCounts
    }>
  >
  finalizeInvoice: (data: {
    id: number
  }) => Promise<IpcResult<InvoiceWithLines>>
  updateSentInvoice: (data: {
    id: number
    notes?: string | null
    payment_terms?: number
    due_date?: string
  }) => Promise<IpcResult<Invoice>>
  saveDraft: (data: SaveDraftInput) => Promise<IpcResult<InvoiceWithLines>>
  getDraft: (data: { id: number }) => Promise<IpcResult<InvoiceWithLines | null>>
  updateDraft: (data: UpdateDraftInput) => Promise<IpcResult<InvoiceWithLines>>
  deleteDraft: (data: { id: number }) => Promise<IpcResult<undefined>>
  listDrafts: (data: {
    fiscal_year_id: number
  }) => Promise<IpcResult<(Invoice & { counterparty_name: string })[]>>
  nextInvoiceNumber: (data: {
    fiscal_year_id: number
  }) => Promise<IpcResult<{ preview: number }>>
  createCreditNoteDraft: (data: {
    original_invoice_id: number
    fiscal_year_id: number
  }) => Promise<IpcResult<InvoiceWithLines>>
  // Expenses
  saveExpenseDraft: (
    data: SaveExpenseDraftInput,
  ) => Promise<IpcResult<import('../shared/types').ExpenseWithLines>>
  getExpenseDraft: (data: {
    id: number
  }) => Promise<IpcResult<import('../shared/types').ExpenseWithLines | null>>
  updateExpenseDraft: (
    data: UpdateExpenseDraftInput,
  ) => Promise<IpcResult<import('../shared/types').ExpenseWithLines>>
  deleteExpenseDraft: (data: { id: number }) => Promise<IpcResult<undefined>>
  listExpenseDrafts: (data: {
    fiscal_year_id: number
  }) => Promise<IpcResult<import('../shared/types').ExpenseDraftListItem[]>>
  finalizeExpense: (data: {
    id: number
  }) => Promise<IpcResult<import('../shared/types').ExpenseWithLines>>
  payExpense: (data: {
    expense_id: number
    amount_ore: number
    payment_date: string
    payment_method: string
    account_number: string
  }) => Promise<
    IpcResult<{
      expense: import('../shared/types').Expense
      payment: import('../shared/types').ExpensePayment
    }>
  >
  payExpensesBulk: (data: Record<string, unknown>) => Promise<IpcResult<import('../shared/types').BulkPaymentResult>>
  getExpensePayments: (data: {
    expense_id: number
  }) => Promise<IpcResult<import('../shared/types').ExpensePayment[]>>
  getExpense: (data: {
    id: number
  }) => Promise<IpcResult<import('../shared/types').ExpenseDetail | null>>
  listExpenses: (data: {
    fiscal_year_id: number
    status?: string
    search?: string
    sort_by?: string
    sort_order?: 'asc' | 'desc'
  }) => Promise<
    IpcResult<{
      expenses: import('../shared/types').ExpenseListItem[]
      counts: import('../shared/types').ExpenseStatusCounts
    }>
  >
  createExpenseCreditNoteDraft: (data: {
    original_expense_id: number
    fiscal_year_id: number
  }) => Promise<IpcResult<{ id: number }>>
  // Invoice PDF
  generateInvoicePdf: (data: {
    invoiceId: number
  }) => Promise<IpcResult<{ data: string }>>
  saveInvoicePdf: (data: {
    data: string
    defaultFileName: string
  }) => Promise<IpcResult<{ success: boolean; filePath?: string }>>
  selectDirectory: () => Promise<IpcResult<{ directory: string } | null>>
  savePdfBatch: (data: {
    directory: string
    invoices: Array<{ invoiceId: number; fileName: string }>
  }) => Promise<IpcResult<{
    succeeded: number
    failed: Array<{ invoiceId: number; error: string }>
  }>>
  // Dashboard
  getDashboardSummary: (data: {
    fiscalYearId: number
  }) => Promise<IpcResult<DashboardSummary>>
  // VAT Report
  getVatReport: (input: {
    fiscal_year_id: number
  }) => Promise<IpcResult<VatReport>>
  // SIE5 Export
  exportSie5: (input: { fiscal_year_id: number }) => Promise<IpcResult<string>>
  // Manual Entries
  saveManualEntryDraft: (
    data: SaveManualEntryDraftInput,
  ) => Promise<IpcResult<{ id: number }>>
  getManualEntry: (data: {
    id: number
  }) => Promise<IpcResult<import('../shared/types').ManualEntryWithLines>>
  updateManualEntryDraft: (
    data: UpdateManualEntryDraftInput,
  ) => Promise<IpcResult<void>>
  deleteManualEntryDraft: (data: { id: number }) => Promise<IpcResult<void>>
  listManualEntryDrafts: (data: {
    fiscal_year_id: number
  }) => Promise<IpcResult<import('../shared/types').ManualEntry[]>>
  listManualEntries: (data: {
    fiscal_year_id: number
  }) => Promise<IpcResult<import('../shared/types').ManualEntryListItem[]>>
  finalizeManualEntry: (data: {
    id: number
    fiscal_year_id: number
  }) => Promise<
    IpcResult<{ journalEntryId: number; verificationNumber: number }>
  >
  // Journal Entry Corrections
  correctJournalEntry: (data: {
    journal_entry_id: number
    fiscal_year_id: number
  }) => Promise<
    IpcResult<{
      correction_entry_id: number
      correction_verification_number: number
      original_entry_id: number
    }>
  >
  canCorrectJournalEntry: (data: {
    journal_entry_id: number
  }) => Promise<IpcResult<{ canCorrect: boolean; reason?: string }>>
  // Excel Export
  exportExcel: (input: {
    fiscal_year_id: number
    start_date?: string
    end_date?: string
  }) => Promise<
    IpcResult<{
      buffer: Uint8Array
      filename: string
    }>
  >
  // SIE4 Export
  exportSie4: (input: { fiscal_year_id: number }) => Promise<
    IpcResult<{
      buffer: Uint8Array
      filename: string
    }>
  >
  // Reports
  getIncomeStatement: (input: {
    fiscal_year_id: number
    date_range?: { from: string; to: string }
  }) => Promise<IpcResult<IncomeStatementResult>>
  getBalanceSheet: (input: {
    fiscal_year_id: number
    date_range?: { from: string; to: string }
  }) => Promise<IpcResult<BalanceSheetResult>>
  // Export Write File
  exportWriteFile: (input: {
    format: 'sie5' | 'sie4' | 'excel'
    fiscal_year_id: number
    date_range?: { from: string; to: string }
  }) => Promise<IpcResult<ExportWriteFileResult>>
  // Tax
  getTaxForecast: (data: {
    fiscalYearId: number
  }) => Promise<IpcResult<TaxForecast>>
  // Global Search
  globalSearch: (data: {
    query: string
    fiscal_year_id: number
    limit?: number
  }) => Promise<IpcResult<GlobalSearchResponse>>
  // Aging Report
  getAgingReceivables: (data: {
    fiscal_year_id: number
    as_of_date?: string
  }) => Promise<IpcResult<import('../main/services/aging-service').AgingReport>>
  getAgingPayables: (data: {
    fiscal_year_id: number
    as_of_date?: string
  }) => Promise<IpcResult<import('../main/services/aging-service').AgingReport>>
  // SIE4 Import
  sie4SelectFile: () => Promise<IpcResult<{ filePath: string } | null>>
  sie4Validate: (data: {
    filePath: string
  }) => Promise<IpcResult<import('../main/services/sie4/sie4-import-validator').SieValidationResult>>
  sie4Import: (data: {
    filePath: string
    strategy: 'new' | 'merge'
    fiscal_year_id?: number
    conflict_resolutions?: Record<string, 'keep' | 'overwrite' | 'skip'>
  }) => Promise<IpcResult<import('../main/services/sie4/sie4-import-service').ImportResult>>
  // Payment batch export
  validateBatchExport: (data: {
    batch_id: number
  }) => Promise<IpcResult<import('../shared/types').PaymentExportValidation>>
  exportPain001: (data: {
    batch_id: number
  }) => Promise<IpcResult<{ saved: boolean; filePath?: string }>>
  // Accruals
  createAccrualSchedule: (data: import('../shared/types').CreateAccrualScheduleInput) => Promise<IpcResult<{ id: number }>>
  getAccrualSchedules: (data: { fiscal_year_id: number }) => Promise<IpcResult<import('../shared/types').AccrualScheduleWithStatus[]>>
  executeAccrual: (data: { schedule_id: number; period_number: number }) => Promise<IpcResult<{ journalEntryId: number }>>
  executeAllAccruals: (data: { fiscal_year_id: number; period_number: number }) => Promise<IpcResult<{ executed: number; failed: Array<{ scheduleId: number; error: string }> }>>
  deactivateAccrual: (data: { schedule_id: number }) => Promise<IpcResult<void>>
  // Budget
  getBudgetLines: (data: Record<string, never>) => Promise<IpcResult<import('../shared/types').BudgetLineMeta[]>>
  getBudgetTargets: (data: {
    fiscal_year_id: number
  }) => Promise<IpcResult<import('../shared/types').BudgetTarget[]>>
  saveBudgetTargets: (data: {
    fiscal_year_id: number
    targets: Array<{ line_id: string; period_number: number; amount_ore: number }>
  }) => Promise<IpcResult<{ count: number }>>
  getBudgetVsActual: (data: {
    fiscal_year_id: number
  }) => Promise<IpcResult<import('../shared/types').BudgetVarianceReport>>
  copyBudgetFromPreviousFy: (data: {
    target_fiscal_year_id: number
    source_fiscal_year_id: number
  }) => Promise<IpcResult<{ count: number }>>
  // Depreciation (Sprint 53 F62)
  createFixedAsset: (
    data: import('../shared/types').CreateFixedAssetInput,
  ) => Promise<IpcResult<{ id: number; scheduleCount: number }>>
  listFixedAssets: (data: { fiscal_year_id?: number }) => Promise<
    IpcResult<import('../shared/types').FixedAssetWithAccumulation[]>
  >
  getFixedAsset: (data: { id: number }) => Promise<
    IpcResult<import('../shared/types').FixedAssetWithSchedule>
  >
  disposeFixedAsset: (data: {
    id: number
    disposed_date: string
    generate_journal_entry?: boolean
    sale_price_ore?: number
    proceeds_account?: string | null
  }) => Promise<IpcResult<void>>
  deleteFixedAsset: (data: { id: number }) => Promise<IpcResult<void>>
  executeDepreciationPeriod: (data: {
    fiscal_year_id: number
    period_end_date: string
  }) => Promise<IpcResult<import('../shared/types').ExecuteDepreciationPeriodResult>>
  // Cash Flow (Sprint 53 F65)
  getCashFlowStatement: (data: { fiscal_year_id: number }) => Promise<
    IpcResult<import('../../main/services/cash-flow-service').CashFlowReport>
  >
  // Bank statement / reconciliation (Sprint 55 F66-a)
  importBankStatement: (data: {
    company_id: number
    fiscal_year_id: number
    xml_content: string
  }) => Promise<IpcResult<import('../../main/services/bank/bank-statement-service').ImportBankStatementResult>>
  listBankStatements: (data: { fiscal_year_id: number }) => Promise<
    IpcResult<import('../../main/services/bank/bank-statement-service').BankStatementSummary[]>
  >
  getBankStatement: (data: { statement_id: number }) => Promise<
    IpcResult<import('../../main/services/bank/bank-statement-service').BankStatementDetail | null>
  >
  matchBankTransaction: (data: {
    bank_transaction_id: number
    matched_entity_type: 'invoice' | 'expense'
    matched_entity_id: number
    payment_account: string
  }) => Promise<IpcResult<import('../../main/services/bank/bank-match-service').MatchBankTransactionResult>>
  suggestBankMatches: (data: { statement_id: number }) => Promise<
    IpcResult<import('../../main/services/bank/bank-match-suggester').TxSuggestion[]>
  >
  unmatchBankTransaction: (data: {
    bank_transaction_id: number
    correction_description?: string
  }) => Promise<IpcResult<import('../../main/services/bank/bank-unmatch-service').BankUnmatchResult>>
  // Settings
  getSetting: (key: string) => Promise<unknown>
  setSetting: (key: string, value: unknown) => Promise<void>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export {}
