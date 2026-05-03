// === Health Check ===
export interface HealthCheckResponse {
  ok: boolean
  path: string
  schemaVersion: number
  tableCount: number
}

// === IPC Result type (ALLA IPC-kanaler använder detta) ===
export type IpcResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: ErrorCode; field?: string }

// Standardiserade felkoder
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'DUPLICATE_ORG_NUMBER'
  | 'PERIOD_GENERATION_ERROR'
  | 'TRANSACTION_ERROR'
  | 'NOT_FOUND'
  | 'PERIOD_NOT_SEQUENTIAL'
  | 'YEAR_IS_CLOSED'
  | 'COUNTERPARTY_NOT_FOUND'
  | 'DUPLICATE_NAME'
  | 'PRODUCT_NOT_FOUND'
  | 'INVOICE_NOT_FOUND'
  | 'INVOICE_NOT_DRAFT'
  | 'EXPENSE_NOT_FOUND'
  | 'DUPLICATE_SUPPLIER_INVOICE'
  | 'INVALID_COUNTERPARTY_TYPE'
  | 'EXPENSE_NOT_PAYABLE'
  | 'OVERPAYMENT'
  | 'PAYMENT_BEFORE_EXPENSE'
  | 'DUPLICATE_ACCOUNT'
  | 'SYSTEM_ACCOUNT'
  | 'ACCOUNT_HAS_ENTRIES'
  | 'ACCOUNT_NOT_FOUND'
  | 'INACTIVE_ACCOUNT'
  | 'MANUAL_ENTRY_NOT_FOUND'
  | 'ALREADY_FINALIZED'
  | 'INVOICE_HAS_PAYMENTS'
  | 'MISSING_ACCOUNT_NUMBER'
  | 'UNBALANCED_ENTRY'
  | 'STALE_DATA'
  | 'DUPLICATE_FISCAL_YEAR'
  | 'CREDIT_NOTE_ORIGINAL_NOT_FOUND'
  | 'ENTRY_NOT_FOUND'
  | 'ENTRY_NOT_BOOKED'
  | 'ENTRY_ALREADY_CORRECTED'
  | 'ENTRY_IS_CORRECTION'
  | 'HAS_DEPENDENT_PAYMENTS'
  | 'PERIOD_CLOSED'
  | 'NOT_MATCHED'
  | 'BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED'
  | 'HAS_EXECUTED_SCHEDULES'
  | 'ACCRUAL_ALREADY_EXECUTED'
  | 'UNEXPECTED_ERROR'
  | 'WRONG_PASSWORD'
  | 'WRONG_RECOVERY_KEY'
  | 'RATE_LIMITED'
  | 'USER_NOT_FOUND'
  | 'NOT_AUTHENTICATED'
  | 'WEAK_PASSWORD'
  | 'RECEIPT_NOT_FOUND'
  | 'RECEIPT_DUPLICATE_HASH'
  | 'RECEIPT_BOOKED'
  | 'RECEIPT_FILE_ERROR'

// === Page navigation ===
export type PageId =
  | 'overview'
  | 'income'
  | 'expenses'
  | 'vat'
  | 'tax'
  | 'export'
  | 'reports'
  | 'settings'
  | 'customers'
  | 'products'
  | 'manual-entries'
  | 'accounts'
  | 'suppliers'
  | 'account-statement'
  | 'bank-statements'
  | 'inbox'

// === Company ===
export interface Company {
  id: number
  name: string
  org_number: string
  fiscal_rule: 'K2' | 'K3'
  share_capital: number
  registration_date: string
  board_members: string | null
  vat_number: string | null
  address_line1: string | null
  postal_code: string | null
  city: string | null
  email: string | null
  phone: string | null
  bankgiro: string | null
  plusgiro: string | null
  website: string | null
  approved_for_f_tax: number
  /** VS-115: SKV moms-deklarations-frekvens. Default 'quarterly'. */
  vat_frequency: 'monthly' | 'quarterly' | 'yearly'
  /** VS-120: bolaget har anställda (lönebokningar förväntas). Default 0. */
  has_employees: number
  /** VS-142: opt-in OS-notifiering om moms-deadline (7/3/1 dagar). Default 0. */
  notify_vat_deadline: number
  created_at: string
}

