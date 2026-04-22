import { z } from 'zod'
import {
  MAX_QTY_INVOICE,
  MAX_QTY_EXPENSE,
  ERR_MSG_MAX_QTY_INVOICE,
  ERR_MSG_MAX_QTY_EXPENSE,
  BFL_ALLOWED_START_MONTHS,
  ERR_MSG_INVALID_FY_START_MONTH,
} from './constants'

/**
 * Luhn-kontroll (modulus 10) för svenska organisationsnummer.
 * Input: NNNNNN-NNNN format (t.ex. "556036-0793").
 * Returnerar true om sista siffran är korrekt kontrollsiffra.
 */
export function luhnCheck(orgNumber: string): boolean {
  const digits = orgNumber.replace('-', '')
  if (digits.length !== 10) return false

  let sum = 0
  for (let i = 0; i < 10; i++) {
    let digit = parseInt(digits[i], 10)
    if (i % 2 === 0) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

export const FiscalPeriodListInputSchema = z.object({
  fiscal_year_id: z.number().int().positive(),
})

export const PeriodActionInputSchema = z.object({
  period_id: z.number().int().positive(),
})

export const CreateCompanyInputSchema = z
  .object({
    name: z
      .string()
      .min(2, 'Företagsnamnet måste vara minst 2 tecken')
      .max(200, 'Företagsnamnet får vara max 200 tecken'),

    org_number: z
      .string()
      .regex(
        /^[5-9]\d{5}-\d{4}$/,
        'Organisationsnummer måste ha formatet NNNNNN-NNNN där första siffran är 5-9 (aktiebolag). Denna version stöder endast aktiebolag.',
      )
      .refine(
        luhnCheck,
        'Ogiltigt organisationsnummer (kontrollsiffran stämmer inte)',
      ),

    fiscal_rule: z.enum(['K2', 'K3']),

    share_capital: z
      .number()
      .int('Aktiekapital måste vara ett heltal (ören)')
      .min(2_500_000, 'Aktiekapital måste vara minst 25 000 kr'),

    registration_date: z
      .string()
      .date('Ogiltigt datumformat')
      .refine(
        (d) => new Date(d) <= new Date(),
        'Registreringsdatum kan inte vara i framtiden',
      ),

    board_members: z.string().max(1000).nullable().optional(),

    fiscal_year_start: z.string().date('Ogiltigt datumformat'),
    fiscal_year_end: z.string().date('Ogiltigt datumformat'),
  })
  .refine(
    (data) => new Date(data.fiscal_year_end) > new Date(data.fiscal_year_start),
    {
      message: 'Räkenskapsårets slut måste vara efter start',
      path: ['fiscal_year_end'],
    },
  )
  .refine(
    (data) => {
      // BFL 3:3 — första räkenskapsåret får starta vid registreringsdatum
      // (kortat första FY). Övriga första-FY måste starta 1:a i en
      // BFL-tillåten månad.
      if (data.fiscal_year_start === data.registration_date) return true
      const startDay = parseInt(data.fiscal_year_start.substring(8, 10), 10)
      if (startDay !== 1) return false
      const startMonth = parseInt(data.fiscal_year_start.substring(5, 7), 10)
      return BFL_ALLOWED_START_MONTHS.includes(
        startMonth as (typeof BFL_ALLOWED_START_MONTHS)[number],
      )
    },
    {
      message: ERR_MSG_INVALID_FY_START_MONTH,
      path: ['fiscal_year_start'],
    },
  )
  .refine(
    (data) => {
      // fiscal_year_end MÅSTE vara sista dagen i sin månad — annars kan
      // generatePeriods producera > 12 perioder och bryta DB CHECK.
      const endDate = new Date(data.fiscal_year_end + 'T00:00:00')
      const nextDay = new Date(endDate)
      nextDay.setDate(nextDay.getDate() + 1)
      return nextDay.getDate() === 1 // dag efter slut är 1:a i nästa månad
    },
    {
      message: 'Räkenskapsårets slut måste vara sista dagen i en månad',
      path: ['fiscal_year_end'],
    },
  )
  .refine(
    (data) => {
      // Max 12 perioder (begränsat av DB CHECK period_number <= 12). För
      // kortat första FY betyder detta att FY-slutet måste ligga inom
      // start-månadens år + max 11 hela kalendermånader efteråt.
      const start = new Date(data.fiscal_year_start + 'T00:00:00')
      const end = new Date(data.fiscal_year_end + 'T00:00:00')
      const startOfStartMonth = new Date(
        start.getFullYear(),
        start.getMonth(),
        1,
      )
      const monthsDiff =
        (end.getFullYear() - startOfStartMonth.getFullYear()) * 12 +
        (end.getMonth() - startOfStartMonth.getMonth())
      return monthsDiff <= 11 // 0 = samma månad (1 period), 11 = 12 månader (12 perioder)
    },
    {
      message:
        'Räkenskapsåret får omfatta högst 12 perioder (kalendermånader). För förlängt första FY — kontakta utvecklaren.',
      path: ['fiscal_year_end'],
    },
  )

// === Delad VAT-validering ===
export const VatNumberSchema = z
  .string()
  .max(20)
  .nullable()
  .optional()
  .refine(
    (val) => !val || /^[A-Z]{2}[A-Z0-9]{2,12}$/.test(val),
    'VAT-nummer måste börja med landskod (t.ex. SE, DE) följt av 2-12 tecken',
  )

// === Counterparty ===
export const CreateCounterpartyInputSchema = z
  .object({
    company_id: z.number().int().positive(),
    name: z.string().min(1).max(200),
    type: z.enum(['customer', 'supplier', 'both']).default('customer'),
    org_number: z
      .string()
      .regex(/^\d{6}-\d{4}$/)
      .nullable()
      .optional(),
    vat_number: VatNumberSchema,
    address_line1: z.string().max(500).nullable().optional(),
    postal_code: z.string().max(20).nullable().optional(),
    city: z.string().max(100).nullable().optional(),
    country: z.string().max(100).default('Sverige'),
    contact_person: z.string().max(200).nullable().optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().max(50).nullable().optional(),
    default_payment_terms: z.number().int().min(1).max(365).default(30),
    bankgiro: z
      .string()
      .regex(/^\d{3,4}-?\d{4}$/)
      .nullable()
      .optional(),
    plusgiro: z
      .string()
      .regex(/^\d{2,8}$/)
      .nullable()
      .optional(),
    bank_account: z.string().max(50).nullable().optional(),
    bank_clearing: z
      .string()
      .regex(/^\d{4}$/)
      .nullable()
      .optional(),
  })
  .strict()

export const UpdateCounterpartyInputSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .merge(CreateCounterpartyInputSchema.partial())
  .strict()

export const CounterpartyListInputSchema = z
  .object({
    company_id: z.number().int().positive(),
    search: z.string().optional(),
    type: z.enum(['customer', 'supplier', 'both']).optional(),
    active_only: z.boolean().default(true),
  })
  .strict()

export const CounterpartyIdSchema = z
  .object({
    id: z.number().int().positive(),
    company_id: z.number().int().positive(),
  })
  .strict()

// === Company switch (Sprint MC1) ===
export const CompanySwitchInputSchema = z
  .object({
    company_id: z.number().int().positive(),
  })
  .strict()

// === Company update ===
export const UpdateCompanyInputSchema = z
  .object({
    vat_number: VatNumberSchema,
    address_line1: z.string().max(500).nullable().optional(),
    postal_code: z.string().max(20).nullable().optional(),
    city: z.string().max(100).nullable().optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().max(50).nullable().optional(),
    bankgiro: z.string().max(20).nullable().optional(),
    plusgiro: z.string().max(20).nullable().optional(),
    website: z.string().max(200).nullable().optional(),
    board_members: z.string().max(500).nullable().optional(),
    approved_for_f_tax: z.number().int().min(0).max(1).optional(),
  })
  .strict()

// === Product ===
export const CreateProductInputSchema = z
  .object({
    company_id: z.number().int().positive(),
    name: z.string().min(1).max(200),
    description: z.string().max(1000).nullable().optional(),
    unit: z
      .enum(['timme', 'styck', 'dag', 'månad', 'km', 'pauschal'])
      .default('timme'),
    default_price_ore: z.number().int().min(0),
    vat_code_id: z.number().int().positive(),
    account_id: z.number().int().positive(),
    article_type: z.enum(['service', 'goods', 'expense']).default('service'),
  })
  .strict()

export const UpdateProductInputSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .merge(CreateProductInputSchema.partial())
  .strict()

export const ProductListInputSchema = z
  .object({
    company_id: z.number().int().positive(),
    search: z.string().optional(),
    type: z.enum(['service', 'goods', 'expense']).optional(),
    active_only: z.boolean().default(true),
  })
  .strict()

export const ProductIdSchema = z
  .object({
    id: z.number().int().positive(),
    company_id: z.number().int().positive(),
  })
  .strict()

export const SetCustomerPriceInputSchema = z
  .object({
    company_id: z.number().int().positive(),
    product_id: z.number().int().positive(),
    counterparty_id: z.number().int().positive(),
    price_ore: z.number().int().min(0),
  })
  .strict()

export const RemoveCustomerPriceInputSchema = z
  .object({
    company_id: z.number().int().positive(),
    product_id: z.number().int().positive(),
    counterparty_id: z.number().int().positive(),
  })
  .strict()

export const GetPriceForCustomerInputSchema = z
  .object({
    company_id: z.number().int().positive(),
    product_id: z.number().int().positive(),
    counterparty_id: z.number().int().positive(),
  })
  .strict()

// === Stödjande ===
export const VatCodeListInputSchema = z
  .object({
    direction: z.enum(['outgoing', 'incoming']).optional(),
  })
  .strict()

export const AccountListInputSchema = z
  .object({
    fiscal_rule: z.enum(['K2', 'K3']),
    class: z.number().int().min(1).max(9).optional(),
    is_active: z.boolean().optional(),
  })
  .strict()

export const AccountListAllInputSchema = z
  .object({
    is_active: z.boolean().optional(),
  })
  .strict()

export const AccountCreateInputSchema = z
  .object({
    account_number: z
      .string()
      .regex(/^\d{4,6}$/, 'Kontonummer måste vara 4–6 siffror'),
    name: z.string().min(1).max(200),
    k2_allowed: z.boolean(),
    k3_only: z.boolean(),
  })
  .strict()

export const AccountUpdateInputSchema = z
  .object({
    account_number: z.string().min(4),
    name: z.string().min(1).max(200),
    k2_allowed: z.boolean(),
    k3_only: z.boolean(),
  })
  .strict()

export const AccountToggleActiveInputSchema = z
  .object({
    account_number: z.string().min(4),
    is_active: z.boolean(),
  })
  .strict()

// === Account Statement ===
export const AccountStatementInputSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
    account_number: z.string().min(4).max(5),
    date_from: z.string().min(10).max(10).optional(),
    date_to: z.string().min(10).max(10).optional(),
  })
  .strict()

