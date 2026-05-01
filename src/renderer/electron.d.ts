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
  listCompanies: () => Promise<IpcResult<Company[]>>
  switchCompany: (data: { company_id: number }) => Promise<IpcResult<Company>>
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
    company_id: number
    search?: string
    type?: string
    active_only?: boolean
  }) => Promise<IpcResult<Counterparty[]>>
  getCounterparty: (data: {
    id: number
    company_id: number
  }) => Promise<IpcResult<Counterparty | null>>
  createCounterparty: (
    data: CreateCounterpartyInput,
  ) => Promise<IpcResult<Counterparty>>
  updateCounterparty: (
    data: UpdateCounterpartyInput,
  ) => Promise<IpcResult<Counterparty>>
  deactivateCounterparty: (data: {
    id: number
    company_id: number
  }) => Promise<IpcResult<Counterparty>>
  setCounterpartyDefaultAccount: (data: {
    id: number
    company_id: number
    field: 'default_expense_account' | 'default_revenue_account'
    account_number: string | null
  }) => Promise<IpcResult<Counterparty>>
  listProducts: (data: {
    company_id: number
    search?: string
    type?: string
    active_only?: boolean
  }) => Promise<IpcResult<Product[]>>
  getProduct: (data: {
    id: number
    company_id: number
  }) => Promise<
    IpcResult<(Product & { customer_prices: CustomerPrice[] }) | null>
  >
  createProduct: (data: CreateProductInput) => Promise<IpcResult<Product>>
  updateProduct: (data: UpdateProductInput) => Promise<IpcResult<Product>>
  deactivateProduct: (data: {
    id: number
    company_id: number
  }) => Promise<IpcResult<Product>>
  setCustomerPrice: (data: {
    company_id: number
    product_id: number
    counterparty_id: number
    price_ore: number
  }) => Promise<IpcResult<CustomerPrice>>
  removeCustomerPrice: (data: {
    company_id: number
    product_id: number
    counterparty_id: number
  }) => Promise<IpcResult<undefined>>
  getPriceForCustomer: (data: {
    company_id: number
    product_id: number
    counterparty_id: number
  }) => Promise<IpcResult<PriceResult>>
  listVatCodes: (data: { direction?: string }) => Promise<IpcResult<VatCode[]>>
  listAccounts: (data: {
    fiscal_rule: string
    class?: number
    is_active?: boolean
  }) => Promise<IpcResult<Account[]>>
  listAllAccounts: (data: {
    is_active?: boolean
  }) => Promise<IpcResult<Account[]>>
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
  }) => Promise<
    IpcResult<{
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
    }>
  >
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
  payInvoicesBulk: (
    data: Record<string, unknown>,
  ) => Promise<IpcResult<import('../shared/types').BulkPaymentResult>>
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
  getDraft: (data: {
    id: number
  }) => Promise<IpcResult<InvoiceWithLines | null>>
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
  attachReceipt: (data: {
    expense_id: number
    source_file_path: string
  }) => Promise<IpcResult<{ receipt_path: string }>>
  selectReceiptFile: () => Promise<IpcResult<{ filePath: string } | null>>
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
  payExpensesBulk: (
    data: Record<string, unknown>,
  ) => Promise<IpcResult<import('../shared/types').BulkPaymentResult>>
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
  }) => Promise<
    IpcResult<{
      succeeded: number
      failed: Array<{ invoiceId: number; error: string }>
    }>
  >
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
  listImportedEntries: (data: {
    fiscal_year_id: number
  }) => Promise<IpcResult<import('../shared/types').ImportedEntryListItem[]>>
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
  }) => Promise<
    IpcResult<
      import('../main/services/sie4/sie4-import-validator').SieValidationResult
    >
  >
  sie4Import: (data: {
    filePath: string
    strategy: 'new' | 'merge'
    fiscal_year_id?: number
    conflict_resolutions?: Record<string, 'keep' | 'overwrite' | 'skip'>
  }) => Promise<
    IpcResult<import('../main/services/sie4/sie4-import-service').ImportResult>
  >
  // SIE5 Import (Sprint U2)
  sie5SelectFile: () => Promise<IpcResult<{ filePath: string } | null>>
  sie5Validate: (data: {
    filePath: string
  }) => Promise<
    IpcResult<
      import('../main/services/sie4/sie4-import-validator').SieValidationResult
    >
  >
  sie5Import: (data: {
    filePath: string
    strategy: 'new' | 'merge'
    fiscal_year_id?: number
    conflict_resolutions?: Record<string, 'keep' | 'overwrite' | 'skip'>
  }) => Promise<
    IpcResult<import('../main/services/sie4/sie4-import-service').ImportResult>
  >
  // Payment batch export
  validateBatchExport: (data: {
    batch_id: number
  }) => Promise<IpcResult<import('../shared/types').PaymentExportValidation>>
  exportPain001: (data: {
    batch_id: number
  }) => Promise<IpcResult<{ saved: boolean; filePath?: string }>>
  // SEPA DD (Sprint U1 — backend-only MVP)
  sepaDdCreateMandate: (data: {
    counterparty_id: number
    mandate_reference: string
    signature_date: string
    sequence_type: 'OOFF' | 'FRST' | 'RCUR' | 'FNAL'
    iban: string
    bic?: string | null
  }) => Promise<
    IpcResult<import('../main/services/payment/sepa-dd-service').SepaMandate>
  >
  sepaDdListMandates: (data: {
    counterparty_id: number
  }) => Promise<
    IpcResult<import('../main/services/payment/sepa-dd-service').SepaMandate[]>
  >
  sepaDdRevokeMandate: (data: {
    mandate_id: number
  }) => Promise<IpcResult<{ id: number }>>
  sepaDdCreateCollection: (data: {
    fiscal_year_id: number
    mandate_id: number
    invoice_id?: number | null
    amount_ore: number
    collection_date: string
  }) => Promise<
    IpcResult<import('../main/services/payment/sepa-dd-service').SepaCollection>
  >
  sepaDdCreateBatch: (data: {
    fiscal_year_id: number
    collection_ids: number[]
    payment_date: string
    account_number: string
    user_note?: string | null
  }) => Promise<IpcResult<{ batch_id: number; collection_count: number }>>
  sepaDdExportPain008: (data: {
    batch_id: number
  }) => Promise<IpcResult<{ saved: boolean; filePath?: string }>>
  sepaDdListCollections: (data: { fiscal_year_id: number }) => Promise<
    IpcResult<
      Array<{
        id: number
        fiscal_year_id: number
        mandate_id: number
        invoice_id: number | null
        amount_ore: number
        collection_date: string
        status: string
        payment_batch_id: number | null
        created_at: string
        mandate_reference: string
        counterparty_id: number
        counterparty_name: string
        invoice_number: number | null
      }>
    >
  >
  sepaDdListBatches: (data: { fiscal_year_id: number }) => Promise<
    IpcResult<
      Array<{
        id: number
        fiscal_year_id: number
        payment_date: string
        account_number: string
        status: string
        user_note: string | null
        exported_at: string | null
        export_format: string | null
        export_filename: string | null
        created_at: string
        collection_count: number
        total_amount_ore: number
      }>
    >
  >
  // Accruals
  createAccrualSchedule: (
    data: import('../shared/types').CreateAccrualScheduleInput,
  ) => Promise<IpcResult<{ id: number }>>
  getAccrualSchedules: (data: {
    fiscal_year_id: number
  }) => Promise<
    IpcResult<import('../shared/types').AccrualScheduleWithStatus[]>
  >
  executeAccrual: (data: {
    schedule_id: number
    period_number: number
  }) => Promise<IpcResult<{ journalEntryId: number }>>
  executeAllAccruals: (data: {
    fiscal_year_id: number
    period_number: number
  }) => Promise<
    IpcResult<{
      executed: number
      failed: Array<{ scheduleId: number; error: string }>
    }>
  >
  deactivateAccrual: (data: { schedule_id: number }) => Promise<IpcResult<void>>
  // Budget
  getBudgetLines: (
    data: Record<string, never>,
  ) => Promise<IpcResult<import('../shared/types').BudgetLineMeta[]>>
  getBudgetTargets: (data: {
    fiscal_year_id: number
  }) => Promise<IpcResult<import('../shared/types').BudgetTarget[]>>
  saveBudgetTargets: (data: {
    fiscal_year_id: number
    targets: Array<{
      line_id: string
      period_number: number
      amount_ore: number
    }>
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
  updateFixedAsset: (data: {
    id: number
    input: import('../shared/types').UpdateFixedAssetInput
  }) => Promise<IpcResult<{ scheduleCount: number }>>
  listFixedAssets: (data: {
    fiscal_year_id?: number
  }) => Promise<
    IpcResult<import('../shared/types').FixedAssetWithAccumulation[]>
  >
  getFixedAsset: (data: {
    id: number
  }) => Promise<IpcResult<import('../shared/types').FixedAssetWithSchedule>>
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
  }) => Promise<
    IpcResult<import('../shared/types').ExecuteDepreciationPeriodResult>
  >
  // Cash Flow (Sprint 53 F65)
  getCashFlowStatement: (data: {
    fiscal_year_id: number
  }) => Promise<
    IpcResult<import('../../main/services/cash-flow-service').CashFlowReport>
  >
  // Bank statement / reconciliation (Sprint 55 F66-a)
  importBankStatement: (data: {
    company_id: number
    fiscal_year_id: number
    xml_content: string
    format?: 'camt.053' | 'camt.054'
  }) => Promise<
    IpcResult<
      import('../../main/services/bank/bank-statement-service').ImportBankStatementResult
    >
  >
  listBankStatements: (data: {
    fiscal_year_id: number
  }) => Promise<
    IpcResult<
      import('../../main/services/bank/bank-statement-service').BankStatementSummary[]
    >
  >
  getBankStatement: (data: {
    statement_id: number
  }) => Promise<
    IpcResult<
      | import('../../main/services/bank/bank-statement-service').BankStatementDetail
      | null
    >
  >
  matchBankTransaction: (data: {
    bank_transaction_id: number
    matched_entity_type: 'invoice' | 'expense'
    matched_entity_id: number
    payment_account: string
  }) => Promise<
    IpcResult<
      import('../../main/services/bank/bank-match-service').MatchBankTransactionResult
    >
  >
  suggestBankMatches: (data: {
    statement_id: number
  }) => Promise<
    IpcResult<
      import('../../main/services/bank/bank-match-suggester').TxSuggestion[]
    >
  >
  unmatchBankTransaction: (data: {
    bank_transaction_id: number
    correction_description?: string
  }) => Promise<
    IpcResult<
      import('../../main/services/bank/bank-unmatch-service').BankUnmatchResult
    >
  >
  unmatchBankBatch: (data: {
    batch_id: number
  }) => Promise<
    IpcResult<
      import('../../main/services/bank/bank-unmatch-service').BankUnmatchBatchResult
    >
  >
  createBankFeeEntry: (data: {
    bank_transaction_id: number
    payment_account: string
    skipChronologyCheck?: boolean
  }) => Promise<
    IpcResult<
      import('../../main/services/bank/bank-fee-entry-service').CreateBankFeeEntryResult
    >
  >
  listBankTxMappings: () => Promise<
    IpcResult<
      import('../../main/services/bank/bank-tx-mapping-service').BankTxMapping[]
    >
  >
  upsertBankTxMapping: (data: {
    id?: number
    domain: string
    family: string
    subfamily: string
    classification: 'bank_fee' | 'interest' | 'ignore'
    account_number?: string | null
  }) => Promise<
    IpcResult<
      import('../../main/services/bank/bank-tx-mapping-service').BankTxMapping
    >
  >
  deleteBankTxMapping: (data: { id: number }) => Promise<IpcResult<undefined>>
  // Settings
  getSetting: (key: string) => Promise<unknown>
  setSetting: (key: string, value: unknown) => Promise<void>
  // Sprint 16 — Live verifikat-preview (ADR 006). Sprint 19b utökar
  // med expense-source.
  previewJournalLines: (
    data:
      | {
          source: 'manual'
          fiscal_year_id: number
          entry_date?: string
          description?: string
          lines: ReadonlyArray<{
            account_number: string
            debit_ore: number
            credit_ore: number
            description?: string
          }>
        }
      | {
          source: 'expense'
          fiscal_year_id: number
          expense_date?: string
          description?: string
          lines: ReadonlyArray<{
            description?: string
            account_number: string
            quantity: number
            unit_price_ore: number
            vat_code_id: number
          }>
        }
      | {
          source: 'invoice'
          fiscal_year_id: number
          invoice_date?: string
          invoice_type?: 'customer_invoice' | 'credit_note'
          description?: string
          lines: ReadonlyArray<{
            product_id?: number
            account_number?: string
            description?: string
            quantity: number
            unit_price_ore: number
            vat_code_id: number
          }>
        },
  ) => Promise<
    IpcResult<{
      source: 'manual' | 'expense' | 'invoice'
      lines: Array<{
        account_number: string
        account_name: string | null
        debit_ore: number
        credit_ore: number
        description: string | null
      }>
      total_debit_ore: number
      total_credit_ore: number
      balanced: boolean
      entry_date: string
      description: string | null
      warnings: ReadonlyArray<string>
    }>
  >
}