// === Fiscal Year ===
export interface FiscalYear {
  id: number
  company_id: number
  year_label: string
  start_date: string
  end_date: string
  is_closed: 0 | 1
  annual_report_status: string
  closed_at: string | null
}

// === Fiscal Year Context ===
export interface FiscalYearContextValue {
  activeFiscalYear: FiscalYear | null
  setActiveFiscalYear: (fy: FiscalYear) => void
  allFiscalYears: FiscalYear[]
  isReadOnly: boolean
}

// === Fiscal Period ===
export interface FiscalPeriod {
  id: number
  fiscal_year_id: number
  period_number: number
  start_date: string
  end_date: string
  is_closed: 0 | 1
  closed_at: string | null
}

// === Counterparty ===
export interface Counterparty {
  id: number
  company_id: number
  name: string
  type: 'customer' | 'supplier' | 'both'
  org_number: string | null
  vat_number: string | null
  address_line1: string | null
  postal_code: string | null
  city: string | null
  country: string
  contact_person: string | null
  email: string | null
  phone: string | null
  default_payment_terms: number
  bankgiro: string | null
  plusgiro: string | null
  bank_account: string | null
  bank_clearing: string | null
  default_expense_account: string | null
  default_revenue_account: string | null
  is_active: number
  created_at: string
  updated_at: string
}

// === Payment Export ===

export interface PaymentExportValidation {
  valid: boolean
  issues: Array<{
    counterpartyId: number
    counterpartyName: string
    issue: 'missing_bankgiro' | 'missing_all_payment_info'
  }>
  batchIssue?: 'already_exported' | 'cancelled' | 'company_missing_bankgiro'
}

// === Create Company Input (renderer → main) ===
export interface CreateCompanyInput {
  name: string
  org_number: string
  fiscal_rule: 'K2' | 'K3'
  share_capital: number
  registration_date: string
  board_members?: string | null
  fiscal_year_start: string
  fiscal_year_end: string
}

// === Update Company Input ===
export interface UpdateCompanyInput {
  vat_number?: string | null
  address_line1?: string | null
  postal_code?: string | null
  city?: string | null
  email?: string | null
  phone?: string | null
  bankgiro?: string | null
  plusgiro?: string | null
  website?: string | null
  board_members?: string | null
  approved_for_f_tax?: number
  has_employees?: number
  vat_frequency?: 'monthly' | 'quarterly' | 'yearly'
  notify_vat_deadline?: number
}

// === Counterparty Input ===
export interface CreateCounterpartyInput {
  company_id: number
  name: string
  type?: 'customer' | 'supplier' | 'both'
  org_number?: string | null
  vat_number?: string | null
  address_line1?: string | null
  postal_code?: string | null
  city?: string | null
  country?: string
  contact_person?: string | null
  email?: string | null
  phone?: string | null
  default_payment_terms?: number
}

export interface UpdateCounterpartyInput extends Partial<CreateCounterpartyInput> {
  id: number
  company_id: number
}

// === Product ===
export interface Product {
  id: number
  company_id: number
  name: string
  description: string | null
  unit: 'timme' | 'styck' | 'dag' | 'månad' | 'km' | 'pauschal'
  default_price_ore: number
  vat_code_id: number
  account_id: number
  article_type: 'service' | 'goods' | 'expense'
  is_active: number
  created_at: string
  updated_at: string
}

export interface CustomerPrice {
  counterparty_id: number
  counterparty_name: string
  price_ore: number
}

export interface PriceResult {
  price_ore: number
  source: 'customer' | 'default'
}

// === VatCode ===
export interface VatCode {
  id: number
  code: string
  description: string
  rate_percent: number // 25, 12, 6, 0
  vat_type: 'outgoing' | 'incoming' | 'exempt'
  report_box: string | null
}