// === Invoice Draft ===
export const InvoiceDraftLineSchema = z
  .object({
    product_id: z.number().int().positive().nullable(),
    description: z.string().min(1).max(500),
    quantity: z
      .number()
      .positive()
      .max(MAX_QTY_INVOICE, { message: ERR_MSG_MAX_QTY_INVOICE })
      .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9, {
        message: 'Quantity kan ha högst 2 decimaler',
      }),
    unit_price_ore: z.number().int().min(0), // ören
    vat_code_id: z.number().int().positive(),
    sort_order: z.number().int().min(0),
    account_number: z.string().nullable().optional(),
  })
  .strict()

export const SaveDraftInputSchema = z
  .object({
    counterparty_id: z.number().int().positive(),
    fiscal_year_id: z.number().int().positive(),
    invoice_type: z
      .enum(['customer_invoice', 'credit_note'])
      .default('customer_invoice'),
    credits_invoice_id: z.number().int().positive().nullable().optional(),
    invoice_date: z.string().min(10).max(10),
    due_date: z.string().min(10).max(10),
    payment_terms: z.number().int().min(1).max(365).default(30),
    notes: z.string().max(2000).nullable().optional(),
    currency: z.literal('SEK').default('SEK'),
    lines: z
      .array(InvoiceDraftLineSchema)
      .min(1, 'Fakturan måste ha minst en rad'),
  })
  .strict()