export interface UserMeta {
  id: string
  displayName: string
  createdAt: string
}

export interface AuthStatus {
  locked: boolean
  userId: string | null
  timeoutMs: number
  msUntilLock: number | null
}

export interface AuthAPI {
  listUsers: () => Promise<IpcResult<UserMeta[]>>
  status: () => Promise<IpcResult<AuthStatus>>
  createUser: (data: {
    displayName: string
    password: string
  }) => Promise<IpcResult<{ user: UserMeta; recoveryKey: string }>>
  login: (data: {
    userId: string
    password: string
  }) => Promise<IpcResult<{ user: UserMeta }>>
  loginWithRecovery: (data: {
    userId: string
    recoveryPhrase: string
  }) => Promise<IpcResult<{ user: UserMeta }>>
  logout: () => Promise<IpcResult<{ ok: true }>>
  changePassword: (data: {
    userId: string
    oldPassword: string
    newPassword: string
  }) => Promise<IpcResult<{ ok: true }>>
  rotateRecoveryKey: (data: {
    userId: string
  }) => Promise<IpcResult<{ recoveryKey: string }>>
  renameUser: (data: {
    userId: string
    displayName: string
  }) => Promise<IpcResult<{ ok: true }>>
  deleteUser: (data: { userId: string }) => Promise<IpcResult<{ ok: true }>>
  touch: () => Promise<IpcResult<{ ok: true }>>
  setTimeout: (data: {
    timeoutMs: number
  }) => Promise<IpcResult<{ ok: true; timeoutMs: number }>>
  legacyCheck: () => Promise<
    IpcResult<{ exists: boolean; path: string | null }>
  >
  legacyImport: () => Promise<IpcResult<{ ok: true; archivedTo: string }>>
  legacySkip: () => Promise<IpcResult<{ ok: true; archivedTo: string | null }>>
}

declare global {
  interface Window {
    api: ElectronAPI
    auth: AuthAPI
  }
  /** Bakad vid build från package.json via vite define. */
  const __APP_VERSION__: string
}

export {}
