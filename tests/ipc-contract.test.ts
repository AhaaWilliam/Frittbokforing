import { describe, it, expect } from 'vitest'
import {
  FiscalPeriodListInputSchema,
  PeriodActionInputSchema,
  CreateCompanyInputSchema,
  VatNumberSchema,
  CreateCounterpartyInputSchema,
  UpdateCounterpartyInputSchema,
  CounterpartyListInputSchema,
  CounterpartyIdSchema,
  UpdateCompanyInputSchema,
  CreateProductInputSchema,
  UpdateProductInputSchema,
  ProductListInputSchema,
  ProductIdSchema,
  SetCustomerPriceInputSchema,
  RemoveCustomerPriceInputSchema,
  GetPriceForCustomerInputSchema,
  VatCodeListInputSchema,
  AccountListInputSchema,
  AccountListAllInputSchema,
  AccountCreateInputSchema,
  AccountUpdateInputSchema,
  AccountToggleActiveInputSchema,
  InvoiceDraftLineSchema,
  SaveDraftInputSchema,
  UpdateDraftInputSchema,
  InvoiceIdSchema,
  DraftListInputSchema,
  NextNumberInputSchema,
  FinalizeInvoiceInputSchema,
  UpdateSentInvoiceInputSchema,
  InvoiceListInputSchema,
  PayInvoiceInputSchema,
  GetPaymentsInputSchema,
  SaveExpenseDraftSchema,
  UpdateExpenseDraftSchema,
  ExpenseIdSchema,
  ListExpenseDraftsSchema,
  FinalizeExpenseSchema,
  PayExpenseInputSchema,
  GetExpensePaymentsSchema,
  GetExpenseSchema,
  DashboardSummaryInputSchema,
  TaxForecastInputSchema,
  VatReportInputSchema,
  ExportSie5Schema,
  ExportExcelSchema,
  ExportSie4Schema,
  SaveManualEntryDraftSchema,
  UpdateManualEntryDraftSchema,
  ManualEntryIdSchema,
  ManualEntryFinalizeSchema,
  ManualEntryListSchema,
  ReportRequestSchema,
  ExportWriteFileRequestSchema,
  ListExpensesSchema,
  GenerateInvoicePdfSchema,
  SaveInvoicePdfSchema,
  FiscalYearCreateNewInputSchema,
  FiscalYearSwitchInputSchema,
  NetResultInputSchema,
  // Q3: previously uncovered schemas
  PayInvoicesBulkPayloadSchema,
  PayExpensesBulkPayloadSchema,
  BulkPaymentResultSchema,
  BudgetGetSchema,
  BudgetSaveSchema,
  BudgetLinesSchema,
  BudgetVarianceSchema,
  BudgetCopySchema,
  BudgetSummaryByYearSchema,
  DepreciationCreateAssetSchema,
  DepreciationUpdateAssetSchema,
  DepreciationIdSchema,
  DepreciationListSchema,
  DepreciationDisposeSchema,
  DepreciationExecutePeriodSchema,
  SepaDdCreateMandateSchema,
  SepaDdListMandatesSchema,
  SepaDdRevokeMandateSchema,
  SepaDdCreateCollectionSchema,
  SepaDdCreateBatchSchema,
  SepaDdExportPain008Schema,
  SepaDdListCollectionsSchema,
  SepaDdListBatchesSchema,
  BankStatementImportSchema,
  BankStatementListSchema,
  BankStatementGetSchema,
  BankStatementSuggestMatchesSchema,
  BankMatchTransactionSchema,
  BankUnmatchTransactionSchema,
  BankUnmatchBatchSchema,
  BankCreateFeeEntrySchema,
  BankTxMappingUpsertSchema,
  BankTxMappingDeleteSchema,
  AccrualCreateSchema,
  AccrualListSchema,
  AccrualExecuteSchema,
  AccrualExecuteAllSchema,
  AccrualDeactivateSchema,
  AgingInputSchema,
  CashFlowInputSchema,
  AccountStatementInputSchema,
  CompanySwitchInputSchema,
  CanCorrectSchema,
  CorrectJournalEntrySchema,
  CreateCreditNoteDraftSchema,
  CreateExpenseCreditNoteDraftSchema,
  GlobalSearchSchema,
  ListImportedEntriesSchema,
  PaymentBatchExportPain001Schema,
  PaymentBatchValidateExportSchema,
  SelectDirectorySchema,
  SavePdfBatchSchema,
  Sie4ImportSchema,
  Sie4SelectFileSchema,
  Sie4ValidateSchema,
  Sie5ImportSchema,
  Sie5SelectFileSchema,
  Sie5ValidateSchema,
} from '../src/shared/ipc-schemas'

// ── Helpers ────────────────────────────────────────────────────────

function valid(schema: { parse: (v: unknown) => unknown }, data: unknown) {
  expect(() => schema.parse(data)).not.toThrow()
}

function invalid(schema: { parse: (v: unknown) => unknown }, data: unknown) {
  expect(() => schema.parse(data)).toThrow()
}

