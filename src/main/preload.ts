import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Health
  healthCheck: () => ipcRenderer.invoke('db:health-check'),
  // Company
  createCompany: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('company:create', data),
  getCompany: () => ipcRenderer.invoke('company:get'),
  listCompanies: () => ipcRenderer.invoke('company:list'),
  switchCompany: (data: { company_id: number }) =>
    ipcRenderer.invoke('company:switch', data),
  updateCompany: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('company:update', data),
  // Fiscal Years
  listFiscalYears: () => ipcRenderer.invoke('fiscal-year:list'),
  createNewFiscalYear: (data: {
    confirmBookResult: boolean
    netResultOre?: number
  }) => ipcRenderer.invoke('fiscal-year:create-new', data),
  switchFiscalYear: (data: { fiscalYearId: number }) =>
    ipcRenderer.invoke('fiscal-year:switch', data),
  // Opening Balance
  reTransferOpeningBalance: () =>
    ipcRenderer.invoke('opening-balance:re-transfer'),
  getNetResult: (data: { fiscalYearId: number }) =>
    ipcRenderer.invoke('opening-balance:net-result', data),
  // Fiscal Periods
  listFiscalPeriods: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('fiscal-period:list', data),
  closePeriod: (data: { period_id: number }) =>
    ipcRenderer.invoke('fiscal-period:close', data),
  reopenPeriod: (data: { period_id: number }) =>
    ipcRenderer.invoke('fiscal-period:reopen', data),
  // Counterparties
  listCounterparties: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('counterparty:list', data),
  getCounterparty: (data: { id: number }) =>
    ipcRenderer.invoke('counterparty:get', data),
  createCounterparty: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('counterparty:create', data),
  updateCounterparty: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('counterparty:update', data),
  deactivateCounterparty: (data: { id: number }) =>
    ipcRenderer.invoke('counterparty:deactivate', data),
  setCounterpartyDefaultAccount: (data: {
    id: number
    company_id: number
    field: 'default_expense_account' | 'default_revenue_account'
    account_number: string | null
  }) => ipcRenderer.invoke('counterparty:set-default-account', data),
  // Products
  listProducts: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('product:list', data),
  getProduct: (data: { id: number }) => ipcRenderer.invoke('product:get', data),
  createProduct: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('product:create', data),
  updateProduct: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('product:update', data),
  deactivateProduct: (data: { id: number }) =>
    ipcRenderer.invoke('product:deactivate', data),
  // Product pricing
  setCustomerPrice: (data: {
    product_id: number
    counterparty_id: number
    price_ore: number
  }) => ipcRenderer.invoke('product:set-customer-price', data),
  removeCustomerPrice: (data: {
    product_id: number
    counterparty_id: number
  }) => ipcRenderer.invoke('product:remove-customer-price', data),
  getPriceForCustomer: (data: {
    product_id: number
    counterparty_id: number
  }) => ipcRenderer.invoke('product:get-price-for-customer', data),
  // Expenses
  saveExpenseDraft: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('expense:save-draft', data),
  getExpenseDraft: (data: { id: number }) =>
    ipcRenderer.invoke('expense:get-draft', data),
  updateExpenseDraft: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('expense:update-draft', data),
  deleteExpenseDraft: (data: { id: number }) =>
    ipcRenderer.invoke('expense:delete-draft', data),
  listExpenseDrafts: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('expense:list-drafts', data),
  finalizeExpense: (data: { id: number }) =>
    ipcRenderer.invoke('expense:finalize', data),
  attachReceipt: (data: { expense_id: number; source_file_path: string }) =>
    ipcRenderer.invoke('expense:attach-receipt', data),
  selectReceiptFile: () =>
    ipcRenderer.invoke('expense:select-receipt-file', {}),
  payExpense: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('expense:pay', data),
  payExpensesBulk: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('expense:payBulk', data),
  getExpensePayments: (data: { expense_id: number }) =>
    ipcRenderer.invoke('expense:payments', data),
  getExpense: (data: { id: number }) => ipcRenderer.invoke('expense:get', data),
  listExpenses: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('expense:list', data),
  createExpenseCreditNoteDraft: (data: {
    original_expense_id: number
    fiscal_year_id: number
  }) => ipcRenderer.invoke('expense:create-credit-note-draft', data),
  // Stödjande
  listVatCodes: (data: { direction?: string }) =>
    ipcRenderer.invoke('vat-code:list', data),
  listAccounts: (data: {
    fiscal_rule: string
    class?: number
    is_active?: boolean
  }) => ipcRenderer.invoke('account:list', data),
  listAllAccounts: (data: { is_active?: boolean }) =>
    ipcRenderer.invoke('account:list-all', data),
  accountCreate: (data: {
    account_number: string
    name: string
    k2_allowed: boolean
    k3_only: boolean
  }) => ipcRenderer.invoke('account:create', data),
  accountUpdate: (data: {
    account_number: string
    name: string
    k2_allowed: boolean
    k3_only: boolean
  }) => ipcRenderer.invoke('account:update', data),
  accountToggleActive: (data: { account_number: string; is_active: boolean }) =>
    ipcRenderer.invoke('account:toggle-active', data),
  getAccountStatement: (data: {
    fiscal_year_id: number
    account_number: string
    date_from?: string
    date_to?: string
  }) => ipcRenderer.invoke('account:get-statement', data),
  backupCreate: () => ipcRenderer.invoke('backup:create'),
  backupRestore: () => ipcRenderer.invoke('backup:restore-dialog'),
  // Invoices
  listInvoices: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('invoice:list', data),
  finalizeInvoice: (data: { id: number }) =>
    ipcRenderer.invoke('invoice:finalize', data),
  updateSentInvoice: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('invoice:update-sent', data),
  payInvoice: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('invoice:pay', data),
  payInvoicesBulk: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('invoice:payBulk', data),
  getPayments: (data: { invoice_id: number }) =>
    ipcRenderer.invoke('invoice:payments', data),
  saveDraft: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('invoice:save-draft', data),
  getDraft: (data: { id: number }) =>
    ipcRenderer.invoke('invoice:get-draft', data),
  updateDraft: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('invoice:update-draft', data),
  deleteDraft: (data: { id: number }) =>
    ipcRenderer.invoke('invoice:delete-draft', data),
  listDrafts: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('invoice:list-drafts', data),
  nextInvoiceNumber: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('invoice:next-number', data),
  createCreditNoteDraft: (data: {
    original_invoice_id: number
    fiscal_year_id: number
  }) => ipcRenderer.invoke('invoice:create-credit-note-draft', data),
  // Invoice PDF
  generateInvoicePdf: (data: { invoiceId: number }) =>
    ipcRenderer.invoke('invoice:generate-pdf', data),
  saveInvoicePdf: (data: { data: string; defaultFileName: string }) =>
    ipcRenderer.invoke('invoice:save-pdf', data),
  selectDirectory: () => ipcRenderer.invoke('invoice:select-directory', {}),
  savePdfBatch: (data: {
    directory: string
    invoices: Array<{ invoiceId: number; fileName: string }>
  }) => ipcRenderer.invoke('invoice:save-pdf-batch', data),
  // Dashboard
  getDashboardSummary: (data: { fiscalYearId: number }) =>
    ipcRenderer.invoke('dashboard:summary', data),
  getLatestVerification: (data: { fiscalYearId: number }) =>
    ipcRenderer.invoke('journal:latest-verification', data),
  // VAT Report
  getVatReport: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('vat:report', data),
  // SIE5 Export
  exportSie5: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('export:sie5', data),
  // SIE4 Export
  exportSie4: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('export:sie4', data),
  // Manual Entries
  saveManualEntryDraft: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('manual-entry:save-draft', data),
  getManualEntry: (data: { id: number }) =>
    ipcRenderer.invoke('manual-entry:get', data),
  updateManualEntryDraft: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('manual-entry:update-draft', data),
  deleteManualEntryDraft: (data: { id: number }) =>
    ipcRenderer.invoke('manual-entry:delete-draft', data),
  listManualEntryDrafts: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('manual-entry:list-drafts', data),
  listManualEntries: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('manual-entry:list', data),
  finalizeManualEntry: (data: { id: number; fiscal_year_id: number }) =>
    ipcRenderer.invoke('manual-entry:finalize', data),
  // Journal Entry Corrections
  correctJournalEntry: (data: {
    journal_entry_id: number
    fiscal_year_id: number
  }) => ipcRenderer.invoke('journal-entry:correct', data),
  canCorrectJournalEntry: (data: { journal_entry_id: number }) =>
    ipcRenderer.invoke('journal-entry:can-correct', data),
  listImportedEntries: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('journal-entry:list-imported', data),
  // Excel Export
  exportExcel: (data: {
    fiscal_year_id: number
    start_date?: string
    end_date?: string
  }) => ipcRenderer.invoke('export:excel', data),
  // Reports
  getIncomeStatement: (data: {
    fiscal_year_id: number
    date_range?: { from: string; to: string }
  }) => ipcRenderer.invoke('report:income-statement', data),
  getBalanceSheet: (data: {
    fiscal_year_id: number
    date_range?: { from: string; to: string }
  }) => ipcRenderer.invoke('report:balance-sheet', data),
  // Export Write File
  exportWriteFile: (data: {
    format: 'sie5' | 'sie4' | 'excel'
    fiscal_year_id: number
    date_range?: { from: string; to: string }
  }) => ipcRenderer.invoke('export:write-file', data),
  // Tax
  getTaxForecast: (data: { fiscalYearId: number }) =>
    ipcRenderer.invoke('tax:forecast', data),
  // Global Search
  globalSearch: (data: {
    query: string
    fiscal_year_id: number
    limit?: number
  }) => ipcRenderer.invoke('search:global', data),
  // Aging Report
  getAgingReceivables: (data: {
    fiscal_year_id: number
    as_of_date?: string
  }) => ipcRenderer.invoke('aging:receivables', data),
  getAgingPayables: (data: { fiscal_year_id: number; as_of_date?: string }) =>
    ipcRenderer.invoke('aging:payables', data),
  // SIE4 Import
  sie4SelectFile: () => ipcRenderer.invoke('import:sie4-select-file', {}),
  sie4Validate: (data: { filePath: string }) =>
    ipcRenderer.invoke('import:sie4-validate', data),
  sie4Import: (data: {
    filePath: string
    strategy: 'new' | 'merge'
    fiscal_year_id?: number
    conflict_resolutions?: Record<string, 'keep' | 'overwrite' | 'skip'>
  }) => ipcRenderer.invoke('import:sie4-execute', data),
  // SIE5 Import (Sprint U2)
  sie5SelectFile: () => ipcRenderer.invoke('import:sie5-select-file', {}),
  sie5Validate: (data: { filePath: string }) =>
    ipcRenderer.invoke('import:sie5-validate', data),
  sie5Import: (data: {
    filePath: string
    strategy: 'new' | 'merge'
    fiscal_year_id?: number
    conflict_resolutions?: Record<string, 'keep' | 'overwrite' | 'skip'>
  }) => ipcRenderer.invoke('import:sie5-execute', data),
  // Payment batch export
  validateBatchExport: (data: { batch_id: number }) =>
    ipcRenderer.invoke('payment-batch:validate-export', data),
  exportPain001: (data: { batch_id: number }) =>
    ipcRenderer.invoke('payment-batch:export-pain001', data),
  // SEPA DD (Sprint U1 — backend-only MVP)
  sepaDdCreateMandate: (data: {
    counterparty_id: number
    mandate_reference: string
    signature_date: string
    sequence_type: 'OOFF' | 'FRST' | 'RCUR' | 'FNAL'
    iban: string
    bic?: string | null
  }) => ipcRenderer.invoke('sepa-dd:create-mandate', data),
  sepaDdListMandates: (data: { counterparty_id: number }) =>
    ipcRenderer.invoke('sepa-dd:list-mandates', data),
  sepaDdRevokeMandate: (data: { mandate_id: number }) =>
    ipcRenderer.invoke('sepa-dd:revoke-mandate', data),
  sepaDdCreateCollection: (data: {
    fiscal_year_id: number
    mandate_id: number
    invoice_id?: number | null
    amount_ore: number
    collection_date: string
  }) => ipcRenderer.invoke('sepa-dd:create-collection', data),
  sepaDdCreateBatch: (data: {
    fiscal_year_id: number
    collection_ids: number[]
    payment_date: string
    account_number: string
    user_note?: string | null
  }) => ipcRenderer.invoke('sepa-dd:create-batch', data),
  sepaDdExportPain008: (data: { batch_id: number }) =>
    ipcRenderer.invoke('sepa-dd:export-pain008', data),
  sepaDdListCollections: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('sepa-dd:list-collections', data),
  sepaDdListBatches: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('sepa-dd:list-batches', data),
  // Accruals
  createAccrualSchedule: (data: {
    fiscal_year_id: number
    description: string
    accrual_type: string
    balance_account: string
    result_account: string
    total_amount_ore: number
    period_count: number
    start_period: number
  }) => ipcRenderer.invoke('accrual:create', data),
  getAccrualSchedules: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('accrual:list', data),
  executeAccrual: (data: { schedule_id: number; period_number: number }) =>
    ipcRenderer.invoke('accrual:execute', data),
  executeAllAccruals: (data: {
    fiscal_year_id: number
    period_number: number
  }) => ipcRenderer.invoke('accrual:execute-all', data),
  deactivateAccrual: (data: { schedule_id: number }) =>
    ipcRenderer.invoke('accrual:deactivate', data),
  // Budget
  getBudgetLines: () => ipcRenderer.invoke('budget:lines', {}),
  getBudgetTargets: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('budget:get', data),
  saveBudgetTargets: (data: {
    fiscal_year_id: number
    targets: Array<{
      line_id: string
      period_number: number
      amount_ore: number
    }>
  }) => ipcRenderer.invoke('budget:save', data),
  getBudgetVsActual: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('budget:variance', data),
  copyBudgetFromPreviousFy: (data: {
    target_fiscal_year_id: number
    source_fiscal_year_id: number
  }) => ipcRenderer.invoke('budget:copy-from-previous', data),
  getBudgetSummaryByYear: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('budget:getSummaryByYear', data),
  // Depreciation (Sprint 53 F62)
  createFixedAsset: (data: {
    name: string
    acquisition_date: string
    acquisition_cost_ore: number
    residual_value_ore: number
    useful_life_months: number
    method: 'linear' | 'declining'
    declining_rate_bp?: number
    account_asset: string
    account_accumulated_depreciation: string
    account_depreciation_expense: string
  }) => ipcRenderer.invoke('depreciation:create-asset', data),
  updateFixedAsset: (data: {
    id: number
    input: {
      name: string
      acquisition_date: string
      acquisition_cost_ore: number
      residual_value_ore: number
      useful_life_months: number
      method: 'linear' | 'declining'
      declining_rate_bp?: number
      account_asset: string
      account_accumulated_depreciation: string
      account_depreciation_expense: string
    }
  }) => ipcRenderer.invoke('depreciation:update-asset', data),
  listFixedAssets: (data: { fiscal_year_id?: number }) =>
    ipcRenderer.invoke('depreciation:list', data),
  getFixedAsset: (data: { id: number }) =>
    ipcRenderer.invoke('depreciation:get', data),
  disposeFixedAsset: (data: {
    id: number
    disposed_date: string
    generate_journal_entry?: boolean
    sale_price_ore?: number
    proceeds_account?: string | null
  }) => ipcRenderer.invoke('depreciation:dispose', data),
  deleteFixedAsset: (data: { id: number }) =>
    ipcRenderer.invoke('depreciation:delete', data),
  executeDepreciationPeriod: (data: {
    fiscal_year_id: number
    period_end_date: string
  }) => ipcRenderer.invoke('depreciation:execute-period', data),
  // Cash Flow (Sprint 53 F65)
  getCashFlowStatement: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('report:cash-flow', data),
  // Bank statement / reconciliation (Sprint 55 F66-a)
  importBankStatement: (data: {
    company_id: number
    fiscal_year_id: number
    xml_content: string
    format?: 'camt.053' | 'camt.054'
  }) => ipcRenderer.invoke('bank-statement:import', data),
  listBankStatements: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('bank-statement:list', data),
  getBankStatement: (data: { statement_id: number }) =>
    ipcRenderer.invoke('bank-statement:get', data),
  matchBankTransaction: (data: {
    bank_transaction_id: number
    matched_entity_type: 'invoice' | 'expense'
    matched_entity_id: number
    payment_account: string
  }) => ipcRenderer.invoke('bank-statement:match-transaction', data),
  suggestBankMatches: (data: { statement_id: number }) =>
    ipcRenderer.invoke('bank-statement:suggest-matches', data),
  unmatchBankTransaction: (data: {
    bank_transaction_id: number
    correction_description?: string
  }) => ipcRenderer.invoke('bank-statement:unmatch-transaction', data),
  unmatchBankBatch: (data: { batch_id: number }) =>
    ipcRenderer.invoke('bank-statement:unmatch-batch', data),
  createBankFeeEntry: (data: {
    bank_transaction_id: number
    payment_account: string
    skipChronologyCheck?: boolean
  }) => ipcRenderer.invoke('bank-statement:create-fee-entry', data),
  listBankTxMappings: () => ipcRenderer.invoke('bank-tx-mapping:list'),
  upsertBankTxMapping: (data: {
    id?: number
    domain: string
    family: string
    subfamily: string
    classification: 'bank_fee' | 'interest' | 'ignore'
    account_number?: string | null
  }) => ipcRenderer.invoke('bank-tx-mapping:upsert', data),
  deleteBankTxMapping: (data: { id: number }) =>
    ipcRenderer.invoke('bank-tx-mapping:delete', data),
  // Settings
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: unknown) =>
    ipcRenderer.invoke('settings:set', key, value),
  // Sprint 16 — Live verifikat-preview (ADR 006)
  previewJournalLines: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('preview:journal-lines', data),
})