// === Account ===
export interface Account {
  id: number
  account_number: string
  name: string
  account_type: string
  is_active: number
  k2_allowed: number
  k3_only: number
  is_system_account: number
}

// Artikeltyp → konto/enhet-defaults
export const ARTICLE_TYPE_DEFAULTS = {
  service: { account_number: '3002', unit: 'timme' as const },
  goods: { account_number: '3040', unit: 'styck' as const },
  expense: { account_number: '3050', unit: 'styck' as const },
} as const

// === Product Input ===
export interface CreateProductInput {
  company_id: number
  name: string
  description?: string | null
  unit?: 'timme' | 'styck' | 'dag' | 'månad' | 'km' | 'pauschal'
  default_price_ore: number
  vat_code_id: number
  account_id: number
  article_type?: 'service' | 'goods' | 'expense'
}

export interface UpdateProductInput extends Partial<CreateProductInput> {
  id: number
  company_id: number
}

// === Invoice ===
export interface Invoice {
  id: number
  counterparty_id: number
  fiscal_year_id: number | null
  invoice_type: string
  invoice_number: string
  invoice_date: string
  due_date: string
  status: string
  net_amount_ore: number
  vat_amount_ore: number
  total_amount_ore: number
  currency: string
  paid_amount_ore: number
  journal_entry_id: number | null
  ocr_number: string | null
  notes: string | null
  payment_terms: number
  credits_invoice_id: number | null
  version: number
  created_at: string
  updated_at: string
}

export interface InvoiceLine {
  id: number
  invoice_id: number
  product_id: number | null
  description: string
  quantity: number
  unit_price_ore: number // ören
  vat_code_id: number
  line_total_ore: number // ören
  vat_amount_ore: number // ören
  account_number: string | null
  sort_order: number
}

export interface InvoiceWithLines extends Invoice {
  lines: InvoiceLine[]
  counterparty_name?: string
}

// === Invoice Form State (renderer only) ===
export interface InvoiceFormLine {
  temp_id: string
  product_id: number | null
  description: string
  quantity: number
  unit_price_kr: number
  vat_code_id: number
  vat_rate: number
  unit: string
  account_number: string | null // for friform rows without product
}

// === Invoice Input ===
export interface SaveDraftInput {
  counterparty_id: number
  fiscal_year_id: number
  invoice_date: string
  due_date: string
  payment_terms?: number
  notes?: string | null
  currency?: string
  lines: {
    product_id: number | null
    description: string
    quantity: number
    unit_price_ore: number // ören
    vat_code_id: number
    sort_order: number
    account_number?: string | null
  }[]
}

export interface UpdateDraftInput {
  id: number
  counterparty_id: number
  invoice_date: string
  due_date: string
  payment_terms?: number
  notes?: string | null
  lines: {
    product_id: number | null
    description: string
    quantity: number
    unit_price_ore: number
    vat_code_id: number
    sort_order: number
    account_number?: string | null
  }[]
}

// === Journal Entry ===
export interface JournalEntry {
  id: number
  company_id: number
  fiscal_year_id: number
  verification_number: number | null
  verification_series: string
  journal_date: string
  description: string
  status: string
  source_type: string
  corrects_entry_id: number | null
  corrected_by_id: number | null
  created_at: string
}

export interface JournalEntryLine {
  id: number
  journal_entry_id: number
  line_number: number
  account_number: string
  debit_ore: number
  credit_ore: number
  description: string | null
}

// === Invoice List ===
export interface InvoiceListItem {
  id: number
  invoice_type: string
  invoice_number: string
  invoice_date: string
  due_date: string
  net_amount_ore: number
  vat_amount_ore: number
  total_amount_ore: number
  status: string
  payment_terms: number
  counterparty_name: string
  verification_number: number | null
  journal_entry_id: number | null
  credits_invoice_id: number | null
  has_credit_note: number | null
  total_paid: number
  remaining: number
}