// ── Fiscal Period ──────────────────────────────────────────────────

describe('FiscalPeriodListInputSchema', () => {
  it('accepts valid input', () =>
    valid(FiscalPeriodListInputSchema, { fiscal_year_id: 1 }))
  it('rejects missing fiscal_year_id', () =>
    invalid(FiscalPeriodListInputSchema, {}))
  it('rejects non-integer', () =>
    invalid(FiscalPeriodListInputSchema, { fiscal_year_id: 1.5 }))
})

describe('PeriodActionInputSchema', () => {
  it('accepts valid input', () =>
    valid(PeriodActionInputSchema, { period_id: 1 }))
  it('rejects zero', () => invalid(PeriodActionInputSchema, { period_id: 0 }))
})

// ── Company ────────────────────────────────────────────────────────

describe('CreateCompanyInputSchema', () => {
  const validCompany = {
    name: 'Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 2_500_000,
    registration_date: '2020-01-01',
    fiscal_year_start: '2026-01-01',
    fiscal_year_end: '2026-12-31',
  }

  it('accepts valid company', () =>
    valid(CreateCompanyInputSchema, validCompany))
  it('rejects short name', () =>
    invalid(CreateCompanyInputSchema, { ...validCompany, name: 'A' }))
  it('rejects bad org_number format', () =>
    invalid(CreateCompanyInputSchema, { ...validCompany, org_number: '123' }))
  it('rejects low share_capital', () =>
    invalid(CreateCompanyInputSchema, { ...validCompany, share_capital: 100 }))
})

describe('UpdateCompanyInputSchema', () => {
  it('accepts valid update', () =>
    valid(UpdateCompanyInputSchema, { vat_number: 'SE556036079301' }))
  it('rejects extra fields', () =>
    invalid(UpdateCompanyInputSchema, { name: 'new' }))
})

describe('VatNumberSchema', () => {
  it('accepts valid VAT', () =>
    expect(VatNumberSchema.parse('SE123456789012')).toBe('SE123456789012'))
  it('accepts null', () => expect(VatNumberSchema.parse(null)).toBeNull())
  it('rejects bad format', () => invalid(VatNumberSchema, 'abc'))
})

// ── Counterparty ───────────────────────────────────────────────────

describe('Counterparty schemas', () => {
  const validCounterparty = {
    name: 'Acme AB',
    type: 'customer',
    country: 'Sverige',
    default_payment_terms: 30,
    company_id: 1,
  }

  it('CreateCounterpartyInputSchema accepts valid', () =>
    valid(CreateCounterpartyInputSchema, validCounterparty))
  it('CreateCounterpartyInputSchema rejects empty name', () =>
    invalid(CreateCounterpartyInputSchema, { ...validCounterparty, name: '' }))
  it('CreateCounterpartyInputSchema rejects extra fields', () =>
    invalid(CreateCounterpartyInputSchema, {
      ...validCounterparty,
      foo: 'bar',
    }))

  it('UpdateCounterpartyInputSchema requires id', () =>
    invalid(UpdateCounterpartyInputSchema, { name: 'Updated' }))
  it('UpdateCounterpartyInputSchema accepts valid', () =>
    valid(UpdateCounterpartyInputSchema, {
      id: 1,
      company_id: 1,
      name: 'Updated',
    }))

  it('CounterpartyListInputSchema accepts company_id', () =>
    valid(CounterpartyListInputSchema, { company_id: 1 }))
  it('CounterpartyIdSchema rejects zero', () =>
    invalid(CounterpartyIdSchema, { id: 0, company_id: 1 }))
})

// ── Product ────────────────────────────────────────────────────────

describe('Product schemas', () => {
  const validProduct = {
    company_id: 1,
    name: 'Konsulttimme',
    unit: 'timme',
    default_price_ore: 100000,
    vat_code_id: 1,
    account_id: 1,
    article_type: 'service',
  }

  it('CreateProductInputSchema accepts valid', () =>
    valid(CreateProductInputSchema, validProduct))
  it('CreateProductInputSchema rejects negative price', () =>
    invalid(CreateProductInputSchema, {
      ...validProduct,
      default_price_ore: -1,
    }))
  it('CreateProductInputSchema rejects extra fields', () =>
    invalid(CreateProductInputSchema, { ...validProduct, extra: true }))

  it('UpdateProductInputSchema requires id', () =>
    invalid(UpdateProductInputSchema, { name: 'X' }))
  it('ProductListInputSchema accepts company_id', () =>
    valid(ProductListInputSchema, { company_id: 1 }))
  it('ProductIdSchema rejects string id', () =>
    invalid(ProductIdSchema, { id: 'abc', company_id: 1 }))
})

// ── Pricing ────────────────────────────────────────────────────────