// Auth — separate namespace (window.auth.*) for the local-login + SQLCipher
// flow (ADR 004). Kept out of window.api so auth is usable BEFORE the DB
// is open (app/ipc handlers that require DB would otherwise fail pre-login).
contextBridge.exposeInMainWorld('auth', {
  listUsers: () => ipcRenderer.invoke('auth:list-users'),
  status: () => ipcRenderer.invoke('auth:status'),
  createUser: (data: { displayName: string; password: string }) =>
    ipcRenderer.invoke('auth:create-user', data),
  login: (data: { userId: string; password: string }) =>
    ipcRenderer.invoke('auth:login', data),
  loginWithRecovery: (data: { userId: string; recoveryPhrase: string }) =>
    ipcRenderer.invoke('auth:login-recovery', data),
  logout: () => ipcRenderer.invoke('auth:logout'),
  changePassword: (data: {
    userId: string
    oldPassword: string
    newPassword: string
  }) => ipcRenderer.invoke('auth:change-password', data),
  rotateRecoveryKey: (data: { userId: string }) =>
    ipcRenderer.invoke('auth:rotate-recovery', data),
  renameUser: (data: { userId: string; displayName: string }) =>
    ipcRenderer.invoke('auth:rename-user', data),
  deleteUser: (data: { userId: string }) =>
    ipcRenderer.invoke('auth:delete-user', data),
  touch: () => ipcRenderer.invoke('auth:touch'),
  setTimeout: (data: { timeoutMs: number }) =>
    ipcRenderer.invoke('auth:set-timeout', data),
  // Legacy-DB migration (ADR 004 §9)
  legacyCheck: () => ipcRenderer.invoke('auth:legacy-check'),
  legacyImport: () => ipcRenderer.invoke('auth:legacy-import'),
  legacySkip: () => ipcRenderer.invoke('auth:legacy-skip'),
})

