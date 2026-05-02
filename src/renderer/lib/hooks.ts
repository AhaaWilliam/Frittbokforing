import type {
  Company,
  CreateCompanyInput,
  UpdateCompanyInput,
  FiscalYear,
  FiscalPeriod,
  Counterparty,
  CreateCounterpartyInput,
  UpdateCounterpartyInput,
  Product,
  CustomerPrice,
  CreateProductInput,
  UpdateProductInput,
  VatCode,
  Account,
  Invoice,
  InvoiceWithLines,
  SaveDraftInput,
  UpdateDraftInput,
  DashboardSummary,
  LatestVerification,
  TaxForecast,
  VatReport,
  IncomeStatementResult,
  BalanceSheetResult,
  ExportWriteFileResult,
  ExpenseWithLines,
  SaveExpenseDraftInput,
  UpdateExpenseDraftInput,
  SaveManualEntryDraftInput,
  UpdateManualEntryDraftInput,
  BulkPaymentResult,
  IpcResult,
  AccrualScheduleWithStatus,
  CreateAccrualScheduleInput,
  BudgetLineMeta,
  BudgetTarget,
  BudgetVarianceReport,
  SaveBudgetTargetItem,
} from '../../shared/types'
import { useIpcQuery } from './use-ipc-query'
import { useIpcMutation } from './use-ipc-mutation'
import { queryKeys } from './query-keys'
import { markFlashable } from './flashable'
import { useActiveCompany } from '../contexts/ActiveCompanyContext'

// === Company ===

export function useCompany() {
  return useIpcQuery<Company | null>(queryKeys.company(), () =>
    window.api.getCompany(),
  )
}

export function useCreateCompany() {
  return useIpcMutation<CreateCompanyInput, Company>(
    (data) => window.api.createCompany(data),
    { invalidate: [queryKeys.company(), queryKeys.companies()] },
  )
}

export function useUpdateCompany() {
  return useIpcMutation<UpdateCompanyInput, Company>(
    (data) => window.api.updateCompany(data),
    { invalidate: [queryKeys.company()] },
  )
}

export function useCompanies() {
  return useIpcQuery<Company[]>(queryKeys.companies(), () =>
    window.api.listCompanies(),
  )
}

export function useSwitchCompany() {
  // Bolagsbyte ändrar scope för ALLA queries — invalidera hela cachen.
  return useIpcMutation<number, Company>(
    (companyId) => window.api.switchCompany({ company_id: companyId }),
    { invalidateAll: true },
  )
}

// === Fiscal Years ===

export function useFiscalYears() {
  return useIpcQuery<FiscalYear[]>(queryKeys.fiscalYears(), () =>
    window.api.listFiscalYears(),
  )
}

export function useSwitchFiscalYear() {
  return useIpcMutation<number, FiscalYear>(
    (fiscalYearId) => window.api.switchFiscalYear({ fiscalYearId }),
    { invalidateAll: true },
  )
}

export function useCreateNewFiscalYear() {
  return useIpcMutation(
    (data: { confirmBookResult: boolean; netResultOre?: number }) =>
      window.api.createNewFiscalYear(data),
    { invalidateAll: true },
  )
}

export function useNetResult(fiscalYearId: number | undefined) {
  return useIpcQuery(
    queryKeys.netResult(fiscalYearId!),
    () => window.api.getNetResult({ fiscalYearId: fiscalYearId! }),
    { enabled: !!fiscalYearId },
  )
}

export function useReTransferOpeningBalance() {
  return useIpcMutation<void, unknown>(
    () => window.api.reTransferOpeningBalance(),
    { invalidateAll: true },
  )
}

// === Fiscal Periods ===

export function useFiscalPeriods(fiscalYearId: number | undefined) {
  return useIpcQuery<FiscalPeriod[]>(
    queryKeys.fiscalPeriods(fiscalYearId!),
    () => window.api.listFiscalPeriods({ fiscal_year_id: fiscalYearId! }),
    { enabled: !!fiscalYearId },
  )
}

export function useClosePeriod(fiscalYearId: number | undefined) {
  return useIpcMutation<{ period_id: number }, FiscalPeriod>(
    (data) => window.api.closePeriod(data),
    {
      invalidate: fiscalYearId ? [queryKeys.fiscalPeriods(fiscalYearId)] : [],
    },
  )
}

export function useReopenPeriod(fiscalYearId: number | undefined) {
  return useIpcMutation<{ period_id: number }, FiscalPeriod>(
    (data) => window.api.reopenPeriod(data),
    {
      invalidate: fiscalYearId ? [queryKeys.fiscalPeriods(fiscalYearId)] : [],
    },
  )
}

// === Counterparties ===

// === Counterparties (Sprint MC3: scopas per bolag via ActiveCompanyContext) ===
//
// Mönster: alla hooks läser companyId från useActiveCompany() och injicerar
// i IPC-payload. Pickers, sidor och dialogs slipper därmed propsa company_id.
// Mutations: hooken stoppar in company_id automatiskt så caller skickar bara
// domän-fält. CompanySwitcher invaliderar redan hela cachen vid bolagsbyte.