export interface InvoiceStatusCounts {
  total: number
  draft: number
  unpaid: number
  partial: number
  paid: number
  overdue: number
}

// === Invoice Payment ===
export interface InvoicePayment {
  id: number
  invoice_id: number
  amount_ore: number
  payment_date: string
  payment_method: string | null
  account_number: string
  journal_entry_id: number
  bank_fee_ore: number | null
  bank_fee_account: string | null
  created_at: string
}

// === Expenses ===
export interface Expense {
  id: number
  fiscal_year_id: number
  counterparty_id: number
  expense_type: string
  credits_expense_id: number | null
  supplier_invoice_number: string | null
  expense_date: string
  due_date: string | null
  description: string
  status: string
  payment_terms: number
  journal_entry_id: number | null
  total_amount_ore: number
  paid_amount_ore: number
  notes: string
  receipt_path: string | null
  created_at: string
  updated_at: string
}

export interface ExpenseLine {
  id?: number
  expense_id?: number
  description: string
  account_number: string
  quantity: number
  unit_price_ore: number
  vat_code_id: number
  line_total_ore: number
  vat_amount_ore: number
  sort_order: number
}

export interface ExpenseWithLines extends Expense {
  lines: ExpenseLine[]
  counterparty_name?: string
}

// === Expense Payment ===
export interface ExpensePayment {
  id: number
  expense_id: number
  amount_ore: number
  payment_date: string
  payment_method: string | null
  account_number: string
  journal_entry_id: number
  bank_fee_ore: number | null
  bank_fee_account: string | null
  created_at: string
}

export interface ExpenseDetail extends Expense {
  lines: ExpenseLine[]
  counterparty_name?: string
  total_paid: number
  remaining: number
}

// === Expense List ===
export interface ExpenseListItem {
  id: number
  expense_type: string
  credits_expense_id: number | null
  has_credit_note: number | null
  expense_date: string
  due_date: string | null
  description: string
  supplier_invoice_number: string | null
  status: string
  total_amount_ore: number
  total_paid: number
  remaining: number
  counterparty_name: string
  verification_number: number | null
  verification_series: string | null
  journal_entry_id: number | null
}

export interface ExpenseStatusCounts {
  draft: number
  unpaid: number
  paid: number
  overdue: number
  partial: number
  total: number
}

// === Dashboard ===
// === VAT Report ===
export interface VatQuarterReport {
  quarterIndex: number // 0-3, or -1 for year total
  quarterLabel: string // "Kv 1 (jan–mar 2026)" or "Helår"
  startDate: string
  endDate: string
  hasData: boolean

  // Utgående moms (SKV rad 10 = 25 %, rad 11 = 12 %, rad 12 = 6 %)
  vatOut25Ore: number
  vatOut12Ore: number
  vatOut6Ore: number
  vatOutTotalOre: number

  // Momspliktiga underlag (SKV rad 05 = 25 %, rad 06 = 12 %, rad 07 = 6 %)
  taxableBase25Ore: number
  taxableBase12Ore: number
  taxableBase6Ore: number

  // Ingående moms att dra av (SKV rad 48)
  vatInOre: number

  // Netto att betala/få tillbaka (SKV rad 49)
  vatNetOre: number // + = att betala, - = fordran
}

export interface VatReport {
  quarters: VatQuarterReport[] // 1–5 element (normalt 4; kortat/förlängt första FY ger 1–5 per M161)
  yearTotal: VatQuarterReport // quarterIndex: -1, quarterLabel: "Helår"
  fiscalYearId: number
}

// VS-42: Senast bokförda verifikatet inom ett räkenskapsår, oavsett serie.
// Returneras som null om inga bokade verifikat finns.
export interface LatestVerification {
  series: string
  number: number
  entry_date: string
}

export interface DashboardSummary {
  revenueOre: number
  expensesOre: number
  operatingResultOre: number
  vatOutgoingOre: number
  vatIncomingOre: number
  vatNetOre: number
  unpaidReceivablesOre: number
  unpaidPayablesOre: number
  bankBalanceOre: number
}

