import { z } from 'zod'

/**
 * Luhn-kontroll (modulus 10) för svenska organisationsnummer.
 * Input: NNNNNN-NNNN format (t.ex. "556036-0793").
 * Returnerar true om sista siffran är korrekt kontrollsiffra.
 */
function luhnCheck(orgNumber: string): boolean {
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
        'Organisationsnummer måste ha formatet NNNNNN-NNNN där första siffran är 5-9',
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
    search: z.string().optional(),
    type: z.enum(['customer', 'supplier', 'both']).optional(),
    active_only: z.boolean().default(true),
  })
  .strict()

export const CounterpartyIdSchema = z
  .object({
    id: z.number().int().positive(),
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
  })
  .strict()

// === Product ===
export const CreateProductInputSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(1000).nullable().optional(),
    unit: z
      .enum(['timme', 'styck', 'dag', 'månad', 'km', 'pauschal'])
      .default('timme'),
    default_price: z.number().int().min(0),
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
    search: z.string().optional(),
    type: z.enum(['service', 'goods', 'expense']).optional(),
    active_only: z.boolean().default(true),
  })
  .strict()

export const ProductIdSchema = z
  .object({
    id: z.number().int().positive(),
  })
  .strict()

export const SetCustomerPriceInputSchema = z
  .object({
    product_id: z.number().int().positive(),
    counterparty_id: z.number().int().positive(),
    price: z.number().int().min(0),
  })
  .strict()

export const RemoveCustomerPriceInputSchema = z
  .object({
    product_id: z.number().int().positive(),
    counterparty_id: z.number().int().positive(),
  })
  .strict()

export const GetPriceForCustomerInputSchema = z
  .object({
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

// === Invoice Draft ===
export const InvoiceDraftLineSchema = z
  .object({
    product_id: z.number().int().positive().nullable(),
    description: z.string().min(1).max(500),
    quantity: z.number().positive(),
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
  })
  .strict()

// === Invoice Payment ===
export const PayInvoiceInputSchema = z
  .object({
    invoice_id: z.number().int().positive(),
    amount: z.number().int().positive(),
    payment_date: z.string().min(10).max(10),
    payment_method: z.enum(['bankgiro', 'swish', 'kort', 'kontant']),
    account_number: z.string().min(4).max(4),
  })
  .strict()

export const GetPaymentsInputSchema = z
  .object({
    invoice_id: z.number().int().positive(),
  })
  .strict()

// === Expenses ===
const ExpenseLineInputSchema = z
  .object({
    description: z.string().min(1),
    account_number: z.string().min(4).max(4),
    quantity: z.number().int().min(1),
    unit_price_ore: z.number().int(),
    vat_code_id: z.number().int().positive(),
    sort_order: z.number().int().min(0).optional(),
  })
  .strict()

export const SaveExpenseDraftSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
    counterparty_id: z.number().int().positive(),
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
    amount: z.number().int().positive(),
    payment_date: z.string().min(10).max(10),
    payment_method: z.enum(['bankgiro', 'swish', 'kort', 'kontant']),
    account_number: z.string().min(4).max(4),
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
    debit_amount: z.number().int().min(0),
    credit_amount: z.number().int().min(0),
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