export function useCounterparties(params?: {
  search?: string
  type?: string
  active_only?: boolean
}) {
  const { activeCompany } = useActiveCompany()
  const companyId = activeCompany?.id
  return useIpcQuery<Counterparty[]>(
    queryKeys.counterparties({
      ...(params ?? {}),
      company_id: companyId,
    } as Record<string, unknown>),
    () =>
      window.api.listCounterparties({
        company_id: companyId!,
        ...(params ?? {}),
      }),
    { enabled: !!companyId },
  )
}

export function useCounterparty(id: number | undefined) {
  const { activeCompany } = useActiveCompany()
  const companyId = activeCompany?.id
  return useIpcQuery<Counterparty | null>(
    queryKeys.counterparty(id!),
    () => window.api.getCounterparty({ id: id!, company_id: companyId! }),
    { enabled: !!id && !!companyId },
  )
}

export function useCreateCounterparty() {
  const { activeCompany } = useActiveCompany()
  const companyId = activeCompany?.id
  return useIpcMutation<
    Omit<CreateCounterpartyInput, 'company_id'>,
    Counterparty
  >(
    (data) =>
      window.api.createCounterparty({
        ...data,
        company_id: companyId!,
      } as CreateCounterpartyInput),
    { invalidate: [queryKeys.counterparties()] },
  )
}

export function useUpdateCounterparty() {
  const { activeCompany } = useActiveCompany()
  const companyId = activeCompany?.id
  return useIpcMutation<
    Omit<UpdateCounterpartyInput, 'company_id'>,
    Counterparty
  >(
    (data) =>
      window.api.updateCounterparty({
        ...data,
        company_id: companyId!,
      } as UpdateCounterpartyInput),
    { invalidate: [queryKeys.counterparties()] },
  )
}

export function useDeactivateCounterparty() {
  const { activeCompany } = useActiveCompany()
  const companyId = activeCompany?.id
  return useIpcMutation<{ id: number }, Counterparty>(
    (data) =>
      window.api.deactivateCounterparty({
        id: data.id,
        company_id: companyId!,
      }),
    { invalidate: [queryKeys.counterparties()] },
  )
}

// === Products (Sprint MC3: scopas per bolag) ===

export function useProducts(params?: {
  search?: string
  type?: string
  active_only?: boolean
}) {
  const { activeCompany } = useActiveCompany()
  const companyId = activeCompany?.id
  return useIpcQuery<Product[]>(
    queryKeys.products({
      ...(params ?? {}),
      company_id: companyId,
    } as Record<string, unknown>),
    () =>
      window.api.listProducts({ company_id: companyId!, ...(params ?? {}) }),
    { enabled: !!companyId },
  )
}

export function useProduct(id: number | undefined) {
  const { activeCompany } = useActiveCompany()
  const companyId = activeCompany?.id
  return useIpcQuery<(Product & { customer_prices: CustomerPrice[] }) | null>(
    queryKeys.product(id!),
    () => window.api.getProduct({ id: id!, company_id: companyId! }),
    { enabled: !!id && !!companyId },
  )
}

export function useCreateProduct() {
  const { activeCompany } = useActiveCompany()
  const companyId = activeCompany?.id
  return useIpcMutation<Omit<CreateProductInput, 'company_id'>, Product>(
    (data) =>
      window.api.createProduct({
        ...data,
        company_id: companyId!,
      } as CreateProductInput),
    { invalidate: [queryKeys.products()] },
  )
}

export function useUpdateProduct() {
  const { activeCompany } = useActiveCompany()
  const companyId = activeCompany?.id
  return useIpcMutation<Omit<UpdateProductInput, 'company_id'>, Product>(
    (data) =>
      window.api.updateProduct({
        ...data,
        company_id: companyId!,
      } as UpdateProductInput),
    { invalidate: [queryKeys.products()] },
  )
}

export function useDeactivateProduct() {
  const { activeCompany } = useActiveCompany()
  const companyId = activeCompany?.id
  return useIpcMutation<{ id: number }, Product>(
    (data) =>
      window.api.deactivateProduct({ id: data.id, company_id: companyId! }),
    { invalidate: [queryKeys.products()] },
  )
}

export function useSetCustomerPrice(productId: number | undefined) {
  const { activeCompany } = useActiveCompany()
  const companyId = activeCompany?.id
  return useIpcMutation<
    { product_id: number; counterparty_id: number; price_ore: number },
    CustomerPrice
  >(
    (data) => window.api.setCustomerPrice({ ...data, company_id: companyId! }),
    {
      invalidate: productId ? [queryKeys.product(productId)] : [],
    },
  )
}

export function useRemoveCustomerPrice(productId: number | undefined) {
  const { activeCompany } = useActiveCompany()
  const companyId = activeCompany?.id
  return useIpcMutation<
    { product_id: number; counterparty_id: number },
    undefined
  >(
    (data) =>
      window.api.removeCustomerPrice({ ...data, company_id: companyId! }),
    {
      invalidate: productId ? [queryKeys.product(productId)] : [],
    },
  )
}

