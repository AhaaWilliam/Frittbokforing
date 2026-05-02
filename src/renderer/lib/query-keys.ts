/**
 * Centraliserade queryKey-factories.
 *
 * Konventioner:
 * - Stamdata (counterparties, products, price_lists): scopas per bolag via
 *   ActiveCompanyContext sedan Sprint MC3. company_id ingår i queryKey som
 *   del av params-objektet (M145).
 * - Transaktionella: fiscal_year_id som andra element
 * - Filterobjekt som sista element (om det finns)
 */
export const queryKeys = {
  // === Stamdata (globala) ===
  company: () => ['company'] as const,
  companies: () => ['companies'] as const,
  fiscalYears: () => ['fiscal-years'] as const,
  fiscalPeriods: (fyId: number) => ['fiscal-periods', fyId] as const,
  counterparties: (params?: Record<string, unknown>) =>
    params
      ? (['counterparties', params] as const)
      : (['counterparties'] as const),
  counterparty: (id: number) => ['counterparty', id] as const,
  products: (params?: Record<string, unknown>) =>
    params ? (['products', params] as const) : (['products'] as const),
  product: (id: number) => ['product', id] as const,
  vatCodes: (direction?: string) =>
    direction ? (['vat-codes', direction] as const) : (['vat-codes'] as const),
  accounts: (fiscalRule: string, accountClass?: number, isActive?: boolean) =>
    ['accounts', fiscalRule, accountClass, isActive] as const,
  allAccounts: (isActive?: boolean) => ['accounts-all', isActive] as const,

  // === Fakturor (FY-scopade) ===
  invoiceDrafts: (fyId: number) => ['invoices', 'drafts', fyId] as const,
  invoice: (id: number) => ['invoice', id] as const,
  invoiceList: (fyId: number, filters?: Record<string, unknown>) =>
    filters
      ? (['invoices', 'list', fyId, filters] as const)
      : (['invoices', 'list', fyId] as const),
  invoiceNextNumber: (fyId: number) => ['invoice-next-number', fyId] as const,
  invoicePayments: (invoiceId: number) => ['payments', invoiceId] as const,

  // === Kostnader (FY-scopade) ===
  expenseDrafts: (fyId: number) => ['expense-drafts', fyId] as const,
  expenseDraft: (id: number) => ['expense-draft', id] as const,
  expense: (id: number) => ['expense', id] as const,
  expenses: (
    fyId: number,
    status?: string | null,
    search?: string | null,
    sortBy?: string,
    sortOrder?: string,
  ) =>
    [
      'expenses',
      fyId,
      status ?? null,
      search ?? null,
      sortBy ?? 'expense_date',
      sortOrder ?? 'desc',
    ] as const,
  expensePayments: (expenseId: number) =>
    ['expense-payments', expenseId] as const,

  // === Manuella verifikationer ===
  manualEntryDrafts: (fyId: number) => ['manual-entry-drafts', fyId] as const,
  manualEntries: (fyId: number) => ['manual-entries', fyId] as const,
  manualEntry: (id: number) => ['manual-entry', id] as const,
  importedEntries: (fyId: number) => ['imported-entries', fyId] as const,

  // === Rapporter ===
  dashboard: (fyId: number) => ['dashboard', 'summary', fyId] as const,
  latestVerification: (fyId: number) =>
    ['journal', 'latest-verification', fyId] as const,
  vatReport: (fyId: number) => ['vat', 'report', fyId] as const,
  taxForecast: (fyId: number) => ['tax', 'forecast', fyId] as const,
  netResult: (fyId: number) => ['net-result', fyId] as const,
  incomeStatement: (fyId: number, dateRange?: { from: string; to: string }) =>
    ['income-statement', fyId, dateRange ?? 'full-year'] as const,
  balanceSheet: (fyId: number, dateRange?: { from: string; to: string }) =>
    ['balance-sheet', fyId, dateRange ?? 'full-year'] as const,
  cashFlow: (fyId: number) => ['cash-flow', fyId] as const,
  accountStatement: (
    fyId: number,
    accountNumber: string,
    dateFrom?: string,
    dateTo?: string,
  ) => ['account-statement', fyId, accountNumber, dateFrom, dateTo] as const,

  // === Aging Report ===
  agingReceivables: (fyId: number, asOfDate?: string) =>
    ['aging-receivables', fyId, asOfDate] as const,
  agingPayables: (fyId: number, asOfDate?: string) =>
    ['aging-payables', fyId, asOfDate] as const,

  // === Global Search ===
  globalSearch: (fyId: number, query: string) =>
    ['global-search', fyId, query] as const,

  // === Accruals ===
  accrualSchedules: (fyId: number) => ['accrual-schedules', fyId] as const,
  allAccruals: () => ['accrual-schedules'] as const,

  // === Fixed Assets / Depreciation (Sprint 53 F62) ===
  fixedAssets: (fyId?: number) => ['fixed-assets', fyId] as const,
  fixedAsset: (id: number) => ['fixed-asset', id] as const,
  allFixedAssets: () => ['fixed-assets'] as const,
  anyFixedAsset: () => ['fixed-asset'] as const,
  depreciationSchedule: (assetId: number) =>
    ['depreciation-schedule', assetId] as const,
  allDepreciationSchedules: () => ['depreciation-schedule'] as const,

  // === Bank statements (Sprint 55 F66-a) ===
  bankStatements: (fyId: number) => ['bank-statements', fyId] as const,
  bankStatement: (id: number) => ['bank-statement', id] as const,
  allBankStatements: () => ['bank-statements'] as const,
  bankSuggestMatches: (statementId: number) =>
    ['bank-suggest-matches', statementId] as const,

  // === Bank TX code mappings (Sprint F P4) ===
  bankTxMappings: () => ['bank-tx-mappings'] as const,

  // === Receipts / Inkorgen (Sprint VS-109, scopas per bolag) ===
  receipts: (params?: Record<string, unknown>) =>
    params ? (['receipts', params] as const) : (['receipts'] as const),
  receiptCounts: (companyId: number) =>
    ['receipts', 'counts', companyId] as const,
  allReceipts: () => ['receipts'] as const,

  // === Budget ===
  budgetLines: () => ['budget-lines'] as const,
  budgetTargets: (fyId: number) => ['budget-targets', fyId] as const,
  budgetVariance: (fyId: number) => ['budget-variance', fyId] as const,
  allBudget: () => ['budget'] as const,

  // === Prefix-baserade nycklar för bred invalidering ===
  allInvoices: () => ['invoices'] as const,
  anyInvoice: () => ['invoice'] as const,
  allPayments: () => ['payments'] as const,
  allExpenseDrafts: () => ['expense-drafts'] as const,
  allExpenses: () => ['expenses'] as const,
  anyExpense: () => ['expense'] as const,
  allExpensePayments: () => ['expense-payments'] as const,
  allManualEntryDrafts: () => ['manual-entry-drafts'] as const,
  allManualEntries: () => ['manual-entries'] as const,
  anyManualEntry: () => ['manual-entry'] as const,
  allDashboard: () => ['dashboard'] as const,
  allLatestVerifications: () => ['journal', 'latest-verification'] as const,
  allIncomeStatement: () => ['income-statement'] as const,
  allBalanceSheet: () => ['balance-sheet'] as const,
  allVat: () => ['vat'] as const,
  // FY-scoped prefix helpers (invaliderar alla dateRange-varianter för en FY)
  incomeStatementByFy: (fyId: number) => ['income-statement', fyId] as const,
  balanceSheetByFy: (fyId: number) => ['balance-sheet', fyId] as const,
} as const