// === Tax Forecast ===
export interface TaxForecast {
  // Skattebas (EBIT-approximation: konton 3XXX minus 4XXX-7XXX, exkl klass 8)
  operatingProfitOre: number
  taxableIncomeOre: number // MAX(0, operatingProfit)

  // Bolagsskatt utan periodiseringsfond
  corporateTaxOre: number // floor(taxableIncome * 206 / 1000)

  // Med max periodiseringsfond (max 25% av positiv vinst)
  periodiseringsfondMaxOre: number
  taxableIncomeAfterFondOre: number
  corporateTaxAfterFondOre: number
  taxSavingsFromFondOre: number

  // Helårsprognos (null om monthsElapsed = 0)
  monthsElapsed: number
  fiscalYearMonths: number
  projectedFullYearIncomeOre: number | null
  projectedFullYearTaxOre: number | null
  projectedFullYearTaxAfterFondOre: number | null

  // Metadata
  taxRatePercent: number // 20.6
  periodiseringsfondRatePercent: number // 25.0
}

// === Manual Entries ===
export interface ManualEntry {
  id: number
  fiscal_year_id: number
  entry_date: string | null
  description: string | null
  status: 'draft' | 'finalized'
  journal_entry_id: number | null
  created_at: string
  updated_at: string
}

export interface ManualEntryLine {
  id: number
  manual_entry_id: number
  line_number: number
  account_number: string
  debit_ore: number
  credit_ore: number
  description: string | null
}

export interface ManualEntryWithLines extends ManualEntry {
  lines: ManualEntryLine[]
}

export interface ManualEntryListItem {
  id: number
  entry_date: string
  description: string | null
  verification_number: number
  verification_series: string
  total_amount_ore: number
  journal_entry_id: number
  je_status: string
  corrects_entry_id: number | null
  corrected_by_id: number | null
}

export interface ImportedEntryListItem {
  journal_entry_id: number
  verification_number: number
  verification_series: string
  journal_date: string
  description: string | null
  source_reference: string | null
  total_amount_ore: number
}

// === Report types ===
export interface AccountBalance {
  account_number: string
  account_name: string
  total_debit: number
  total_credit: number
  net: number // credit − debit, öre
}

export interface ReportLineResult {
  id: string
  label: string
  netAmount: number
  displayAmount: number
  accounts: {
    accountNumber: string
    accountName: string
    netAmount: number
    displayAmount: number
  }[]
}

export interface ReportGroupResult {
  id: string
  label: string
  lines: ReportLineResult[]
  subtotalNet: number
  subtotalDisplay: number
}

export interface IncomeStatementResult {
  fiscalYear: { startDate: string; endDate: string }
  dateRange?: { from: string; to: string }
  groups: ReportGroupResult[]
  operatingResult: number
  resultAfterFinancial: number
  netResult: number
}

export interface BalanceSheetResult {
  fiscalYear: { startDate: string; endDate: string }
  dateRange?: { from: string; to: string }
  assets: {
    groups: ReportGroupResult[]
    total: number
  }
  equityAndLiabilities: {
    groups: ReportGroupResult[]
    calculatedNetResult: number
    total: number
  }
  balanceDifference: number
}

export interface ExportWriteFileResult {
  filePath?: string
  cancelled?: boolean
}

// === Finalized Invoice (for PDF generation) ===
export interface FinalizedInvoiceLine {
  id: number
  invoice_id: number
  description: string
  quantity: number
  unit_price_ore: number // öre
  line_total_ore: number // öre
  vat_amount_ore: number // öre
  vat_code_id: number
  // JOINade fält:
  vat_rate: number // procent (25, 12, 6, 0)
  vat_code_name: string
}