// === Stödjande ===

export function useVatCodes(direction?: 'outgoing' | 'incoming') {
  return useIpcQuery<VatCode[]>(queryKeys.vatCodes(direction), () =>
    window.api.listVatCodes({ direction }),
  )
}

export function useAccounts(
  fiscalRule: 'K2' | 'K3',
  accountClass?: number,
  isActive?: boolean,
) {
  return useIpcQuery<Account[]>(
    queryKeys.accounts(fiscalRule, accountClass, isActive),
    () =>
      window.api.listAccounts({
        fiscal_rule: fiscalRule,
        class: accountClass,
        is_active: isActive,
      }),
  )
}

export function useAllAccounts(isActive?: boolean) {
  return useIpcQuery<Account[]>(queryKeys.allAccounts(isActive), () =>
    window.api.listAllAccounts({ is_active: isActive }),
  )
}

export function useCreateAccount() {
  return useIpcMutation(
    (data: {
      account_number: string
      name: string
      k2_allowed: boolean
      k3_only: boolean
    }) => window.api.accountCreate(data),
    {
      invalidate: [
        queryKeys.accounts('K2'),
        queryKeys.accounts('K3'),
        queryKeys.allAccounts(),
      ],
    },
  )
}

export function useUpdateAccount() {
  return useIpcMutation(
    (data: {
      account_number: string
      name: string
      k2_allowed: boolean
      k3_only: boolean
    }) => window.api.accountUpdate(data),
    {
      invalidate: [
        queryKeys.accounts('K2'),
        queryKeys.accounts('K3'),
        queryKeys.allAccounts(),
      ],
    },
  )
}

export function useToggleAccountActive() {
  return useIpcMutation(
    (data: { account_number: string; is_active: boolean }) =>
      window.api.accountToggleActive(data),
    {
      invalidate: [
        queryKeys.accounts('K2'),
        queryKeys.accounts('K3'),
        queryKeys.allAccounts(),
      ],
    },
  )
}

// === Account Statement ===

export function useAccountStatement(
  fiscalYearId: number | undefined,
  accountNumber: string | undefined,
  dateFrom?: string,
  dateTo?: string,
) {
  return useIpcQuery(
    queryKeys.accountStatement(fiscalYearId!, accountNumber!, dateFrom, dateTo),
    () =>
      window.api.getAccountStatement({
        fiscal_year_id: fiscalYearId!,
        account_number: accountNumber!,
        date_from: dateFrom,
        date_to: dateTo,
      }),
    { enabled: !!fiscalYearId && !!accountNumber },
  )
}

// === Invoice Drafts ===

export function useDraftInvoices(fiscalYearId: number | undefined) {
  return useIpcQuery<(Invoice & { counterparty_name: string })[]>(
    queryKeys.invoiceDrafts(fiscalYearId!),
    () => window.api.listDrafts({ fiscal_year_id: fiscalYearId! }),
    { enabled: !!fiscalYearId },
  )
}

export function useDraftInvoice(id: number | undefined) {
  return useIpcQuery<InvoiceWithLines | null>(
    queryKeys.invoice(id!),
    () => window.api.getDraft({ id: id! }),
    { enabled: !!id },
  )
}

export function useSaveDraft(fiscalYearId: number | undefined) {
  return useIpcMutation<SaveDraftInput, InvoiceWithLines>(
    (data) => window.api.saveDraft(data),
    {
      invalidate: fiscalYearId ? [queryKeys.invoiceDrafts(fiscalYearId)] : [],
    },
  )
}

export function useUpdateDraft(fiscalYearId: number | undefined) {
  return useIpcMutation<UpdateDraftInput, InvoiceWithLines>(
    (data) => window.api.updateDraft(data),
    {
      invalidate: fiscalYearId ? [queryKeys.invoiceDrafts(fiscalYearId)] : [],
    },
  )
}

export function useDeleteDraft(fiscalYearId: number | undefined) {
  return useIpcMutation<{ id: number }, undefined>(
    (data) => window.api.deleteDraft(data),
    {
      invalidate: fiscalYearId ? [queryKeys.invoiceDrafts(fiscalYearId)] : [],
    },
  )
}

export function useCreateCreditNoteDraft(fiscalYearId: number | undefined) {
  return useIpcMutation<
    { original_invoice_id: number; fiscal_year_id: number },
    InvoiceWithLines
  >((data) => window.api.createCreditNoteDraft(data), {
    invalidate: fiscalYearId
      ? [queryKeys.invoiceDrafts(fiscalYearId), queryKeys.allInvoices()]
      : [],
  })
}

export function usePayInvoice() {
  return useIpcMutation(
    (input: {
      invoice_id: number
      amount_ore: number
      payment_date: string
      payment_method: string
      account_number: string
    }) => window.api.payInvoice(input),
    {
      invalidate: [
        queryKeys.allInvoices(),
        queryKeys.anyInvoice(),
        queryKeys.allPayments(),
      ],
    },
  )
}