describe('Pricing schemas', () => {
  it('SetCustomerPriceInputSchema accepts valid', () =>
    valid(SetCustomerPriceInputSchema, {
      company_id: 1,
      product_id: 1,
      counterparty_id: 2,
      price_ore: 50000,
    }))
  it('RemoveCustomerPriceInputSchema rejects missing field', () =>
    invalid(RemoveCustomerPriceInputSchema, { product_id: 1, company_id: 1 }))
  it('GetPriceForCustomerInputSchema accepts valid', () =>
    valid(GetPriceForCustomerInputSchema, {
      company_id: 1,
      product_id: 1,
      counterparty_id: 2,
    }))
})

// ── Accounts ───────────────────────────────────────────────────────

describe('Account schemas', () => {
  it('AccountListInputSchema accepts valid', () =>
    valid(AccountListInputSchema, { fiscal_rule: 'K2' }))
  it('AccountListInputSchema rejects bad fiscal_rule', () =>
    invalid(AccountListInputSchema, { fiscal_rule: 'K4' }))
  it('AccountListAllInputSchema accepts empty', () =>
    valid(AccountListAllInputSchema, {}))
  it('AccountCreateInputSchema accepts valid', () =>
    valid(AccountCreateInputSchema, {
      account_number: '1930',
      name: 'Bank',
      k2_allowed: true,
      k3_only: false,
    }))
  it('AccountCreateInputSchema rejects bad number', () =>
    invalid(AccountCreateInputSchema, {
      account_number: 'ab',
      name: 'X',
      k2_allowed: true,
      k3_only: false,
    }))
  it('AccountUpdateInputSchema accepts valid', () =>
    valid(AccountUpdateInputSchema, {
      account_number: '1930',
      name: 'Bank upd',
      k2_allowed: true,
      k3_only: false,
    }))
  it('AccountToggleActiveInputSchema accepts valid', () =>
    valid(AccountToggleActiveInputSchema, {
      account_number: '1930',
      is_active: true,
    }))
})

// ── Invoice Draft ──────────────────────────────────────────────────

describe('Invoice schemas', () => {
  const validLine = {
    product_id: null,
    description: 'Test',
    quantity: 1,
    unit_price_ore: 100000,
    vat_code_id: 1,
    sort_order: 0,
  }

  const validDraft = {
    counterparty_id: 1,
    fiscal_year_id: 1,
    invoice_date: '2026-01-15',
    due_date: '2026-02-14',
    payment_terms: 30,
    currency: 'SEK',
    lines: [validLine],
  }

  it('InvoiceDraftLineSchema accepts valid', () =>
    valid(InvoiceDraftLineSchema, validLine))
  it('InvoiceDraftLineSchema rejects zero quantity', () =>
    invalid(InvoiceDraftLineSchema, { ...validLine, quantity: 0 }))

  it('SaveDraftInputSchema accepts valid', () =>
    valid(SaveDraftInputSchema, validDraft))
  it('SaveDraftInputSchema rejects empty lines', () =>
    invalid(SaveDraftInputSchema, { ...validDraft, lines: [] }))

  it('UpdateDraftInputSchema requires id', () =>
    invalid(UpdateDraftInputSchema, validDraft))

  it('InvoiceIdSchema accepts valid', () => valid(InvoiceIdSchema, { id: 1 }))
  it('DraftListInputSchema accepts valid', () =>
    valid(DraftListInputSchema, { fiscal_year_id: 1 }))
  it('NextNumberInputSchema accepts valid', () =>
    valid(NextNumberInputSchema, { fiscal_year_id: 1 }))
  it('FinalizeInvoiceInputSchema accepts valid', () =>
    valid(FinalizeInvoiceInputSchema, { id: 1 }))
})

// ── Sent Invoice ───────────────────────────────────────────────────

describe('UpdateSentInvoiceInputSchema', () => {
  it('accepts valid update', () =>
    valid(UpdateSentInvoiceInputSchema, { id: 1, notes: 'Updated' }))
  it('rejects missing id', () =>
    invalid(UpdateSentInvoiceInputSchema, { notes: 'No id' }))
})

// ── Invoice List & Payment ─────────────────────────────────────────

describe('InvoiceListInputSchema', () => {
  it('accepts valid', () =>
    valid(InvoiceListInputSchema, { fiscal_year_id: 1 }))
  it('rejects bad sort_by', () =>
    invalid(InvoiceListInputSchema, { fiscal_year_id: 1, sort_by: 'invalid' }))
})

describe('PayInvoiceInputSchema', () => {
  it('accepts valid payment', () =>
    valid(PayInvoiceInputSchema, {
      invoice_id: 1,
      amount_ore: 100000,
      payment_date: '2026-02-01',
      payment_method: 'bankgiro',
      account_number: '1930',
    }))
  it('rejects negative amount', () =>
    invalid(PayInvoiceInputSchema, {
      invoice_id: 1,
      amount_ore: -1,
      payment_date: '2026-02-01',
      payment_method: 'bankgiro',
      account_number: '1930',
    }))
})

describe('GetPaymentsInputSchema', () => {
  it('accepts valid', () => valid(GetPaymentsInputSchema, { invoice_id: 1 }))
})

// ── Expense ────────────────────────────────────────────────────────