export interface FinalizedInvoice {
  id: number
  fiscal_year_id: number
  counterparty_id: number
  invoice_type: string
  invoice_number: string
  status: string
  invoice_date: string
  due_date: string
  payment_terms: number
  total_amount_ore: number // öre
  net_amount_ore: number // öre
  vat_amount_ore: number // öre
  credits_invoice_id: number | null
  credits_invoice_number: string | null
  // JOINade fält:
  customer_name: string
  customer_org_number: string | null
  customer_address: string | null
  customer_postal_code: string | null
  customer_city: string | null
  // Rader:
  lines: FinalizedInvoiceLine[]
}

// === Expense Draft Input types (mirrors Zod schemas in ipc-schemas.ts) ===
export interface ExpenseLineInput {
  description: string
  account_number: string
  quantity: number
  unit_price_ore: number
  vat_code_id: number
  sort_order?: number
}

export interface SaveExpenseDraftInput {
  fiscal_year_id: number
  counterparty_id: number
  supplier_invoice_number?: string | null
  expense_date: string
  due_date?: string | null
  description: string
  payment_terms?: number
  notes?: string | null
  lines: ExpenseLineInput[]
}

export interface UpdateExpenseDraftInput {
  id: number
  counterparty_id: number
  supplier_invoice_number?: string | null
  expense_date: string
  due_date?: string | null
  description: string
  payment_terms?: number
  notes?: string | null
  lines: ExpenseLineInput[]
}

// === Manual Entry Draft Input types (mirrors Zod schemas in ipc-schemas.ts) ===
export interface ManualEntryLineInput {
  account_number: string
  debit_ore: number
  credit_ore: number
  description?: string
}

export interface SaveManualEntryDraftInput {
  fiscal_year_id: number
  entry_date?: string
  description?: string
  lines: ManualEntryLineInput[]
}

export interface UpdateManualEntryDraftInput {
  id: number
  entry_date?: string
  description?: string
  lines: ManualEntryLineInput[]
}

// === Payment Batch ===
export interface PaymentBatch {
  id: number
  fiscal_year_id: number
  batch_type: 'invoice' | 'expense'
  payment_date: string
  account_number: string
  bank_fee_ore: number
  bank_fee_journal_entry_id: number | null
  status: 'completed' | 'partial' | 'cancelled'
  user_note: string | null
  created_at: string
}

export interface BulkPaymentItem {
  invoice_id?: number
  expense_id?: number
  amount_ore: number
}

export interface BulkPaymentResult {
  batch_id: number | null
  status: 'completed' | 'partial' | 'cancelled'
  succeeded: Array<{ id: number; payment_id: number; journal_entry_id: number }>
  failed: Array<{ id: number; error: string; code: string }>
  bank_fee_journal_entry_id: number | null
}

export interface ExpenseDraftListItem {
  id: number
  counterparty_name: string
  supplier_invoice_number: string | null
  expense_date: string
  description: string
  total_amount_ore: number
  created_at: string
}

// === Budget ===

export interface BudgetTarget {
  id: number
  fiscal_year_id: number
  line_id: string
  period_number: number
  amount_ore: number
  created_at: string
  updated_at: string
}

export interface SaveBudgetTargetItem {
  line_id: string
  period_number: number
  amount_ore: number
}

export interface BudgetLineMeta {
  lineId: string
  label: string
  groupId: string
  groupLabel: string
  signMultiplier: 1 | -1
}

export interface BudgetVariancePeriod {
  periodNumber: number
  budgetOre: number
  actualOre: number
  varianceOre: number
  variancePercent: number | null
}

export interface BudgetVarianceLine extends BudgetLineMeta {
  periods: BudgetVariancePeriod[]
  totalBudgetOre: number
  totalActualOre: number
  totalVarianceOre: number
  totalVariancePercent: number | null
}

export interface BudgetVarianceReport {
  lines: BudgetVarianceLine[]
}

export interface BudgetSummaryByYear {
  year_id: number
  total_budget_ore: number
  total_spent_ore: number
}

// === Accruals (Periodiseringar) ===

export type AccrualType =
  | 'prepaid_expense'
  | 'accrued_expense'
  | 'prepaid_income'
  | 'accrued_income'