export const UpdateDraftInputSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .merge(SaveDraftInputSchema.omit({ fiscal_year_id: true }))
  .strict()

export const InvoiceIdSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .strict()

export const DraftListInputSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
  })
  .strict()

export const NextNumberInputSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
  })
  .strict()

export const CreateCreditNoteDraftSchema = z
  .object({
    original_invoice_id: z.number().int().positive(),
    fiscal_year_id: z.number().int().positive(),
  })
  .strict()

// === Finalize (bokför) ===
export const FinalizeInvoiceInputSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .strict()

// === Update sent invoice (begränsat) ===
export const UpdateSentInvoiceInputSchema = z
  .object({
    id: z.number().int().positive(),
    notes: z.string().max(2000).nullable().optional(),
    payment_terms: z.number().int().min(1).max(365).optional(),
    due_date: z.string().min(10).max(10).optional(),
  })
  .strict()

// === Invoice List ===
export const InvoiceListInputSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
    status: z.string().optional(),
    search: z.string().max(200).optional(),
    sort_by: z
      .enum([
        'invoice_date',
        'due_date',
        'invoice_number',
        'total_amount',
        'counterparty_name',
      ])
      .default('invoice_date'),
    sort_order: z.enum(['asc', 'desc']).default('desc'),
    /** Sprint 56 F67: pagination. Default 50, max 200. */
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .strict()

// === Invoice Payment ===
export const PayInvoiceInputSchema = z
  .object({
    invoice_id: z.number().int().positive(),
    amount_ore: z.number().int().positive(),
    payment_date: z.string().min(10).max(10),
    payment_method: z.enum(['bankgiro', 'swish', 'kort', 'kontant', 'bank']),
    account_number: z.string().min(4).max(4),
    bank_fee_ore: z.number().int().min(0).optional(),
  })
  .strict()

export const GetPaymentsInputSchema = z
  .object({
    invoice_id: z.number().int().positive(),
  })
  .strict()

// === Expenses ===
export const ExpenseLineInputSchema = z
  .object({
    description: z.string().min(1),
    account_number: z.string().min(4).max(4),
    quantity: z
      .number()
      .int()
      .min(1)
      .max(MAX_QTY_EXPENSE, { message: ERR_MSG_MAX_QTY_EXPENSE }),
    unit_price_ore: z.number().int().min(0),
    vat_code_id: z.number().int().positive(),
    sort_order: z.number().int().min(0).optional(),
  })
  .strict()

export const SaveExpenseDraftSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
    counterparty_id: z.number().int().positive(),
    expense_type: z.enum(['normal', 'credit_note']).default('normal'),
    credits_expense_id: z.number().int().positive().nullable().optional(),
    supplier_invoice_number: z.string().nullable().optional(),
    expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    due_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    description: z.string().min(1),
    payment_terms: z.number().int().min(0).optional().default(30),
    notes: z.preprocess(
      (v) => (v === null ? '' : v),
      z.string().optional().default(''),
    ),
    lines: z.array(ExpenseLineInputSchema).min(1),
  })
  .strict()

