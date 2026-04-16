import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Health
  healthCheck: () => ipcRenderer.invoke('db:health-check'),
  // Company
  createCompany: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('company:create', data),
  getCompany: () => ipcRenderer.invoke('company:get'),
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
  payExpense: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('expense:pay', data),
  payExpensesBulk: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('expense:payBulk', data),
  getExpensePayments: (data: { expense_id: number }) =>
    ipcRenderer.invoke('expense:payments', data),
  getExpense: (data: { id: number }) => ipcRenderer.invoke('expense:get', data),
  listExpenses: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('expense:list', data),
  createExpenseCreditNoteDraft: (data: { original_expense_id: number; fiscal_year_id: number }) =>
    ipcRenderer.invoke('expense:create-credit-note-draft', data),
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
  createCreditNoteDraft: (data: { original_invoice_id: number; fiscal_year_id: number }) =>
    ipcRenderer.invoke('invoice:create-credit-note-draft', data),
  // Invoice PDF
  generateInvoicePdf: (data: { invoiceId: number }) =>
    ipcRenderer.invoke('invoice:generate-pdf', data),
  saveInvoicePdf: (data: { data: string; defaultFileName: string }) =>
    ipcRenderer.invoke('invoice:save-pdf', data),
  selectDirectory: () =>
    ipcRenderer.invoke('invoice:select-directory', {}),
  savePdfBatch: (data: { directory: string; invoices: Array<{ invoiceId: number; fileName: string }> }) =>
    ipcRenderer.invoke('invoice:save-pdf-batch', data),
  // Dashboard
  getDashboardSummary: (data: { fiscalYearId: number }) =>
    ipcRenderer.invoke('dashboard:summary', data),
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
  correctJournalEntry: (data: { journal_entry_id: number; fiscal_year_id: number }) =>
    ipcRenderer.invoke('journal-entry:correct', data),
  canCorrectJournalEntry: (data: { journal_entry_id: number }) =>
    ipcRenderer.invoke('journal-entry:can-correct', data),
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
  globalSearch: (data: { query: string; fiscal_year_id: number; limit?: number }) =>
    ipcRenderer.invoke('search:global', data),
  // Aging Report
  getAgingReceivables: (data: { fiscal_year_id: number; as_of_date?: string }) =>
    ipcRenderer.invoke('aging:receivables', data),
  getAgingPayables: (data: { fiscal_year_id: number; as_of_date?: string }) =>
    ipcRenderer.invoke('aging:payables', data),
  // Payment batch export
  validateBatchExport: (data: { batch_id: number }) =>
    ipcRenderer.invoke('payment-batch:validate-export', data),
  exportPain001: (data: { batch_id: number }) =>
    ipcRenderer.invoke('payment-batch:export-pain001', data),
  // Accruals
  createAccrualSchedule: (data: { fiscal_year_id: number; description: string; accrual_type: string; balance_account: string; result_account: string; total_amount_ore: number; period_count: number; start_period: number }) =>
    ipcRenderer.invoke('accrual:create', data),
  getAccrualSchedules: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('accrual:list', data),
  executeAccrual: (data: { schedule_id: number; period_number: number }) =>
    ipcRenderer.invoke('accrual:execute', data),
  executeAllAccruals: (data: { fiscal_year_id: number; period_number: number }) =>
    ipcRenderer.invoke('accrual:execute-all', data),
  deactivateAccrual: (data: { schedule_id: number }) =>
    ipcRenderer.invoke('accrual:deactivate', data),
  // Budget
  getBudgetLines: () =>
    ipcRenderer.invoke('budget:lines', {}),
  getBudgetTargets: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('budget:get', data),
  saveBudgetTargets: (data: { fiscal_year_id: number; targets: Array<{ line_id: string; period_number: number; amount_ore: number }> }) =>
    ipcRenderer.invoke('budget:save', data),
  getBudgetVsActual: (data: { fiscal_year_id: number }) =>
    ipcRenderer.invoke('budget:variance', data),
  copyBudgetFromPreviousFy: (data: { target_fiscal_year_id: number; source_fiscal_year_id: number }) =>
    ipcRenderer.invoke('budget:copy-from-previous', data),
  // Settings
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: unknown) =>
    ipcRenderer.invoke('settings:set', key, value),
})

// Test-only API — separate from window.api, guarded by FRITT_TEST
if (process.env.FRITT_TEST === '1') {
  contextBridge.exposeInMainWorld('__testApi', {
    getJournalEntries: (fyId?: number) => ipcRenderer.invoke('__test:getJournalEntries', fyId),
    getInvoicePayments: (invoiceId?: number) => ipcRenderer.invoke('__test:getInvoicePayments', invoiceId),
    getPaymentBatches: () => ipcRenderer.invoke('__test:getPaymentBatches'),
    getInvoices: (fyId?: number) => ipcRenderer.invoke('__test:getInvoices', fyId),
    getExpenses: (fyId?: number) => ipcRenderer.invoke('__test:getExpenses', fyId),
    setInvoiceStatus: (invoiceId: number, status: string) => ipcRenderer.invoke('__test:setInvoiceStatus', invoiceId, status),
    createFiscalYear: (opts: { companyId: number; startDate: string; endDate: string; yearLabel: string }) => ipcRenderer.invoke('__test:createFiscalYear', opts),
  })
}