describe('Expense schemas', () => {
  const validExpenseLine = {
    description: 'Kontorsmaterial',
    account_number: '6110',
    quantity: 1,
    unit_price_ore: 50000,
    vat_code_id: 1,
  }

  const validExpense = {
    fiscal_year_id: 1,
    counterparty_id: 1,
    expense_date: '2026-01-15',
    description: 'Test expense',
    lines: [validExpenseLine],
  }

  it('SaveExpenseDraftSchema accepts valid', () =>
    valid(SaveExpenseDraftSchema, validExpense))
  it('SaveExpenseDraftSchema rejects empty lines', () =>
    invalid(SaveExpenseDraftSchema, { ...validExpense, lines: [] }))
  it('SaveExpenseDraftSchema rejects missing description', () =>
    invalid(SaveExpenseDraftSchema, { ...validExpense, description: '' }))

  it('UpdateExpenseDraftSchema requires id', () =>
    invalid(UpdateExpenseDraftSchema, {
      ...validExpense,
      fiscal_year_id: undefined,
    }))

  it('ExpenseIdSchema accepts valid', () => valid(ExpenseIdSchema, { id: 1 }))
  it('ListExpenseDraftsSchema accepts valid', () =>
    valid(ListExpenseDraftsSchema, { fiscal_year_id: 1 }))
  it('FinalizeExpenseSchema accepts valid', () =>
    valid(FinalizeExpenseSchema, { id: 1 }))
})

describe('PayExpenseInputSchema', () => {
  it('accepts valid', () =>
    valid(PayExpenseInputSchema, {
      expense_id: 1,
      amount_ore: 50000,
      payment_date: '2026-02-01',
      payment_method: 'swish',
      account_number: '1930',
    }))
  it('rejects invalid method', () =>
    invalid(PayExpenseInputSchema, {
      expense_id: 1,
      amount_ore: 50000,
      payment_date: '2026-02-01',
      payment_method: 'bitcoin',
      account_number: '1930',
    }))
})

describe('GetExpensePaymentsSchema', () => {
  it('accepts valid', () => valid(GetExpensePaymentsSchema, { expense_id: 1 }))
})

describe('GetExpenseSchema', () => {
  it('accepts valid', () => valid(GetExpenseSchema, { id: 1 }))
})

// ── Dashboard / Tax / VAT ──────────────────────────────────────────

describe('DashboardSummaryInputSchema', () => {
  it('accepts valid', () =>
    valid(DashboardSummaryInputSchema, { fiscalYearId: 1 }))
  it('rejects missing field', () => invalid(DashboardSummaryInputSchema, {}))
})

describe('TaxForecastInputSchema', () => {
  it('accepts valid', () => valid(TaxForecastInputSchema, { fiscalYearId: 1 }))
})

describe('VatReportInputSchema', () => {
  it('accepts valid', () => valid(VatReportInputSchema, { fiscal_year_id: 1 }))
})

// ── Export ──────────────────────────────────────────────────────────

describe('Export schemas', () => {
  it('ExportSie5Schema accepts valid', () =>
    valid(ExportSie5Schema, { fiscal_year_id: 1 }))
  it('ExportExcelSchema accepts valid', () =>
    valid(ExportExcelSchema, { fiscal_year_id: 1 }))
  it('ExportExcelSchema accepts with date range', () =>
    valid(ExportExcelSchema, {
      fiscal_year_id: 1,
      start_date: '2026-01-01',
      end_date: '2026-12-31',
    }))
  it('ExportSie4Schema accepts valid', () =>
    valid(ExportSie4Schema, { fiscal_year_id: 1 }))
})

// ── Manual Entry ───────────────────────────────────────────────────

describe('Manual Entry schemas', () => {
  const validManualEntry = {
    fiscal_year_id: 1,
    lines: [{ account_number: '1930', debit_ore: 10000, credit_ore: 0 }],
  }

  it('SaveManualEntryDraftSchema accepts valid', () =>
    valid(SaveManualEntryDraftSchema, validManualEntry))
  it('SaveManualEntryDraftSchema rejects empty lines', () =>
    invalid(SaveManualEntryDraftSchema, { ...validManualEntry, lines: [] }))

  it('UpdateManualEntryDraftSchema requires id', () =>
    invalid(UpdateManualEntryDraftSchema, validManualEntry))
  it('UpdateManualEntryDraftSchema accepts valid', () =>
    valid(UpdateManualEntryDraftSchema, {
      id: 1,
      lines: validManualEntry.lines,
    }))

  it('ManualEntryIdSchema accepts valid', () =>
    valid(ManualEntryIdSchema, { id: 1 }))
  it('ManualEntryFinalizeSchema accepts valid', () =>
    valid(ManualEntryFinalizeSchema, { id: 1, fiscal_year_id: 1 }))
  it('ManualEntryListSchema accepts valid', () =>
    valid(ManualEntryListSchema, { fiscal_year_id: 1 }))
})

// ── Reports ────────────────────────────────────────────────────────