export const CreateExpenseCreditNoteDraftSchema = z
  .object({
    original_expense_id: z.number().int().positive(),
    fiscal_year_id: z.number().int().positive(),
  })
  .strict()

export const UpdateExpenseDraftSchema = SaveExpenseDraftSchema.omit({
  fiscal_year_id: true,
})
  .extend({ id: z.number().int().positive() })
  .strict()

export const ExpenseIdSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .strict()

export const ListExpenseDraftsSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
  })
  .strict()

export const FinalizeExpenseSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .strict()

// === Expense Payment ===
export const PayExpenseInputSchema = z
  .object({
    expense_id: z.number().int().positive(),
    amount_ore: z.number().int().positive(),
    payment_date: z.string().min(10).max(10),
    payment_method: z.enum(['bankgiro', 'swish', 'kort', 'kontant', 'bank']),
    account_number: z.string().min(4).max(4),
    bank_fee_ore: z.number().int().min(0).optional(),
  })
  .strict()

export const GetExpensePaymentsSchema = z
  .object({
    expense_id: z.number().int().positive(),
  })
  .strict()

export const GetExpenseSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .strict()

// === Dashboard ===
export const DashboardSummaryInputSchema = z
  .object({
    fiscalYearId: z.number().int().positive(),
  })
  .strict()

// === Tax ===
export const TaxForecastInputSchema = z
  .object({
    fiscalYearId: z.number().int().positive(),
  })
  .strict()

// === VAT Report ===
export const VatReportInputSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
  })
  .strict()

// === SIE5 Export ===
export const ExportSie5Schema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
  })
  .strict()

export const ExportExcelSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .refine(
    (data) => {
      if (data.start_date && data.end_date)
        return data.start_date <= data.end_date
      return true
    },
    { message: 'start_date must be <= end_date' },
  )

export const ExportSie4Schema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
  })
  .strict()

// === Manual Entry schemas ===

const ManualEntryLineInputSchema = z
  .object({
    account_number: z.string().min(4),
    debit_ore: z.number().int().min(0),
    credit_ore: z.number().int().min(0),
    description: z.string().optional(),
  })
  .strict()

export const SaveManualEntryDraftSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
    entry_date: z.string().optional(),
    description: z.string().optional(),
    lines: z.array(ManualEntryLineInputSchema).min(1),
  })
  .strict()

export const UpdateManualEntryDraftSchema = z
  .object({
    id: z.number().int().positive(),
    entry_date: z.string().optional(),
    description: z.string().optional(),
    lines: z.array(ManualEntryLineInputSchema).min(1),
  })
  .strict()

export const ManualEntryIdSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .strict()

export const ManualEntryFinalizeSchema = z
  .object({
    id: z.number().int().positive(),
    fiscal_year_id: z.number().int().positive(),
  })
  .strict()

export const ManualEntryListSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
  })
  .strict()

// === Imported Entries (I-serie, source_type='import') ===

export const ListImportedEntriesSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
  })
  .strict()

// === Journal Entry Corrections ===

export const CorrectJournalEntrySchema = z
  .object({
    journal_entry_id: z.number().int().positive(),
    fiscal_year_id: z.number().int().positive(),
  })
  .strict()

export const CanCorrectSchema = z
  .object({
    journal_entry_id: z.number().int().positive(),
  })
  .strict()