export function useBulkPayInvoices() {
  return useIpcMutation<
    {
      payments: Array<{ invoice_id: number; amount_ore: number }>
      payment_date: string
      account_number: string
      bank_fee_ore?: number
      user_note?: string
    },
    BulkPaymentResult
  >(
    (input) =>
      window.api.payInvoicesBulk(input) as Promise<
        IpcResult<BulkPaymentResult>
      >,
    {
      invalidate: [
        queryKeys.allInvoices(),
        queryKeys.anyInvoice(),
        queryKeys.allPayments(),
      ],
    },
  )
}

export function useInvoicePayments(invoiceId: number | undefined) {
  return useIpcQuery(
    queryKeys.invoicePayments(invoiceId!),
    () => window.api.getPayments({ invoice_id: invoiceId! }),
    { enabled: !!invoiceId },
  )
}

export function useInvoiceList(
  fiscalYearId: number | undefined,
  filters: {
    status?: string
    search?: string
    sort_by?: string
    sort_order?: string
    limit?: number
    offset?: number
  } = {},
) {
  return useIpcQuery(
    queryKeys.invoiceList(fiscalYearId!, filters as Record<string, unknown>),
    () =>
      window.api.listInvoices({
        fiscal_year_id: fiscalYearId!,
        ...filters,
      }),
    { enabled: !!fiscalYearId },
  )
}

export function useFinalizeInvoice(_fiscalYearId?: number | undefined) {
  return useIpcMutation<
    { id: number },
    { id: number; verification_number: number }
  >((data) => window.api.finalizeInvoice(data), {
    invalidate: [queryKeys.allInvoices(), queryKeys.anyInvoice()],
    onSuccess: (data) => {
      // VS-45: flash-markering för listvyn.
      markFlashable('invoice', data.id)
    },
  })
}

export function useUpdateSentInvoice() {
  return useIpcMutation<
    {
      id: number
      notes?: string | null
      payment_terms?: number
      due_date?: string
    },
    Invoice
  >((data) => window.api.updateSentInvoice(data), {
    invalidate: [queryKeys.anyInvoice(), queryKeys.allInvoices()],
  })
}

export function useNextInvoiceNumber(fiscalYearId: number | undefined) {
  return useIpcQuery<{ preview: number }>(
    queryKeys.invoiceNextNumber(fiscalYearId!),
    () => window.api.nextInvoiceNumber({ fiscal_year_id: fiscalYearId! }),
    { enabled: !!fiscalYearId },
  )
}

// === Expenses ===

export function useExpenseDrafts(fiscalYearId: number | undefined) {
  return useIpcQuery(
    queryKeys.expenseDrafts(fiscalYearId!),
    () => window.api.listExpenseDrafts({ fiscal_year_id: fiscalYearId! }),
    { enabled: !!fiscalYearId },
  )
}

export function useExpenseDraft(id: number | undefined) {
  return useIpcQuery(
    queryKeys.expenseDraft(id!),
    () => window.api.getExpenseDraft({ id: id! }),
    { enabled: !!id },
  )
}

export function useSaveExpenseDraft() {
  return useIpcMutation<SaveExpenseDraftInput, ExpenseWithLines>(
    (data) => window.api.saveExpenseDraft(data),
    {
      invalidate: [queryKeys.allExpenseDrafts(), queryKeys.allExpenses()],
    },
  )
}

export function useUpdateExpenseDraft() {
  return useIpcMutation<UpdateExpenseDraftInput, ExpenseWithLines>(
    (data) => window.api.updateExpenseDraft(data),
    {
      invalidate: [
        queryKeys.allExpenseDrafts(),
        queryKeys.allExpenses(),
        ['expense-draft'],
      ],
    },
  )
}

export function useDeleteExpenseDraft() {
  return useIpcMutation<{ id: number }, undefined>(
    (data) => window.api.deleteExpenseDraft(data),
    {
      invalidate: [queryKeys.allExpenseDrafts(), queryKeys.allExpenses()],
    },
  )
}

export function useFinalizeExpense() {
  return useIpcMutation<
    { id: number },
    { id: number; verification_number: number }
  >((data) => window.api.finalizeExpense(data), {
    invalidate: [queryKeys.allExpenseDrafts(), queryKeys.allExpenses()],
    onSuccess: (data) => {
      // VS-45: markera den nyfinaliserade kostnaden för flash-animation
      // i listvyn när användaren navigerar dit.
      markFlashable('expense', data.id)
    },
  })
}

export function useExpense(id: number | undefined) {
  return useIpcQuery(
    queryKeys.expense(id!),
    () => window.api.getExpense({ id: id! }),
    { enabled: !!id },
  )
}