describe('ReportRequestSchema', () => {
  it('accepts valid', () => valid(ReportRequestSchema, { fiscal_year_id: 1 }))
  it('accepts with date range', () =>
    valid(ReportRequestSchema, {
      fiscal_year_id: 1,
      date_range: { from: '2026-01-01', to: '2026-12-31' },
    }))
  it('rejects extra fields', () =>
    invalid(ReportRequestSchema, { fiscal_year_id: 1, extra: true }))
})

describe('ExportWriteFileRequestSchema', () => {
  it('accepts valid', () =>
    valid(ExportWriteFileRequestSchema, { format: 'sie5', fiscal_year_id: 1 }))
  it('rejects invalid format', () =>
    invalid(ExportWriteFileRequestSchema, { format: 'pdf', fiscal_year_id: 1 }))
})

// ── Expense List ───────────────────────────────────────────────────

describe('ListExpensesSchema', () => {
  it('accepts valid', () => valid(ListExpensesSchema, { fiscal_year_id: 1 }))
  it('accepts with status filter', () =>
    valid(ListExpensesSchema, { fiscal_year_id: 1, status: 'unpaid' }))
  it('rejects invalid status', () =>
    invalid(ListExpensesSchema, { fiscal_year_id: 1, status: 'invalid' }))
})

// ── Invoice PDF ────────────────────────────────────────────────────

describe('Invoice PDF schemas', () => {
  it('GenerateInvoicePdfSchema accepts valid', () =>
    valid(GenerateInvoicePdfSchema, { invoiceId: 1 }))
  it('SaveInvoicePdfSchema accepts valid', () =>
    valid(SaveInvoicePdfSchema, {
      data: 'base64data',
      defaultFileName: 'invoice.pdf',
    }))
  it('SaveInvoicePdfSchema rejects empty data', () =>
    invalid(SaveInvoicePdfSchema, { data: '', defaultFileName: 'invoice.pdf' }))
})

// ── Fiscal Year ────────────────────────────────────────────────────

describe('Fiscal Year schemas', () => {
  it('FiscalYearCreateNewInputSchema accepts valid', () =>
    valid(FiscalYearCreateNewInputSchema, { confirmBookResult: true }))
  it('FiscalYearCreateNewInputSchema accepts with netResultOre', () =>
    valid(FiscalYearCreateNewInputSchema, {
      confirmBookResult: true,
      netResultOre: 100000,
    }))
  it('FiscalYearSwitchInputSchema accepts valid', () =>
    valid(FiscalYearSwitchInputSchema, { fiscalYearId: 2 }))
  it('NetResultInputSchema accepts valid', () =>
    valid(NetResultInputSchema, { fiscalYearId: 1 }))
})

// ── VatCodeList ────────────────────────────────────────────────────

describe('VatCodeListInputSchema', () => {
  it('accepts empty', () => valid(VatCodeListInputSchema, {}))
  it('accepts with direction', () =>
    valid(VatCodeListInputSchema, { direction: 'outgoing' }))
  it('rejects invalid direction', () =>
    invalid(VatCodeListInputSchema, { direction: 'both' }))
})

// ── Q3: Bulk Payments ─────────────────────────────────────────────

describe('PayInvoicesBulkPayloadSchema', () => {
  const valid_bulk = {
    payments: [{ invoice_id: 1, amount_ore: 10000 }],
    payment_date: '2026-03-15',
    account_number: '1930',
  }
  it('accepts valid', () => valid(PayInvoicesBulkPayloadSchema, valid_bulk))
  it('rejects empty payments', () =>
    invalid(PayInvoicesBulkPayloadSchema, { ...valid_bulk, payments: [] }))
  it('rejects missing payment_date', () =>
    invalid(PayInvoicesBulkPayloadSchema, {
      ...valid_bulk,
      payment_date: undefined,
    }))
})

describe('PayExpensesBulkPayloadSchema', () => {
  const valid_bulk = {
    payments: [{ expense_id: 1, amount_ore: 10000 }],
    payment_date: '2026-03-15',
    account_number: '1930',
  }
  it('accepts valid', () => valid(PayExpensesBulkPayloadSchema, valid_bulk))
  it('rejects empty payments', () =>
    invalid(PayExpensesBulkPayloadSchema, { ...valid_bulk, payments: [] }))
})

describe('BulkPaymentResultSchema', () => {
  it('accepts completed result', () =>
    valid(BulkPaymentResultSchema, {
      batch_id: 1,
      status: 'completed',
      succeeded: [{ id: 1, payment_id: 2, journal_entry_id: 3 }],
      failed: [],
      bank_fee_journal_entry_id: null,
    }))
  it('rejects invalid status', () =>
    invalid(BulkPaymentResultSchema, {
      batch_id: 1,
      status: 'unknown',
      succeeded: [],
      failed: [],
      bank_fee_journal_entry_id: null,
    }))
})

// ── Q3: Budget ────────────────────────────────────────────────────