// === Bulk Payment ===
export const PayInvoicesBulkPayloadSchema = z
  .object({
    payments: z
      .array(
        z
          .object({
            invoice_id: z.number().int().positive(),
            amount_ore: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1, 'Minst en betalning krävs'),
    payment_date: z.string().min(10).max(10),
    account_number: z.string().min(4).max(4),
    bank_fee_ore: z.number().int().min(0).optional(),
    user_note: z.string().max(500).optional(),
  })
  .strict()

export const PayExpensesBulkPayloadSchema = z
  .object({
    payments: z
      .array(
        z
          .object({
            expense_id: z.number().int().positive(),
            amount_ore: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1, 'Minst en betalning krävs'),
    payment_date: z.string().min(10).max(10),
    account_number: z.string().min(4).max(4),
    bank_fee_ore: z.number().int().min(0).optional(),
    user_note: z.string().max(500).optional(),
  })
  .strict()

export const BulkPaymentResultSchema = z.object({
  batch_id: z.number().int().positive().nullable(),
  status: z.enum(['completed', 'partial', 'cancelled']),
  succeeded: z.array(
    z.object({
      id: z.number().int().positive(),
      payment_id: z.number().int().positive(),
      journal_entry_id: z.number().int().positive(),
    }),
  ),
  failed: z.array(
    z.object({
      id: z.number().int().positive(),
      error: z.string(),
      code: z.string(),
    }),
  ),
  bank_fee_journal_entry_id: z.number().int().positive().nullable(),
})

// === Reports ===
export const ReportRequestSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
    date_range: z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .optional(),
  })
  .strict()

// === Export Write File ===
export const ExportWriteFileRequestSchema = z
  .object({
    format: z.enum(['sie5', 'sie4', 'excel']),
    fiscal_year_id: z.number().int().positive(),
    date_range: z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .optional(),
  })
  .strict()

export const ListExpensesSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
    status: z
      .enum(['draft', 'unpaid', 'paid', 'overdue', 'partial'])
      .optional(),
    search: z.string().max(200).optional(),
    sort_by: z
      .enum([
        'expense_date',
        'due_date',
        'description',
        'total_amount',
        'counterparty_name',
        'status',
        'supplier_invoice_number',
      ])
      .default('expense_date'),
    sort_order: z.enum(['asc', 'desc']).default('desc'),
    /** Sprint 56 F67: pagination. */
    limit: z.number().int().min(1).max(200).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .strict()

// === Invoice PDF ===
export const GenerateInvoicePdfSchema = z
  .object({
    invoiceId: z.number().int().positive(),
  })
  .strict()

export const SaveInvoicePdfSchema = z
  .object({
    data: z.string().min(1), // Base64-encodad PDF
    defaultFileName: z.string().min(1),
  })
  .strict()

export const SelectDirectorySchema = z.object({}).strict()

export const SavePdfBatchSchema = z
  .object({
    directory: z.string().min(1),
    invoices: z
      .array(
        z.object({
          invoiceId: z.number().int().positive(),
          fileName: z.string().min(1),
        }),
      )
      .min(1),
  })
  .strict()

// === Fiscal Year Create / Switch / Net Result ===
export const FiscalYearCreateNewInputSchema = z
  .object({
    confirmBookResult: z.boolean(),
    netResultOre: z.number().int().optional(),
  })
  .strict()

export const FiscalYearSwitchInputSchema = z
  .object({
    fiscalYearId: z.number().int().positive(),
  })
  .strict()

export const NetResultInputSchema = z
  .object({
    fiscalYearId: z.number().int().positive(),
  })
  .strict()

// === Budget ===
export const BudgetLinesSchema = z.object({}).strict()

export const BudgetGetSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
  })
  .strict()

export const BudgetSaveSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
    targets: z
      .array(
        z.object({
          line_id: z.string().min(1),
          period_number: z.number().int().min(1).max(12),
          amount_ore: z.number().int(),
        }),
      )
      .min(1),
  })
  .strict()

export const BudgetVarianceSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
  })
  .strict()

export const BudgetCopySchema = z
  .object({
    target_fiscal_year_id: z.number().int().positive(),
    source_fiscal_year_id: z.number().int().positive(),
  })
  .strict()

export const BudgetSummaryByYearSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
  })
  .strict()

// === SIE4 Import ===
export const Sie4SelectFileSchema = z.object({}).strict()

export const Sie4ValidateSchema = z
  .object({
    filePath: z.string().min(1),
  })
  .strict()

export const Sie4ImportSchema = z
  .object({
    filePath: z.string().min(1),
    strategy: z.enum(['new', 'merge']),
    fiscal_year_id: z.number().int().positive().optional(),
    /**
     * Sprint 57 B3a: per-konto-resolution vid namnkonflikt (merge-strategi).
     * Nycklar som inte matchar konflikter i validate-svaret filtreras bort
     * server-side. Saknad nyckel → defaultar 'keep' i service.
     */
    conflict_resolutions: z
      .record(z.string(), z.enum(['keep', 'overwrite', 'skip']))
      .optional(),
  })
  .strict()

// === SIE5 Import (Sprint U2) ===
export const Sie5SelectFileSchema = z.object({}).strict()

export const Sie5ValidateSchema = z
  .object({
    filePath: z.string().min(1),
  })
  .strict()

export const Sie5ImportSchema = z
  .object({
    filePath: z.string().min(1),
    strategy: z.enum(['new', 'merge']),
    fiscal_year_id: z.number().int().positive().optional(),
    conflict_resolutions: z
      .record(z.string(), z.enum(['keep', 'overwrite', 'skip']))
      .optional(),
  })
  .strict()

// === SEPA DD (Sprint U1) ===
export const SepaDdCreateMandateSchema = z
  .object({
    counterparty_id: z.number().int().positive(),
    mandate_reference: z.string().min(1).max(35),
    signature_date: z.string().min(1),
    sequence_type: z.enum(['OOFF', 'FRST', 'RCUR', 'FNAL']),
    iban: z.string().min(15).max(40),
    bic: z.string().min(8).max(11).nullable().optional(),
  })
  .strict()

export const SepaDdListMandatesSchema = z
  .object({ counterparty_id: z.number().int().positive() })
  .strict()

export const SepaDdRevokeMandateSchema = z
  .object({ mandate_id: z.number().int().positive() })
  .strict()

export const SepaDdCreateCollectionSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
    mandate_id: z.number().int().positive(),
    invoice_id: z.number().int().positive().nullable().optional(),
    amount_ore: z.number().int().positive(),
    collection_date: z.string().min(1),
  })
  .strict()