export function useCreateExpenseCreditNoteDraft(
  fiscalYearId: number | undefined,
) {
  return useIpcMutation<
    { original_expense_id: number; fiscal_year_id: number },
    { id: number }
  >((data) => window.api.createExpenseCreditNoteDraft(data), {
    invalidate: fiscalYearId
      ? [queryKeys.allExpenseDrafts(), queryKeys.allExpenses()]
      : [],
  })
}

export function usePayExpense() {
  return useIpcMutation(
    (input: {
      expense_id: number
      amount_ore: number
      payment_date: string
      payment_method: string
      account_number: string
    }) => window.api.payExpense(input),
    {
      invalidate: [
        queryKeys.allExpenseDrafts(),
        queryKeys.allExpenses(),
        queryKeys.anyExpense(),
        queryKeys.allExpensePayments(),
      ],
    },
  )
}

export function useBulkPayExpenses() {
  return useIpcMutation<
    {
      payments: Array<{ expense_id: number; amount_ore: number }>
      payment_date: string
      account_number: string
      bank_fee_ore?: number
      user_note?: string
    },
    BulkPaymentResult
  >(
    (input) =>
      window.api.payExpensesBulk(input) as Promise<
        IpcResult<BulkPaymentResult>
      >,
    {
      invalidate: [
        queryKeys.allExpenseDrafts(),
        queryKeys.allExpenses(),
        queryKeys.anyExpense(),
        queryKeys.allExpensePayments(),
      ],
    },
  )
}

export function useExpensePayments(expenseId: number | undefined) {
  return useIpcQuery(
    queryKeys.expensePayments(expenseId!),
    () => window.api.getExpensePayments({ expense_id: expenseId! }),
    { enabled: !!expenseId },
  )
}

export function useExpenses(
  fiscalYearId: number | undefined,
  filters?: {
    status?: string
    search?: string
    sort_by?: string
    sort_order?: 'asc' | 'desc'
    limit?: number
    offset?: number
  },
) {
  return useIpcQuery(
    [
      ...queryKeys.expenses(
        fiscalYearId!,
        filters?.status,
        filters?.search,
        filters?.sort_by,
        filters?.sort_order,
      ),
      filters?.limit ?? null,
      filters?.offset ?? null,
    ],
    () =>
      window.api.listExpenses({
        fiscal_year_id: fiscalYearId!,
        ...filters,
      }),
    { enabled: !!fiscalYearId },
  )
}

// === Dashboard ===

export function useDashboardSummary(fiscalYearId: number | undefined) {
  return useIpcQuery<DashboardSummary>(
    queryKeys.dashboard(fiscalYearId!),
    () => window.api.getDashboardSummary({ fiscalYearId: fiscalYearId! }),
    { enabled: !!fiscalYearId, staleTime: 30_000 },
  )
}

// VS-42: Senast bokförda verifikatet inom fiscal year, för hero-pill.
export function useLatestVerification(fiscalYearId: number | undefined) {
  return useIpcQuery<LatestVerification | null>(
    queryKeys.latestVerification(fiscalYearId!),
    () => window.api.getLatestVerification({ fiscalYearId: fiscalYearId! }),
    { enabled: !!fiscalYearId, staleTime: 10_000 },
  )
}

// === VAT Report ===

export function useVatReport(fiscalYearId: number | undefined) {
  return useIpcQuery<VatReport>(
    queryKeys.vatReport(fiscalYearId!),
    () => window.api.getVatReport({ fiscal_year_id: fiscalYearId! }),
    { enabled: !!fiscalYearId, staleTime: 30_000 },
  )
}

// === Tax ===

export function useTaxForecast(fiscalYearId: number | undefined) {
  return useIpcQuery<TaxForecast>(
    queryKeys.taxForecast(fiscalYearId!),
    () => window.api.getTaxForecast({ fiscalYearId: fiscalYearId! }),
    { enabled: !!fiscalYearId, staleTime: 30_000 },
  )
}

// === Manual Entries ===

export function useManualEntryDrafts(fiscalYearId: number | undefined) {
  return useIpcQuery(
    queryKeys.manualEntryDrafts(fiscalYearId!),
    () => window.api.listManualEntryDrafts({ fiscal_year_id: fiscalYearId! }),
    { enabled: !!fiscalYearId },
  )
}

export function useManualEntries(fiscalYearId: number | undefined) {
  return useIpcQuery(
    queryKeys.manualEntries(fiscalYearId!),
    () => window.api.listManualEntries({ fiscal_year_id: fiscalYearId! }),
    { enabled: !!fiscalYearId },
  )
}

export function useManualEntry(id: number | undefined) {
  return useIpcQuery(
    queryKeys.manualEntry(id!),
    () => window.api.getManualEntry({ id: id! }),
    { enabled: !!id },
  )
}

export function useImportedEntries(fiscalYearId: number | undefined) {
  return useIpcQuery(
    queryKeys.importedEntries(fiscalYearId!),
    () => window.api.listImportedEntries({ fiscal_year_id: fiscalYearId! }),
    { enabled: !!fiscalYearId },
  )
}