describe('Budget schemas', () => {
  it('BudgetLinesSchema accepts empty object', () =>
    valid(BudgetLinesSchema, {}))
  it('BudgetGetSchema accepts valid', () =>
    valid(BudgetGetSchema, { fiscal_year_id: 1 }))
  it('BudgetGetSchema rejects missing fiscal_year_id', () =>
    invalid(BudgetGetSchema, {}))
  it('BudgetSaveSchema accepts valid', () =>
    valid(BudgetSaveSchema, {
      fiscal_year_id: 1,
      targets: [{ line_id: 'line1', period_number: 1, amount_ore: 50000 }],
    }))
  it('BudgetSaveSchema rejects empty targets', () =>
    invalid(BudgetSaveSchema, { fiscal_year_id: 1, targets: [] }))
  it('BudgetVarianceSchema accepts valid', () =>
    valid(BudgetVarianceSchema, { fiscal_year_id: 1 }))
  it('BudgetCopySchema accepts valid', () =>
    valid(BudgetCopySchema, {
      target_fiscal_year_id: 2,
      source_fiscal_year_id: 1,
    }))
  it('BudgetSummaryByYearSchema accepts valid', () =>
    valid(BudgetSummaryByYearSchema, { fiscal_year_id: 1 }))
})

// ── Q3: Depreciation ─────────────────────────────────────────────

describe('Depreciation schemas', () => {
  const validAsset = {
    name: 'Dator',
    acquisition_date: '2026-01-01',
    acquisition_cost_ore: 1000000,
    useful_life_months: 36,
    method: 'linear',
    account_asset: '1210',
    account_accumulated_depreciation: '1219',
    account_depreciation_expense: '7832',
  }
  it('DepreciationCreateAssetSchema accepts valid linear', () =>
    valid(DepreciationCreateAssetSchema, validAsset))
  it('DepreciationCreateAssetSchema rejects empty name', () =>
    invalid(DepreciationCreateAssetSchema, { ...validAsset, name: '' }))
  it('DepreciationUpdateAssetSchema accepts valid', () =>
    valid(DepreciationUpdateAssetSchema, { id: 1, input: validAsset }))
  it('DepreciationIdSchema accepts valid', () =>
    valid(DepreciationIdSchema, { id: 1 }))
  it('DepreciationIdSchema rejects zero', () =>
    invalid(DepreciationIdSchema, { id: 0 }))
  it('DepreciationListSchema accepts empty', () =>
    valid(DepreciationListSchema, {}))
  it('DepreciationListSchema accepts with fiscal_year_id', () =>
    valid(DepreciationListSchema, { fiscal_year_id: 1 }))
  it('DepreciationDisposeSchema accepts valid', () =>
    valid(DepreciationDisposeSchema, {
      id: 1,
      disposed_date: '2026-06-30',
    }))
  it('DepreciationDisposeSchema rejects bad date format', () =>
    invalid(DepreciationDisposeSchema, { id: 1, disposed_date: '2026-6-30' }))
  it('DepreciationExecutePeriodSchema accepts valid', () =>
    valid(DepreciationExecutePeriodSchema, {
      fiscal_year_id: 1,
      period_end_date: '2026-01-31',
    }))
})

// ── Q3: SEPA DD ──────────────────────────────────────────────────

describe('SepaDd schemas', () => {
  it('SepaDdCreateMandateSchema accepts valid', () =>
    valid(SepaDdCreateMandateSchema, {
      counterparty_id: 1,
      mandate_reference: 'MAND001',
      signature_date: '2026-01-01',
      sequence_type: 'FRST',
      iban: 'SE4550000000058398257466',
    }))
  it('SepaDdCreateMandateSchema rejects invalid sequence_type', () =>
    invalid(SepaDdCreateMandateSchema, {
      counterparty_id: 1,
      mandate_reference: 'MAND001',
      signature_date: '2026-01-01',
      sequence_type: 'INVALID',
      iban: 'SE4550000000058398257466',
    }))
  it('SepaDdListMandatesSchema accepts valid', () =>
    valid(SepaDdListMandatesSchema, { counterparty_id: 1 }))
  it('SepaDdRevokeMandateSchema accepts valid', () =>
    valid(SepaDdRevokeMandateSchema, { mandate_id: 1 }))
  it('SepaDdCreateCollectionSchema accepts valid', () =>
    valid(SepaDdCreateCollectionSchema, {
      fiscal_year_id: 1,
      mandate_id: 1,
      amount_ore: 50000,
      collection_date: '2026-02-01',
    }))
  it('SepaDdCreateBatchSchema accepts valid', () =>
    valid(SepaDdCreateBatchSchema, {
      fiscal_year_id: 1,
      collection_ids: [1, 2],
      payment_date: '2026-02-05',
      account_number: '1930',
    }))
  it('SepaDdCreateBatchSchema rejects empty collection_ids', () =>
    invalid(SepaDdCreateBatchSchema, {
      fiscal_year_id: 1,
      collection_ids: [],
      payment_date: '2026-02-05',
      account_number: '1930',
    }))
  it('SepaDdExportPain008Schema accepts valid', () =>
    valid(SepaDdExportPain008Schema, { batch_id: 1 }))
  it('SepaDdListCollectionsSchema accepts valid', () =>
    valid(SepaDdListCollectionsSchema, { fiscal_year_id: 1 }))
  it('SepaDdListBatchesSchema accepts valid', () =>
    valid(SepaDdListBatchesSchema, { fiscal_year_id: 1 }))
})