export const SepaDdCreateBatchSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
    collection_ids: z.array(z.number().int().positive()).min(1),
    payment_date: z.string().min(1),
    account_number: z.string().min(1),
    user_note: z.string().nullable().optional(),
  })
  .strict()

export const SepaDdExportPain008Schema = z
  .object({ batch_id: z.number().int().positive() })
  .strict()

export const SepaDdListCollectionsSchema = z
  .object({ fiscal_year_id: z.number().int().positive() })
  .strict()

export const SepaDdListBatchesSchema = z
  .object({ fiscal_year_id: z.number().int().positive() })
  .strict()

// === Payment Batch Export ===
export const PaymentBatchValidateExportSchema = z
  .object({
    batch_id: z.number().int().positive(),
  })
  .strict()

export const PaymentBatchExportPain001Schema = z
  .object({
    batch_id: z.number().int().positive(),
  })
  .strict()

// === Accruals (Periodiseringar) ===
export const AccrualCreateSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
    description: z.string().min(1),
    accrual_type: z.enum([
      'prepaid_expense',
      'accrued_expense',
      'prepaid_income',
      'accrued_income',
    ]),
    balance_account: z.string().min(1),
    result_account: z.string().min(1),
    total_amount_ore: z.number().int().positive(),
    period_count: z.number().int().min(2).max(12),
    start_period: z.number().int().min(1).max(12),
  })
  .strict()
  .refine((d) => d.start_period + d.period_count - 1 <= 12, {
    message: 'Periodiseringen får inte sträcka sig utanför räkenskapsåret',
  })

export const AccrualListSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
  })
  .strict()

export const AccrualExecuteSchema = z
  .object({
    schedule_id: z.number().int().positive(),
    period_number: z.number().int().min(1).max(12),
  })
  .strict()

export const AccrualExecuteAllSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
    period_number: z.number().int().min(1).max(12),
  })
  .strict()

export const AccrualDeactivateSchema = z
  .object({
    schedule_id: z.number().int().positive(),
  })
  .strict()

// === Aging Report ===
export const AgingInputSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
    as_of_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict()

// === Cash Flow (Sprint 53 F65) ===
export const CashFlowInputSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
  })
  .strict()

// === Fixed Assets / Depreciation (Sprint 53 F62) ===
export const DepreciationCreateAssetSchema = z
  .object({
    name: z.string().min(1).max(200),
    acquisition_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    acquisition_cost_ore: z.number().int().min(0),
    residual_value_ore: z.number().int().min(0).default(0),
    useful_life_months: z.number().int().min(1).max(600),
    method: z.enum(['linear', 'declining']),
    declining_rate_bp: z.number().int().min(1).max(10000).optional(),
    account_asset: z.string().min(4).max(10),
    account_accumulated_depreciation: z.string().min(4).max(10),
    account_depreciation_expense: z.string().min(4).max(10),
  })
  .strict()

export const DepreciationUpdateAssetSchema = z
  .object({
    id: z.number().int().positive(),
    input: DepreciationCreateAssetSchema,
  })
  .strict()

export const DepreciationListSchema = z
  .object({
    fiscal_year_id: z.number().int().positive().optional(),
  })
  .strict()

export const DepreciationIdSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .strict()

export const DepreciationDisposeSchema = z
  .object({
    id: z.number().int().positive(),
    disposed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    generate_journal_entry: z.boolean().optional(),
    sale_price_ore: z.number().int().min(0).optional(),
    proceeds_account: z.string().min(4).max(10).nullable().optional(),
  })
  .strict()

export const DepreciationExecutePeriodSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
    period_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict()

// === Bank statement / reconciliation (Sprint 55 F66-a) ===
export const BankStatementImportSchema = z
  .object({
    company_id: z.number().int().positive(),
    fiscal_year_id: z.number().int().positive(),
    xml_content: z.string().min(1),
    // Sprint F P6 + Sprint Q T3.d: camt.053/.054 (XML), mt940 (SWIFT),
    // bgmax (Bankgirocentralen). Om omitted → autodetektion från content.
    format: z.enum(['camt.053', 'camt.054', 'mt940', 'bgmax']).optional(),
  })
  .strict()

export const BankStatementListSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
  })
  .strict()

export const BankStatementGetSchema = z
  .object({
    statement_id: z.number().int().positive(),
  })
  .strict()

export const BankStatementSuggestMatchesSchema = z
  .object({
    statement_id: z.number().int().positive(),
  })
  .strict()

export const BankMatchTransactionSchema = z
  .object({
    bank_transaction_id: z.number().int().positive(),
    matched_entity_type: z.enum(['invoice', 'expense']),
    matched_entity_id: z.number().int().positive(),
    payment_account: z.string().min(4).max(10),
  })
  .strict()

// S58 F66-e: unmatch av bank-reconciliation (skapar korrigeringsverifikat)
export const BankUnmatchTransactionSchema = z
  .object({
    bank_transaction_id: z.number().int().positive(),
    correction_description: z.string().max(200).optional(),
  })
  .strict()

// Sprint F P2: unmatch av hel payment_batch (M154 + M146)
export const BankUnmatchBatchSchema = z
  .object({
    batch_id: z.number().int().positive(),
  })
  .strict()

