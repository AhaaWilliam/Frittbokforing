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
  it('accepts valid input', () => valid(FiscalPeriodListInputSchema, { fiscal_year_id: 1 }))
  it('rejects missing fiscal_year_id', () => invalid(FiscalPeriodListInputSchema, {}))
  it('rejects non-integer', () => invalid(FiscalPeriodListInputSchema, { fiscal_year_id: 1.5 }))
})

describe('PeriodActionInputSchema', () => {
  it('accepts valid input', () => valid(PeriodActionInputSchema, { period_id: 1 }))
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

  it('accepts valid company', () => valid(CreateCompanyInputSchema, validCompany))
  it('rejects short name', () => invalid(CreateCompanyInputSchema, { ...validCompany, name: 'A' }))
  it('rejects bad org_number format', () => invalid(CreateCompanyInputSchema, { ...validCompany, org_number: '123' }))
  it('rejects low share_capital', () => invalid(CreateCompanyInputSchema, { ...validCompany, share_capital: 100 }))
})

describe('UpdateCompanyInputSchema', () => {
  it('accepts valid update', () => valid(UpdateCompanyInputSchema, { vat_number: 'SE556036079301' }))
  it('rejects extra fields', () => invalid(UpdateCompanyInputSchema, { name: 'new' }))
})

describe('VatNumberSchema', () => {
  it('accepts valid VAT', () => expect(VatNumberSchema.parse('SE123456789012')).toBe('SE123456789012'))
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
  }

  it('CreateCounterpartyInputSchema accepts valid', () => valid(CreateCounterpartyInputSchema, validCounterparty))
  it('CreateCounterpartyInputSchema rejects empty name', () => invalid(CreateCounterpartyInputSchema, { ...validCounterparty, name: '' }))
  it('CreateCounterpartyInputSchema rejects extra fields', () => invalid(CreateCounterpartyInputSchema, { ...validCounterparty, foo: 'bar' }))

  it('UpdateCounterpartyInputSchema requires id', () => invalid(UpdateCounterpartyInputSchema, { name: 'Updated' }))
  it('UpdateCounterpartyInputSchema accepts valid', () => valid(UpdateCounterpartyInputSchema, { id: 1, name: 'Updated' }))

  it('CounterpartyListInputSchema accepts empty', () => valid(CounterpartyListInputSchema, {}))
  it('CounterpartyIdSchema rejects zero', () => invalid(CounterpartyIdSchema, { id: 0 }))
})

// ── Product ────────────────────────────────────────────────────────

describe('Product schemas', () => {
  const validProduct = {
    name: 'Konsulttimme',
    unit: 'timme',
    default_price: 100000,
    vat_code_id: 1,
    account_id: 1,
    article_type: 'service',
  }

  it('CreateProductInputSchema accepts valid', () => valid(CreateProductInputSchema, validProduct))
  it('CreateProductInputSchema rejects negative price', () => invalid(CreateProductInputSchema, { ...validProduct, default_price: -1 }))
  it('CreateProductInputSchema rejects extra fields', () => invalid(CreateProductInputSchema, { ...validProduct, extra: true }))

  it('UpdateProductInputSchema requires id', () => invalid(UpdateProductInputSchema, { name: 'X' }))
  it('ProductListInputSchema accepts empty', () => valid(ProductListInputSchema, {}))
  it('ProductIdSchema rejects string id', () => invalid(ProductIdSchema, { id: 'abc' }))
})

// ── Pricing ────────────────────────────────────────────────────────

