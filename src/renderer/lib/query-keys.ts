/**
 * Centraliserade queryKey-factories.
 *
 * Konventioner:
 * - Stamdata (globala): inga FY-scope
 * - Transaktionella: fiscal_year_id som andra element
 * - Filterobjekt som sista element (om det finns)
 */
export const queryKeys = {
  // === Stamdata (globala) ===
  company: () => ['company'] as const,
  fiscalYears: () => ['fiscal-years'] as const,
  fiscalPeriods: (fyId: number) => ['fiscal-periods', fyId] as const,
  counterparties: (params?: Record<string, unknown>) =>
    params ? (['counterparties', params] as const) : (['counterparties'] as const),
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
  ) => ['expenses', fyId, status ?? null, search ?? null, sortBy ?? 'expense_date', sortOrder ?? 'desc'] as const,
  expensePayments: (expenseId: number) => ['expense-payments', expenseId] as const,

  // === Manuella verifikationer ===
  manualEntryDrafts: (fyId: number) => ['manual-entry-drafts', fyId] as const,
  manualEntries: (fyId: number) => ['manual-entries', fyId] as const,
  manualEntry: (id: number) => ['manual-entry', id] as const,

  // === Rapporter ===
  dashboard: (fyId: number) => ['dashboard', 'summary', fyId] as const,
  vatReport: (fyId: number) => ['vat', 'report', fyId] as const,
  taxForecast: (fyId: number) => ['tax', 'forecast', fyId] as const,
  netResult: (fyId: number) => ['net-result', fyId] as const,
  incomeStatement: (fyId: number, dateRange?: { from: string; to: string }) =>
    ['income-statement', fyId, dateRange ?? 'full-year'] as const,
  balanceSheet: (fyId: number, dateRange?: { from: string; to: string }) =>
    ['balance-sheet', fyId, dateRange ?? 'full-year'] as const,

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
} as const