// Sprint F P4: bank_tx_code_mappings CRUD
export const BankTxMappingUpsertSchema = z
  .object({
    id: z.number().int().positive().optional(),
    domain: z.string().min(1).max(10),
    family: z.string().min(1).max(10),
    subfamily: z.string().min(1).max(10),
    classification: z.enum(['bank_fee', 'interest', 'ignore']),
    account_number: z.string().min(4).max(10).nullable().optional(),
  })
  .strict()

export const BankTxMappingDeleteSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .strict()

// S58 F66-d: skapa bank-fee-verifikat för auto-klassificerad TX
export const BankCreateFeeEntrySchema = z
  .object({
    bank_transaction_id: z.number().int().positive(),
    payment_account: z.string().min(4).max(10),
    skipChronologyCheck: z.boolean().optional(),
  })
  .strict()

// ---------------------------------------------------------------------------
// channelMap — explicit mapping of every IPC channel to its Zod input schema.
// Used by mock-IPC (tests/setup/mock-ipc.ts) for input validation.
//
// Channels WITHOUT a Zod schema (no input or raw primitives) are excluded:
//   'db:health-check', 'company:get', 'fiscal-year:list',
//   'opening-balance:re-transfer', 'backup:create',
//   'settings:get', 'settings:set'
//
// Schemas NOT in this map (not IPC channels — embedded/helper schemas):
//   VatNumberSchema, InvoiceDraftLineSchema, BulkPaymentResultSchema
// === Global Search ===