describe('Pricing schemas', () => {
  it('SetCustomerPriceInputSchema accepts valid', () =>
    valid(SetCustomerPriceInputSchema, { product_id: 1, counterparty_id: 2, price: 50000 }))
  it('RemoveCustomerPriceInputSchema rejects missing field', () =>
    invalid(RemoveCustomerPriceInputSchema, { product_id: 1 }))
  it('GetPriceForCustomerInputSchema accepts valid', () =>
    valid(GetPriceForCustomerInputSchema, { product_id: 1, counterparty_id: 2 }))
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
    valid(AccountCreateInputSchema, { account_number: '1930', name: 'Bank', k2_allowed: true, k3_only: false }))
  it('AccountCreateInputSchema rejects bad number', () =>
    invalid(AccountCreateInputSchema, { account_number: 'ab', name: 'X', k2_allowed: true, k3_only: false }))
  it('AccountUpdateInputSchema accepts valid', () =>
    valid(AccountUpdateInputSchema, { account_number: '1930', name: 'Bank upd', k2_allowed: true, k3_only: false }))
  it('AccountToggleActiveInputSchema accepts valid', () =>
    valid(AccountToggleActiveInputSchema, { account_number: '1930', is_active: true }))
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

  it('InvoiceDraftLineSchema accepts valid', () => valid(InvoiceDraftLineSchema, validLine))
  it('InvoiceDraftLineSchema rejects zero quantity', () =>
    invalid(InvoiceDraftLineSchema, { ...validLine, quantity: 0 }))

  it('SaveDraftInputSchema accepts valid', () => valid(SaveDraftInputSchema, validDraft))
  it('SaveDraftInputSchema rejects empty lines', () =>
    invalid(SaveDraftInputSchema, { ...validDraft, lines: [] }))

  it('UpdateDraftInputSchema requires id', () =>
    invalid(UpdateDraftInputSchema, validDraft))

  it('InvoiceIdSchema accepts valid', () => valid(InvoiceIdSchema, { id: 1 }))
  it('DraftListInputSchema accepts valid', () => valid(DraftListInputSchema, { fiscal_year_id: 1 }))
  it('NextNumberInputSchema accepts valid', () => valid(NextNumberInputSchema, { fiscal_year_id: 1 }))
  it('FinalizeInvoiceInputSchema accepts valid', () => valid(FinalizeInvoiceInputSchema, { id: 1 }))
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
      amount: 100000,
      payment_date: '2026-02-01',
      payment_method: 'bankgiro',
      account_number: '1930',
    }))
  it('rejects negative amount', () =>
    invalid(PayInvoiceInputSchema, {
      invoice_id: 1,
      amount: -1,
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

  it('SaveExpenseDraftSchema accepts valid', () => valid(SaveExpenseDraftSchema, validExpense))
  it('SaveExpenseDraftSchema rejects empty lines', () =>
    invalid(SaveExpenseDraftSchema, { ...validExpense, lines: [] }))
  it('SaveExpenseDraftSchema rejects missing description', () =>
    invalid(SaveExpenseDraftSchema, { ...validExpense, description: '' }))

  it('UpdateExpenseDraftSchema requires id', () =>
    invalid(UpdateExpenseDraftSchema, { ...validExpense, fiscal_year_id: undefined }))

  it('ExpenseIdSchema accepts valid', () => valid(ExpenseIdSchema, { id: 1 }))
  it('ListExpenseDraftsSchema accepts valid', () => valid(ListExpenseDraftsSchema, { fiscal_year_id: 1 }))
  it('FinalizeExpenseSchema accepts valid', () => valid(FinalizeExpenseSchema, { id: 1 }))
})

describe('PayExpenseInputSchema', () => {
  it('accepts valid', () =>
    valid(PayExpenseInputSchema, {
      expense_id: 1,
      amount: 50000,
      payment_date: '2026-02-01',
      payment_method: 'swish',
      account_number: '1930',
    }))
  it('rejects invalid method', () =>
    invalid(PayExpenseInputSchema, {
      expense_id: 1,
      amount: 50000,
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
  it('accepts valid', () => valid(DashboardSummaryInputSchema, { fiscalYearId: 1 }))
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
  it('ExportSie5Schema accepts valid', () => valid(ExportSie5Schema, { fiscal_year_id: 1 }))
  it('ExportExcelSchema accepts valid', () => valid(ExportExcelSchema, { fiscal_year_id: 1 }))
  it('ExportExcelSchema accepts with date range', () =>
    valid(ExportExcelSchema, { fiscal_year_id: 1, start_date: '2026-01-01', end_date: '2026-12-31' }))
  it('ExportSie4Schema accepts valid', () => valid(ExportSie4Schema, { fiscal_year_id: 1 }))
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
    valid(UpdateManualEntryDraftSchema, { id: 1, lines: validManualEntry.lines }))

  it('ManualEntryIdSchema accepts valid', () => valid(ManualEntryIdSchema, { id: 1 }))
  it('ManualEntryFinalizeSchema accepts valid', () =>
    valid(ManualEntryFinalizeSchema, { id: 1, fiscal_year_id: 1 }))
  it('ManualEntryListSchema accepts valid', () =>
    valid(ManualEntryListSchema, { fiscal_year_id: 1 }))
})

// ── Reports ────────────────────────────────────────────────────────

describe('ReportRequestSchema', () => {
  it('accepts valid', () => valid(ReportRequestSchema, { fiscal_year_id: 1 }))
  it('accepts with date range', () =>
    valid(ReportRequestSchema, { fiscal_year_id: 1, date_range: { from: '2026-01-01', to: '2026-12-31' } }))
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
    valid(SaveInvoicePdfSchema, { data: 'base64data', defaultFileName: 'invoice.pdf' }))
  it('SaveInvoicePdfSchema rejects empty data', () =>
    invalid(SaveInvoicePdfSchema, { data: '', defaultFileName: 'invoice.pdf' }))
})

// ── Fiscal Year ────────────────────────────────────────────────────

describe('Fiscal Year schemas', () => {
  it('FiscalYearCreateNewInputSchema accepts valid', () =>
    valid(FiscalYearCreateNewInputSchema, { confirmBookResult: true }))
  it('FiscalYearCreateNewInputSchema accepts with netResultOre', () =>
    valid(FiscalYearCreateNewInputSchema, { confirmBookResult: true, netResultOre: 100000 }))
  it('FiscalYearSwitchInputSchema accepts valid', () =>
    valid(FiscalYearSwitchInputSchema, { fiscalYearId: 2 }))
  it('NetResultInputSchema accepts valid', () =>
    valid(NetResultInputSchema, { fiscalYearId: 1 }))
})

// ── VatCodeList ────────────────────────────────────────────────────

describe('VatCodeListInputSchema', () => {
  it('accepts empty', () => valid(VatCodeListInputSchema, {}))
  it('accepts with direction', () => valid(VatCodeListInputSchema, { direction: 'outgoing' }))
  it('rejects invalid direction', () => invalid(VatCodeListInputSchema, { direction: 'both' }))
})
