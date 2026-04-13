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

interface ElectronAPI {
  healthCheck: () => Promise<HealthCheckResponse>
  createCompany: (data: CreateCompanyInput) => Promise<IpcResult<Company>>
  getCompany: () => Promise<Company | null>
  updateCompany: (data: UpdateCompanyInput) => Promise<IpcResult<Company>>
  listFiscalYears: () => Promise<FiscalYear[]>
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
  }) => Promise<FiscalPeriod[]>
  closePeriod: (data: { period_id: number }) => Promise<IpcResult<FiscalPeriod>>
  reopenPeriod: (data: {
    period_id: number
  }) => Promise<IpcResult<FiscalPeriod>>
  listCounterparties: (data: {
    search?: string
    type?: string
    active_only?: boolean
  }) => Promise<Counterparty[]>
  getCounterparty: (data: { id: number }) => Promise<Counterparty | null>
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
  }) => Promise<Product[]>
  getProduct: (data: {
    id: number
  }) => Promise<(Product & { customer_prices: CustomerPrice[] }) | null>
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
  }) => Promise<PriceResult>
  listVatCodes: (data: { direction?: string }) => Promise<VatCode[]>
  listAccounts: (data: {
    fiscal_rule: string
    class?: number
    is_active?: boolean
  }) => Promise<Account[]>
  listAllAccounts: (data: { is_active?: boolean }) => Promise<Account[]>
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
  backupCreate: () => Promise<{ filePath: string | null }>
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
  getDraft: (data: { id: number }) => Promise<InvoiceWithLines | null>
  updateDraft: (data: UpdateDraftInput) => Promise<IpcResult<InvoiceWithLines>>
  deleteDraft: (data: { id: number }) => Promise<IpcResult<undefined>>
  listDrafts: (data: {
    fiscal_year_id: number
  }) => Promise<(Invoice & { counterparty_name: string })[]>
  nextInvoiceNumber: (data: {
    fiscal_year_id: number
  }) => Promise<{ preview: number }>
  // Expenses
  saveExpenseDraft: (
    data: SaveExpenseDraftInput,
  ) => Promise<IpcResult<import('../shared/types').ExpenseWithLines>>
  getExpenseDraft: (data: {
    id: number
  }) => Promise<import('../shared/types').ExpenseWithLines | null>
  updateExpenseDraft: (
    data: UpdateExpenseDraftInput,
  ) => Promise<IpcResult<import('../shared/types').ExpenseWithLines>>
  deleteExpenseDraft: (data: { id: number }) => Promise<IpcResult<undefined>>
  listExpenseDrafts: (data: {
    fiscal_year_id: number
  }) => Promise<import('../shared/types').ExpenseDraftListItem[]>
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
  // Invoice PDF
  generateInvoicePdf: (data: {
    invoiceId: number
  }) => Promise<IpcResult<{ data: string }>>
  saveInvoicePdf: (data: {
    data: string
    defaultFileName: string
  }) => Promise<IpcResult<{ success: boolean; filePath?: string }>>
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
  }) => Promise<import('../shared/types').ManualEntry[]>
  listManualEntries: (data: {
    fiscal_year_id: number
  }) => Promise<import('../shared/types').ManualEntryListItem[]>
  finalizeManualEntry: (data: {
    id: number
    fiscal_year_id: number
  }) => Promise<
    IpcResult<{ journalEntryId: number; verificationNumber: number }>
  >
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