export const GlobalSearchSchema = z
  .object({
    query: z.string().min(2).max(200),
    fiscal_year_id: z.number().int().positive(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict()

// ---------------------------------------------------------------------------
export const channelMap = {
  // Company
  'company:create': CreateCompanyInputSchema,
  'company:get': z.void(),
  'company:update': UpdateCompanyInputSchema,
  'company:list': z.void(),
  'company:switch': CompanySwitchInputSchema,

  // Fiscal Years
  'fiscal-year:list': z.void(),
  'fiscal-year:create-new': FiscalYearCreateNewInputSchema,
  'fiscal-year:switch': FiscalYearSwitchInputSchema,

  // Fiscal Periods
  'fiscal-period:list': FiscalPeriodListInputSchema,
  'fiscal-period:close': PeriodActionInputSchema,
  'fiscal-period:reopen': PeriodActionInputSchema,

  // Opening Balance
  'opening-balance:net-result': NetResultInputSchema,

  // Counterparties
  'counterparty:list': CounterpartyListInputSchema,
  'counterparty:get': CounterpartyIdSchema,
  'counterparty:create': CreateCounterpartyInputSchema,
  'counterparty:update': UpdateCounterpartyInputSchema,
  'counterparty:deactivate': CounterpartyIdSchema,

  // Products
  'product:list': ProductListInputSchema,
  'product:get': ProductIdSchema,
  'product:create': CreateProductInputSchema,
  'product:update': UpdateProductInputSchema,
  'product:deactivate': ProductIdSchema,
  'product:set-customer-price': SetCustomerPriceInputSchema,
  'product:remove-customer-price': RemoveCustomerPriceInputSchema,
  'product:get-price-for-customer': GetPriceForCustomerInputSchema,

  // VAT & Accounts
  'vat-code:list': VatCodeListInputSchema,
  'account:list': AccountListInputSchema,
  'account:list-all': AccountListAllInputSchema,
  'account:create': AccountCreateInputSchema,
  'account:update': AccountUpdateInputSchema,
  'account:toggle-active': AccountToggleActiveInputSchema,
  'account:get-statement': AccountStatementInputSchema,

  // Invoices
  'invoice:save-draft': SaveDraftInputSchema,
  'invoice:get-draft': InvoiceIdSchema,
  'invoice:update-draft': UpdateDraftInputSchema,
  'invoice:delete-draft': InvoiceIdSchema,
  'invoice:list-drafts': DraftListInputSchema,
  'invoice:next-number': NextNumberInputSchema,
  'invoice:list': InvoiceListInputSchema,
  'invoice:finalize': FinalizeInvoiceInputSchema,
  'invoice:update-sent': UpdateSentInvoiceInputSchema,
  'invoice:pay': PayInvoiceInputSchema,
  'invoice:payBulk': PayInvoicesBulkPayloadSchema,
  'invoice:payments': GetPaymentsInputSchema,
  'invoice:generate-pdf': GenerateInvoicePdfSchema,
  'invoice:save-pdf': SaveInvoicePdfSchema,
  'invoice:select-directory': SelectDirectorySchema,
  'invoice:save-pdf-batch': SavePdfBatchSchema,
  'invoice:create-credit-note-draft': CreateCreditNoteDraftSchema,

  // Expenses
  'expense:save-draft': SaveExpenseDraftSchema,
  'expense:get-draft': ExpenseIdSchema,
  'expense:update-draft': UpdateExpenseDraftSchema,
  'expense:delete-draft': ExpenseIdSchema,
  'expense:list-drafts': ListExpenseDraftsSchema,
  'expense:finalize': FinalizeExpenseSchema,
  'expense:pay': PayExpenseInputSchema,
  'expense:payBulk': PayExpensesBulkPayloadSchema,
  'expense:payments': GetExpensePaymentsSchema,
  'expense:get': GetExpenseSchema,
  'expense:list': ListExpensesSchema,
  'expense:create-credit-note-draft': CreateExpenseCreditNoteDraftSchema,

  // Manual Entries
  'manual-entry:save-draft': SaveManualEntryDraftSchema,
  'manual-entry:get': ManualEntryIdSchema,
  'manual-entry:update-draft': UpdateManualEntryDraftSchema,
  'manual-entry:delete-draft': ManualEntryIdSchema,
  'manual-entry:list-drafts': ManualEntryListSchema,
  'manual-entry:list': ManualEntryListSchema,
  'manual-entry:finalize': ManualEntryFinalizeSchema,

  // Journal Entry Corrections
  'journal-entry:correct': CorrectJournalEntrySchema,
  'journal-entry:can-correct': CanCorrectSchema,
  'journal-entry:list-imported': ListImportedEntriesSchema,

  // Dashboard & Reports
  'dashboard:summary': DashboardSummaryInputSchema,
  'vat:report': VatReportInputSchema,
  'tax:forecast': TaxForecastInputSchema,
  'report:income-statement': ReportRequestSchema,
  'report:balance-sheet': ReportRequestSchema,

  // Exports
  'export:sie5': ExportSie5Schema,
  'export:sie4': ExportSie4Schema,
  'export:excel': ExportExcelSchema,
  'export:write-file': ExportWriteFileRequestSchema,

  // Global Search
  'search:global': GlobalSearchSchema,

  // Aging Report
  'aging:receivables': AgingInputSchema,
  'aging:payables': AgingInputSchema,

  // SIE4 Import
  'import:sie4-select-file': Sie4SelectFileSchema,
  'import:sie4-validate': Sie4ValidateSchema,
  'import:sie4-execute': Sie4ImportSchema,

  // SIE5 Import (Sprint U2)
  'import:sie5-select-file': Sie5SelectFileSchema,
  'import:sie5-validate': Sie5ValidateSchema,
  'import:sie5-execute': Sie5ImportSchema,

  // Payment batch export
  'payment-batch:validate-export': PaymentBatchValidateExportSchema,
  'payment-batch:export-pain001': PaymentBatchExportPain001Schema,

  // SEPA DD (Sprint U1 — backend-only MVP)
  'sepa-dd:create-mandate': SepaDdCreateMandateSchema,
  'sepa-dd:list-mandates': SepaDdListMandatesSchema,
  'sepa-dd:revoke-mandate': SepaDdRevokeMandateSchema,
  'sepa-dd:create-collection': SepaDdCreateCollectionSchema,
  'sepa-dd:create-batch': SepaDdCreateBatchSchema,
  'sepa-dd:export-pain008': SepaDdExportPain008Schema,
  'sepa-dd:list-collections': SepaDdListCollectionsSchema,
  'sepa-dd:list-batches': SepaDdListBatchesSchema,

  // Accruals
  'accrual:create': AccrualCreateSchema,
  'accrual:list': AccrualListSchema,
  'accrual:execute': AccrualExecuteSchema,
  'accrual:execute-all': AccrualExecuteAllSchema,
  'accrual:deactivate': AccrualDeactivateSchema,

  // Budget
  'budget:lines': BudgetLinesSchema,
  'budget:get': BudgetGetSchema,
  'budget:save': BudgetSaveSchema,
  'budget:variance': BudgetVarianceSchema,
  'budget:copy-from-previous': BudgetCopySchema,

  // Cash Flow (Sprint 53 F65)
  'report:cash-flow': CashFlowInputSchema,

  // Depreciation (Sprint 53 F62)
  'depreciation:create-asset': DepreciationCreateAssetSchema,
  'depreciation:update-asset': DepreciationUpdateAssetSchema,
  'depreciation:list': DepreciationListSchema,
  'depreciation:get': DepreciationIdSchema,
  'depreciation:dispose': DepreciationDisposeSchema,
  'depreciation:delete': DepreciationIdSchema,
  'depreciation:execute-period': DepreciationExecutePeriodSchema,

  // Bank statement / reconciliation (Sprint 55 F66-a)
  'bank-statement:import': BankStatementImportSchema,
  'bank-statement:list': BankStatementListSchema,
  'bank-statement:get': BankStatementGetSchema,
  'bank-statement:match-transaction': BankMatchTransactionSchema,
  'bank-statement:suggest-matches': BankStatementSuggestMatchesSchema,
  'bank-statement:unmatch-transaction': BankUnmatchTransactionSchema,
  'bank-statement:unmatch-batch': BankUnmatchBatchSchema,
  'bank-statement:create-fee-entry': BankCreateFeeEntrySchema,
  'bank-tx-mapping:list': z.void(),
  'bank-tx-mapping:upsert': BankTxMappingUpsertSchema,
  'bank-tx-mapping:delete': BankTxMappingDeleteSchema,
} as const satisfies Record<string, z.ZodType>

export type ChannelName = keyof typeof channelMap