// Test-only auth API — separate from window.__testApi; lives on window.__authTestApi
if (process.env.FRITT_TEST === '1') {
  contextBridge.exposeInMainWorld('__authTestApi', {
    createAndLoginUser: (data?: { displayName?: string; password?: string }) =>
      ipcRenderer.invoke('__test:createAndLoginUser', data ?? {}),
    lockNow: () => ipcRenderer.invoke('__test:lockNow'),
    setTimeoutMs: (ms: number) => ipcRenderer.invoke('__test:setTimeoutMs', ms),
  })
}

// Test-only API — separate from window.api, guarded by FRITT_TEST
if (process.env.FRITT_TEST === '1') {
  contextBridge.exposeInMainWorld('__testApi', {
    getJournalEntries: (fyId?: number) =>
      ipcRenderer.invoke('__test:getJournalEntries', fyId),
    getInvoicePayments: (invoiceId?: number) =>
      ipcRenderer.invoke('__test:getInvoicePayments', invoiceId),
    getPaymentBatches: () => ipcRenderer.invoke('__test:getPaymentBatches'),
    getInvoices: (fyId?: number) =>
      ipcRenderer.invoke('__test:getInvoices', fyId),
    getExpenses: (fyId?: number) =>
      ipcRenderer.invoke('__test:getExpenses', fyId),
    setInvoiceStatus: (invoiceId: number, status: string) =>
      ipcRenderer.invoke('__test:setInvoiceStatus', invoiceId, status),
    getCounterpartyById: (id: number) =>
      ipcRenderer.invoke('__test:getCounterpartyById', id),
    createFiscalYear: (opts: {
      companyId: number
      startDate: string
      endDate: string
      yearLabel: string
    }) => ipcRenderer.invoke('__test:createFiscalYear', opts),
    freezeClock: (iso: string | null) =>
      ipcRenderer.invoke('__test:freezeClock', iso),
    forcePeriodState: (periodId: number, closed: boolean) =>
      ipcRenderer.invoke('__test:forcePeriodState', periodId, closed),
    getReconciliationMatches: (stmtId?: number) =>
      ipcRenderer.invoke('__test:getReconciliationMatches', stmtId),
    linkPaymentToBankTx: (
      paymentId: number,
      txId: number,
      entityType: 'invoice' | 'expense',
    ) =>
      ipcRenderer.invoke(
        '__test:linkPaymentToBankTx',
        paymentId,
        txId,
        entityType,
      ),
  })
}