export function useSaveManualEntryDraft() {
  return useIpcMutation<SaveManualEntryDraftInput, { id: number }>(
    (data) => window.api.saveManualEntryDraft(data),
    { invalidate: [queryKeys.allManualEntryDrafts()] },
  )
}

export function useUpdateManualEntryDraft() {
  return useIpcMutation<UpdateManualEntryDraftInput, void>(
    (data) => window.api.updateManualEntryDraft(data),
    {
      invalidate: [
        queryKeys.allManualEntryDrafts(),
        queryKeys.anyManualEntry(),
      ],
    },
  )
}

export function useDeleteManualEntryDraft() {
  return useIpcMutation<{ id: number }, void>(
    (data) => window.api.deleteManualEntryDraft(data),
    { invalidate: [queryKeys.allManualEntryDrafts()] },
  )
}

// === Reports ===

export function useIncomeStatement(
  fiscalYearId: number | undefined,
  dateRange?: { from: string; to: string },
) {
  return useIpcQuery<IncomeStatementResult>(
    queryKeys.incomeStatement(fiscalYearId!, dateRange),
    () =>
      window.api.getIncomeStatement({
        fiscal_year_id: fiscalYearId!,
        date_range: dateRange,
      }),
    { enabled: !!fiscalYearId, staleTime: 30_000 },
  )
}

export function useBalanceSheet(
  fiscalYearId: number | undefined,
  dateRange?: { from: string; to: string },
) {
  return useIpcQuery<BalanceSheetResult>(
    queryKeys.balanceSheet(fiscalYearId!, dateRange),
    () =>
      window.api.getBalanceSheet({
        fiscal_year_id: fiscalYearId!,
        date_range: dateRange,
      }),
    { enabled: !!fiscalYearId, staleTime: 30_000 },
  )
}

export function useCashFlow(fiscalYearId: number | undefined) {
  return useIpcQuery<
    import('../../main/services/cash-flow-service').CashFlowReport
  >(
    queryKeys.cashFlow(fiscalYearId!),
    () => window.api.getCashFlowStatement({ fiscal_year_id: fiscalYearId! }),
    { enabled: !!fiscalYearId, staleTime: 30_000 },
  )
}

// === Bank statements (Sprint 55 F66-a) ===
export function useBankStatements(fiscalYearId: number | undefined) {
  return useIpcQuery<
    import('../../main/services/bank/bank-statement-service').BankStatementSummary[]
  >(
    queryKeys.bankStatements(fiscalYearId!),
    () => window.api.listBankStatements({ fiscal_year_id: fiscalYearId! }),
    { enabled: !!fiscalYearId, staleTime: 10_000 },
  )
}

export function useBankStatement(statementId: number | undefined) {
  return useIpcQuery<
    | import('../../main/services/bank/bank-statement-service').BankStatementDetail
    | null
  >(
    queryKeys.bankStatement(statementId!),
    () => window.api.getBankStatement({ statement_id: statementId! }),
    { enabled: !!statementId, staleTime: 5_000 },
  )
}

export function useImportBankStatement() {
  return useIpcMutation<
    {
      company_id: number
      fiscal_year_id: number
      xml_content: string
      format?: 'camt.053' | 'camt.054'
    },
    import('../../main/services/bank/bank-statement-service').ImportBankStatementResult
  >((data) => window.api.importBankStatement(data), {
    invalidate: [queryKeys.allBankStatements()],
  })
}

export function useMatchBankTransaction() {
  return useIpcMutation<
    {
      bank_transaction_id: number
      matched_entity_type: 'invoice' | 'expense'
      matched_entity_id: number
      payment_account: string
    },
    import('../../main/services/bank/bank-match-service').MatchBankTransactionResult
  >((data) => window.api.matchBankTransaction(data), {
    invalidate: [
      queryKeys.allBankStatements(),
      queryKeys.allInvoices(),
      queryKeys.allExpenses(),
    ],
  })
}

export function useSuggestBankMatches(
  statementId: number | undefined,
  enabled: boolean,
) {
  return useIpcQuery<
    import('../../main/services/bank/bank-match-suggester').TxSuggestion[]
  >(
    queryKeys.bankSuggestMatches(statementId!),
    () => window.api.suggestBankMatches({ statement_id: statementId! }),
    { enabled: !!statementId && enabled, staleTime: 30_000 },
  )
}

// S58 F66-d: skapa bank-fee-verifikat för auto-klassificerad TX
export function useCreateBankFeeEntry() {
  return useIpcMutation<
    {
      bank_transaction_id: number
      payment_account: string
      skipChronologyCheck?: boolean
    },
    import('../../main/services/bank/bank-fee-entry-service').CreateBankFeeEntryResult
  >((data) => window.api.createBankFeeEntry(data), {
    invalidate: [queryKeys.allBankStatements()],
  })
}

// S58 F66-e: unmatch bank-reconciliation
export function useUnmatchBankTransaction() {
  return useIpcMutation<
    { bank_transaction_id: number; correction_description?: string },
    import('../../main/services/bank/bank-unmatch-service').BankUnmatchResult
  >((data) => window.api.unmatchBankTransaction(data), {
    invalidate: [
      queryKeys.allBankStatements(),
      queryKeys.allInvoices(),
      queryKeys.allExpenses(),
    ],
  })
}