export interface AccrualSchedule {
  id: number
  fiscal_year_id: number
  description: string
  accrual_type: AccrualType
  balance_account: string
  result_account: string
  total_amount_ore: number
  period_count: number
  start_period: number
  is_active: number
  created_at: string
}

export interface CreateAccrualScheduleInput {
  fiscal_year_id: number
  description: string
  accrual_type: AccrualType
  balance_account: string
  result_account: string
  total_amount_ore: number
  period_count: number
  start_period: number
}

export interface AccrualPeriodStatus {
  periodNumber: number
  executed: boolean
  journalEntryId?: number
  amountOre: number
}

export interface AccrualScheduleWithStatus extends AccrualSchedule {
  periodStatuses: AccrualPeriodStatus[]
  executedCount: number
  remainingOre: number
}

// === Fixed Assets / Depreciation (Sprint 53 F62) ===

export type DepreciationMethod = 'linear' | 'declining'
export type FixedAssetStatus = 'active' | 'disposed' | 'fully_depreciated'
export type DepreciationScheduleStatus = 'pending' | 'executed' | 'skipped'

export interface FixedAsset {
  id: number
  company_id: number
  name: string
  acquisition_date: string
  acquisition_cost_ore: number
  residual_value_ore: number
  useful_life_months: number
  method: DepreciationMethod
  declining_rate_bp: number | null
  account_asset: string
  account_accumulated_depreciation: string
  account_depreciation_expense: string
  status: FixedAssetStatus
  disposed_date: string | null
  disposed_journal_entry_id: number | null
  created_at: string
  updated_at: string
}

export interface CreateFixedAssetInput {
  name: string
  acquisition_date: string
  acquisition_cost_ore: number
  residual_value_ore: number
  useful_life_months: number
  method: DepreciationMethod
  declining_rate_bp?: number
  account_asset: string
  account_accumulated_depreciation: string
  account_depreciation_expense: string
}

export type UpdateFixedAssetInput = CreateFixedAssetInput

export interface DepreciationSchedule {
  id: number
  fixed_asset_id: number
  period_number: number
  period_start: string
  period_end: string
  amount_ore: number
  journal_entry_id: number | null
  status: DepreciationScheduleStatus
  created_at: string
}

export interface FixedAssetWithAccumulation extends FixedAsset {
  accumulated_depreciation_ore: number
  book_value_ore: number
  schedules_generated: number
  schedules_executed: number
}

export interface FixedAssetWithSchedule extends FixedAssetWithAccumulation {
  schedule: DepreciationSchedule[]
}

export interface ExecuteDepreciationPeriodResult {
  succeeded: Array<{
    asset_id: number
    schedule_id: number
    journal_entry_id: number
    amount_ore: number
  }>
  failed: Array<{
    asset_id: number
    schedule_id: number
    error: string
    code: ErrorCode
  }>
  batch_status: 'completed' | 'partial' | 'cancelled'
}

// === Inkorgen / receipts (Sprint VS-106..115) ===
export type ReceiptStatus = 'inbox' | 'booked' | 'archived'

export interface Receipt {
  id: number
  company_id: number
  file_path: string
  original_filename: string
  file_hash: string
  file_size_bytes: number
  mime_type: string
  uploaded_at: string
  status: ReceiptStatus
  expense_id: number | null
  notes: string | null
  archived_at: string | null
}

export interface ReceiptListInput {
  company_id: number
  status?: ReceiptStatus
}

export interface CreateReceiptInput {
  company_id: number
  source_path: string
  original_filename: string
  notes?: string | null
}

export interface UpdateReceiptNotesInput {
  id: number
  company_id: number
  notes: string | null
}

export interface ArchiveReceiptInput {
  id: number
  company_id: number
}

export interface BulkArchiveReceiptInput {
  ids: number[]
  company_id: number
}

export interface ReceiptCounts {
  inbox: number
  booked: number
  archived: number
}