// ── Q3: Bank Statement ────────────────────────────────────────────

describe('Bank Statement schemas', () => {
  it('BankStatementImportSchema accepts valid', () =>
    valid(BankStatementImportSchema, {
      company_id: 1,
      fiscal_year_id: 1,
      xml_content: '<Document>...</Document>',
    }))
  it('BankStatementImportSchema rejects empty xml_content', () =>
    invalid(BankStatementImportSchema, {
      company_id: 1,
      fiscal_year_id: 1,
      xml_content: '',
    }))
  it('BankStatementListSchema accepts valid', () =>
    valid(BankStatementListSchema, { fiscal_year_id: 1 }))
  it('BankStatementGetSchema accepts valid', () =>
    valid(BankStatementGetSchema, { statement_id: 1 }))
  it('BankStatementSuggestMatchesSchema accepts valid', () =>
    valid(BankStatementSuggestMatchesSchema, { statement_id: 1 }))
  it('BankMatchTransactionSchema accepts valid', () =>
    valid(BankMatchTransactionSchema, {
      bank_transaction_id: 1,
      matched_entity_type: 'invoice',
      matched_entity_id: 1,
      payment_account: '1930',
    }))
  it('BankMatchTransactionSchema rejects invalid entity type', () =>
    invalid(BankMatchTransactionSchema, {
      bank_transaction_id: 1,
      matched_entity_type: 'manual',
      matched_entity_id: 1,
      payment_account: '1930',
    }))
  it('BankUnmatchTransactionSchema accepts valid', () =>
    valid(BankUnmatchTransactionSchema, { bank_transaction_id: 1 }))
  it('BankUnmatchBatchSchema accepts valid', () =>
    valid(BankUnmatchBatchSchema, { batch_id: 1 }))
  it('BankCreateFeeEntrySchema accepts valid', () =>
    valid(BankCreateFeeEntrySchema, {
      bank_transaction_id: 1,
      payment_account: '1930',
    }))
  it('BankTxMappingUpsertSchema accepts valid', () =>
    valid(BankTxMappingUpsertSchema, {
      domain: 'PMNT',
      family: 'RCDT',
      subfamily: 'AUTT',
      classification: 'bank_fee',
    }))
  it('BankTxMappingUpsertSchema rejects invalid classification', () =>
    invalid(BankTxMappingUpsertSchema, {
      domain: 'PMNT',
      family: 'RCDT',
      subfamily: 'AUTT',
      classification: 'unknown',
    }))
  it('BankTxMappingDeleteSchema accepts valid', () =>
    valid(BankTxMappingDeleteSchema, { id: 1 }))
})

// ── Q3: Accruals ──────────────────────────────────────────────────

describe('Accrual schemas', () => {
  const validAccrual = {
    fiscal_year_id: 1,
    description: 'Förutbetald hyra',
    accrual_type: 'prepaid_expense',
    balance_account: '1710',
    result_account: '5010',
    total_amount_ore: 120000,
    period_count: 3,
    start_period: 1,
  }
  it('AccrualCreateSchema accepts valid', () =>
    valid(AccrualCreateSchema, validAccrual))
  it('AccrualCreateSchema rejects period_count < 2', () =>
    invalid(AccrualCreateSchema, { ...validAccrual, period_count: 1 }))
  it('AccrualCreateSchema rejects start_period + period_count > 13', () =>
    invalid(AccrualCreateSchema, {
      ...validAccrual,
      start_period: 11,
      period_count: 4,
    }))
  it('AccrualListSchema accepts valid', () =>
    valid(AccrualListSchema, { fiscal_year_id: 1 }))
  it('AccrualExecuteSchema accepts valid', () =>
    valid(AccrualExecuteSchema, { schedule_id: 1, period_number: 3 }))
  it('AccrualExecuteAllSchema accepts valid', () =>
    valid(AccrualExecuteAllSchema, { fiscal_year_id: 1, period_number: 3 }))
  it('AccrualDeactivateSchema accepts valid', () =>
    valid(AccrualDeactivateSchema, { schedule_id: 1 }))
})

// ── Q3: Misc ──────────────────────────────────────────────────────

describe('AgingInputSchema', () => {
  it('accepts valid with date', () =>
    valid(AgingInputSchema, {
      fiscal_year_id: 1,
      as_of_date: '2026-03-31',
    }))
  it('accepts without as_of_date', () =>
    valid(AgingInputSchema, { fiscal_year_id: 1 }))
  it('rejects bad date format', () =>
    invalid(AgingInputSchema, {
      fiscal_year_id: 1,
      as_of_date: '2026-3-31',
    }))
})

describe('CashFlowInputSchema', () => {
  it('accepts valid', () => valid(CashFlowInputSchema, { fiscal_year_id: 1 }))
  it('rejects missing fiscal_year_id', () =>
    invalid(CashFlowInputSchema, {}))
})