// Sprint F P4: bank_tx_code_mappings CRUD
export function useBankTxMappings() {
  return useIpcQuery<
    import('../../main/services/bank/bank-tx-mapping-service').BankTxMapping[]
  >(queryKeys.bankTxMappings(), () => window.api.listBankTxMappings())
}

export function useUpsertBankTxMapping() {
  return useIpcMutation<
    {
      id?: number
      domain: string
      family: string
      subfamily: string
      classification: 'bank_fee' | 'interest' | 'ignore'
      account_number?: string | null
    },
    import('../../main/services/bank/bank-tx-mapping-service').BankTxMapping
  >((data) => window.api.upsertBankTxMapping(data), {
    invalidate: [queryKeys.bankTxMappings()],
  })
}

export function useDeleteBankTxMapping() {
  return useIpcMutation<{ id: number }, undefined>(
    (data) => window.api.deleteBankTxMapping(data),
    { invalidate: [queryKeys.bankTxMappings()] },
  )
}

// Sprint F P2: unmatch hel payment_batch
export function useUnmatchBankBatch() {
  return useIpcMutation<
    { batch_id: number },
    import('../../main/services/bank/bank-unmatch-service').BankUnmatchBatchResult
  >((data) => window.api.unmatchBankBatch(data), {
    invalidate: [
      queryKeys.allBankStatements(),
      queryKeys.allInvoices(),
      queryKeys.allExpenses(),
      queryKeys.allDashboard(),
      queryKeys.allManualEntries(),
    ],
  })
}

export function useExportWriteFile() {
  return useIpcMutation<
    {
      format: 'sie5' | 'sie4' | 'excel'
      fiscal_year_id: number
      date_range?: { from: string; to: string }
    },
    ExportWriteFileResult
  >((data) => window.api.exportWriteFile(data))
}

export function useFinalizeManualEntry() {
  return useIpcMutation(
    (data: { id: number; fiscal_year_id: number }) =>
      window.api.finalizeManualEntry(data),
    {
      invalidate: [
        queryKeys.allManualEntryDrafts(),
        queryKeys.allManualEntries(),
        queryKeys.allDashboard(),
      ],
      onSuccess: (_data, input) => {
        // VS-45: flash-markering på manual_entry.id (= input.id).
        // finalizeManualEntry returnerar journalEntryId — listvyn visar
        // dock manual_entry.id, så vi tracker det.
        markFlashable('manualEntry', input.id)
      },
    },
  )
}

// === Aging Report ===

export function useAgingReceivables(
  fyId: number | undefined,
  asOfDate?: string,
) {
  return useIpcQuery(
    queryKeys.agingReceivables(fyId!, asOfDate),
    () =>
      window.api.getAgingReceivables({
        fiscal_year_id: fyId!,
        as_of_date: asOfDate,
      }),
    { enabled: !!fyId },
  )
}

export function useAgingPayables(fyId: number | undefined, asOfDate?: string) {
  return useIpcQuery(
    queryKeys.agingPayables(fyId!, asOfDate),
    () =>
      window.api.getAgingPayables({
        fiscal_year_id: fyId!,
        as_of_date: asOfDate,
      }),
    { enabled: !!fyId },
  )
}

// === Global Search ===

export function useGlobalSearch(
  fiscalYearId: number | undefined,
  query: string,
) {
  return useIpcQuery(
    queryKeys.globalSearch(fiscalYearId!, query),
    () =>
      window.api.globalSearch({
        fiscal_year_id: fiscalYearId!,
        query,
      }),
    { enabled: !!fiscalYearId && query.length >= 2 },
  )
}

// === Accruals ===

export function useAccrualSchedules(fiscalYearId: number | undefined) {
  return useIpcQuery<AccrualScheduleWithStatus[]>(
    queryKeys.accrualSchedules(fiscalYearId!),
    () => window.api.getAccrualSchedules({ fiscal_year_id: fiscalYearId! }),
    { enabled: !!fiscalYearId },
  )
}

export function useCreateAccrual() {
  return useIpcMutation<CreateAccrualScheduleInput, { id: number }>(
    (data) => window.api.createAccrualSchedule(data),
    {
      invalidate: (_data, input) => [
        queryKeys.accrualSchedules(input.fiscal_year_id),
      ],
    },
  )
}

export function useExecuteAccrual() {
  return useIpcMutation<
    { schedule_id: number; period_number: number },
    { journalEntryId: number }
  >((data) => window.api.executeAccrual(data), { invalidateAll: true })
}

export function useExecuteAllAccruals() {
  return useIpcMutation<
    { fiscal_year_id: number; period_number: number },
    { executed: number; failed: Array<{ scheduleId: number; error: string }> }
  >((data) => window.api.executeAllAccruals(data), { invalidateAll: true })
}