describe('AccountStatementInputSchema', () => {
  it('accepts valid', () =>
    valid(AccountStatementInputSchema, {
      fiscal_year_id: 1,
      account_number: '1930',
    }))
  it('rejects account_number too short', () =>
    invalid(AccountStatementInputSchema, {
      fiscal_year_id: 1,
      account_number: '193',
    }))
})

describe('CompanySwitchInputSchema', () => {
  it('accepts valid', () =>
    valid(CompanySwitchInputSchema, { company_id: 1 }))
  it('rejects zero', () =>
    invalid(CompanySwitchInputSchema, { company_id: 0 }))
})

describe('Journal Entry Correction schemas', () => {
  it('CanCorrectSchema accepts valid', () =>
    valid(CanCorrectSchema, { journal_entry_id: 1 }))
  it('CorrectJournalEntrySchema accepts valid', () =>
    valid(CorrectJournalEntrySchema, {
      journal_entry_id: 1,
      fiscal_year_id: 1,
    }))
  it('CorrectJournalEntrySchema rejects missing fiscal_year_id', () =>
    invalid(CorrectJournalEntrySchema, { journal_entry_id: 1 }))
})

describe('Credit Note schemas', () => {
  it('CreateCreditNoteDraftSchema accepts valid', () =>
    valid(CreateCreditNoteDraftSchema, {
      original_invoice_id: 1,
      fiscal_year_id: 1,
    }))
  it('CreateExpenseCreditNoteDraftSchema accepts valid', () =>
    valid(CreateExpenseCreditNoteDraftSchema, {
      original_expense_id: 1,
      fiscal_year_id: 1,
    }))
})

describe('GlobalSearchSchema', () => {
  it('accepts valid', () =>
    valid(GlobalSearchSchema, { query: 'acme', fiscal_year_id: 1 }))
  it('rejects query too short', () =>
    invalid(GlobalSearchSchema, { query: 'a', fiscal_year_id: 1 }))
  it('accepts with limit', () =>
    valid(GlobalSearchSchema, {
      query: 'acme',
      fiscal_year_id: 1,
      limit: 10,
    }))
})

describe('ListImportedEntriesSchema', () => {
  it('accepts valid', () =>
    valid(ListImportedEntriesSchema, { fiscal_year_id: 1 }))
})

describe('Payment Batch Export schemas', () => {
  it('PaymentBatchValidateExportSchema accepts valid', () =>
    valid(PaymentBatchValidateExportSchema, { batch_id: 1 }))
  it('PaymentBatchExportPain001Schema accepts valid', () =>
    valid(PaymentBatchExportPain001Schema, { batch_id: 1 }))
})

describe('Invoice PDF batch + directory schemas', () => {
  it('SelectDirectorySchema accepts empty', () =>
    valid(SelectDirectorySchema, {}))
  it('SavePdfBatchSchema accepts valid', () =>
    valid(SavePdfBatchSchema, {
      directory: '/tmp/pdfs',
      invoices: [{ invoiceId: 1, fileName: 'invoice-001.pdf' }],
    }))
  it('SavePdfBatchSchema rejects empty invoices', () =>
    invalid(SavePdfBatchSchema, { directory: '/tmp', invoices: [] }))
})

describe('SIE4 Import schemas', () => {
  it('Sie4SelectFileSchema accepts empty', () =>
    valid(Sie4SelectFileSchema, {}))
  it('Sie4ValidateSchema accepts valid', () =>
    valid(Sie4ValidateSchema, { filePath: '/tmp/file.se' }))
  it('Sie4ValidateSchema rejects empty filePath', () =>
    invalid(Sie4ValidateSchema, { filePath: '' }))
  it('Sie4ImportSchema accepts new strategy', () =>
    valid(Sie4ImportSchema, { filePath: '/tmp/file.se', strategy: 'new' }))
  it('Sie4ImportSchema accepts merge strategy', () =>
    valid(Sie4ImportSchema, {
      filePath: '/tmp/file.se',
      strategy: 'merge',
      fiscal_year_id: 1,
    }))
  it('Sie4ImportSchema rejects invalid strategy', () =>
    invalid(Sie4ImportSchema, {
      filePath: '/tmp/file.se',
      strategy: 'replace',
    }))
})

describe('SIE5 Import schemas', () => {
  it('Sie5SelectFileSchema accepts empty', () =>
    valid(Sie5SelectFileSchema, {}))
  it('Sie5ValidateSchema accepts valid', () =>
    valid(Sie5ValidateSchema, { filePath: '/tmp/file.xml' }))
  it('Sie5ImportSchema accepts new strategy', () =>
    valid(Sie5ImportSchema, { filePath: '/tmp/file.xml', strategy: 'new' }))
  it('Sie5ImportSchema rejects invalid strategy', () =>
    invalid(Sie5ImportSchema, {
      filePath: '/tmp/file.xml',
      strategy: 'append',
    }))
})