export function useDeactivateAccrual() {
  return useIpcMutation<{ schedule_id: number }, void>(
    (data) => window.api.deactivateAccrual(data),
    { invalidate: [queryKeys.allAccruals()] },
  )
}

// === Fixed Assets / Depreciation (Sprint 53 F62) ===

export function useFixedAssets(fiscalYearId: number | undefined) {
  return useIpcQuery<import('../../shared/types').FixedAssetWithAccumulation[]>(
    queryKeys.fixedAssets(fiscalYearId),
    () => window.api.listFixedAssets({ fiscal_year_id: fiscalYearId }),
  )
}

export function useFixedAsset(id: number | undefined) {
  return useIpcQuery<import('../../shared/types').FixedAssetWithSchedule>(
    queryKeys.fixedAsset(id!),
    () => window.api.getFixedAsset({ id: id! }),
    { enabled: !!id },
  )
}

export function useCreateFixedAsset() {
  return useIpcMutation<
    import('../../shared/types').CreateFixedAssetInput,
    { id: number; scheduleCount: number }
  >((data) => window.api.createFixedAsset(data), {
    invalidate: [queryKeys.allFixedAssets()],
  })
}

export function useUpdateFixedAsset() {
  return useIpcMutation<
    { id: number; input: import('../../shared/types').UpdateFixedAssetInput },
    { scheduleCount: number }
  >((data) => window.api.updateFixedAsset(data), {
    invalidate: (_data, { id }) => [
      queryKeys.allFixedAssets(),
      queryKeys.fixedAsset(id),
      queryKeys.depreciationSchedule(id),
    ],
  })
}

export function useDisposeFixedAsset() {
  return useIpcMutation<
    {
      id: number
      disposed_date: string
      generate_journal_entry?: boolean
      sale_price_ore?: number
      proceeds_account?: string | null
    },
    void
  >((data) => window.api.disposeFixedAsset(data), {
    invalidate: (_data, { id }) => [
      queryKeys.allFixedAssets(),
      queryKeys.fixedAsset(id),
      queryKeys.allDashboard(),
      queryKeys.allIncomeStatement(),
      queryKeys.allBalanceSheet(),
      queryKeys.allManualEntries(),
    ],
  })
}

export function useDeleteFixedAsset() {
  return useIpcMutation<{ id: number }, void>(
    (data) => window.api.deleteFixedAsset(data),
    { invalidate: [queryKeys.allFixedAssets()] },
  )
}

export function useExecuteDepreciationPeriod() {
  return useIpcMutation<
    { fiscal_year_id: number; period_end_date: string },
    import('../../shared/types').ExecuteDepreciationPeriodResult
  >((data) => window.api.executeDepreciationPeriod(data), {
    invalidate: (_data, { fiscal_year_id }) => [
      queryKeys.allFixedAssets(),
      queryKeys.anyFixedAsset(),
      queryKeys.allDepreciationSchedules(),
      queryKeys.dashboard(fiscal_year_id),
      queryKeys.incomeStatementByFy(fiscal_year_id),
      queryKeys.balanceSheetByFy(fiscal_year_id),
      queryKeys.allManualEntries(),
    ],
  })
}

// === Budget ===

export function useBudgetLines() {
  return useIpcQuery<BudgetLineMeta[]>(queryKeys.budgetLines(), () =>
    window.api.getBudgetLines({}),
  )
}

export function useBudgetTargets(fiscalYearId: number | undefined) {
  return useIpcQuery<BudgetTarget[]>(
    queryKeys.budgetTargets(fiscalYearId!),
    () => window.api.getBudgetTargets({ fiscal_year_id: fiscalYearId! }),
    { enabled: !!fiscalYearId },
  )
}

export function useBudgetVariance(fiscalYearId: number | undefined) {
  return useIpcQuery<BudgetVarianceReport>(
    queryKeys.budgetVariance(fiscalYearId!),
    () => window.api.getBudgetVsActual({ fiscal_year_id: fiscalYearId! }),
    { enabled: !!fiscalYearId, staleTime: 30_000 },
  )
}

export function useSaveBudgetTargets() {
  return useIpcMutation<
    { fiscal_year_id: number; targets: SaveBudgetTargetItem[] },
    { count: number }
  >((data) => window.api.saveBudgetTargets(data), {
    invalidate: (_data, input) => [
      queryKeys.budgetTargets(input.fiscal_year_id),
      queryKeys.budgetVariance(input.fiscal_year_id),
    ],
  })
}

export function useCopyBudgetFromPreviousFy() {
  return useIpcMutation<
    { target_fiscal_year_id: number; source_fiscal_year_id: number },
    { count: number }
  >((data) => window.api.copyBudgetFromPreviousFy(data), {
    invalidate: (_data, input) => [
      queryKeys.budgetTargets(input.target_fiscal_year_id),
      queryKeys.budgetVariance(input.target_fiscal_year_id),
    ],
  })
}

export { useDebouncedSearch } from './use-debounced-search'
