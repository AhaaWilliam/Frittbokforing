/**
 * Typed factory functions for test entities.
 * All amounts in öre (M12). Dates via todayLocal() (M81).
 * Output validated against inline schemas via .parse() — factories
 * should never produce invalid data.
 */
import { z } from 'zod'
import { todayLocal } from '../../src/shared/date-utils'
import type {
  Counterparty,
  Product,
  Invoice,
  InvoiceLine,
  Expense,
  ExpenseLine,
} from '../../src/shared/types'

// ── Deterministic ID generator ────────────────────────────────────────

let nextId = 1

/** Reset the factory counter. Call in beforeEach for deterministic IDs. */
export function resetFactoryCounter(): void {
  nextId = 1
}

function autoId(): number {
  return nextId++
}

// ── Inline validation schemas (test-only) ─────────────────────────────

const CounterpartySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  type: z.enum(['customer', 'supplier', 'both']),
  org_number: z.string().nullable(),
  vat_number: z.string().nullable(),
  address_line1: z.string().nullable(),
  postal_code: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string(),
  contact_person: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  default_payment_terms: z.number().int(),
  is_active: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
})

const ProductSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string().nullable(),
  unit: z.enum(['timme', 'styck', 'dag', 'månad', 'km', 'pauschal']),
  default_price_ore: z.number().int(),
  vat_code_id: z.number().int().positive(),
  account_id: z.number().int().positive(),
  article_type: z.enum(['service', 'goods', 'expense']),
  is_active: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
})

const InvoiceSchema = z.object({
  id: z.number().int().positive(),
  counterparty_id: z.number().int().positive(),
  fiscal_year_id: z.number().int().positive().nullable(),
  invoice_type: z.string(),
  invoice_number: z.string(),
  invoice_date: z.string(),
  due_date: z.string(),
  status: z.string(),
  net_amount_ore: z.number().int(),
  vat_amount_ore: z.number().int(),
  total_amount_ore: z.number().int(),
  currency: z.string(),
  paid_amount_ore: z.number().int(),
  journal_entry_id: z.number().nullable(),
  ocr_number: z.string().nullable(),
  notes: z.string().nullable(),
  payment_terms: z.number().int(),
  version: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
})

const InvoiceLineSchema = z.object({
  id: z.number().int().positive(),
  invoice_id: z.number().int().positive(),
  product_id: z.number().nullable(),
  description: z.string(),
  quantity: z.number().int(),
  unit_price_ore: z.number().int(),
  vat_code_id: z.number().int().positive(),
  line_total_ore: z.number().int(),
  vat_amount_ore: z.number().int(),
  sort_order: z.number().int(),
})

const ExpenseSchema = z.object({
  id: z.number().int().positive(),
  fiscal_year_id: z.number().int().positive(),
  counterparty_id: z.number().int().positive(),
  supplier_invoice_number: z.string().nullable(),
  expense_date: z.string(),
  due_date: z.string().nullable(),
  description: z.string(),
  status: z.string(),
  payment_terms: z.number().int(),
  journal_entry_id: z.number().nullable(),
  total_amount_ore: z.number().int(),
  paid_amount_ore: z.number().int(),
  notes: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})

const ExpenseLineSchema = z.object({
  id: z.number().int().positive(),
  expense_id: z.number().int().positive(),
  description: z.string(),
  account_number: z.string(),
  quantity: z.number().int(),
  unit_price_ore: z.number().int(),
  vat_code_id: z.number().int().positive(),
  line_total_ore: z.number().int(),
  vat_amount_ore: z.number().int(),
  sort_order: z.number().int(),
})

// ── M78: ArticleFormInput (string variant for form tests) ─────────────

export interface ArticleFormInput {
  name: string
  description: string
  unit: string
  default_price_ore: string // string, not number — form state before conversion
  vat_code_id: string
  account_id: string
  article_type: string
}

const ArticleFormInputSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  unit: z.string(),
  default_price_ore: z.string(),
  vat_code_id: z.string(),
  account_id: z.string(),
  article_type: z.string(),
})

// ── Factory functions ─────────────────────────────────────────────────

const today = () => todayLocal()
const now = () => `${todayLocal()}T00:00:00`

export function makeCustomer(overrides?: Partial<Counterparty>): Counterparty {
  return CounterpartySchema.parse({
    id: autoId(),
    name: 'Test Kund AB',
    type: 'customer',
    org_number: null,
    vat_number: null,
    address_line1: null,
    postal_code: null,
    city: null,
    country: 'SE',
    contact_person: null,
    email: null,
    phone: null,
    default_payment_terms: 30,
    is_active: 1,
    created_at: now(),
    updated_at: now(),
    ...overrides,
  }) as Counterparty
}

export function makeSupplier(overrides?: Partial<Counterparty>): Counterparty {
  return CounterpartySchema.parse({
    id: autoId(),
    name: 'Test Leverantör AB',
    type: 'supplier',
    org_number: null,
    vat_number: null,
    address_line1: null,
    postal_code: null,
    city: null,
    country: 'SE',
    contact_person: null,
    email: null,
    phone: null,
    default_payment_terms: 30,
    is_active: 1,
    created_at: now(),
    updated_at: now(),
    ...overrides,
  }) as Counterparty
}

export function makeArticle(overrides?: Partial<Product>): Product {
  return ProductSchema.parse({
    id: autoId(),
    name: 'Test Artikel',
    description: null,
    unit: 'timme',
    default_price_ore: 100000, // 1000 kr i öre
    vat_code_id: 1,
    account_id: 1,
    article_type: 'service',
    is_active: 1,
    created_at: now(),
    updated_at: now(),
    ...overrides,
  }) as Product
}

export function makeArticleFormInput(
  overrides?: Partial<ArticleFormInput>,
): ArticleFormInput {
  return ArticleFormInputSchema.parse({
    name: 'Test Artikel',
    description: '',
    unit: 'timme',
    default_price_ore: '100000',
    vat_code_id: '1',
    account_id: '1',
    article_type: 'service',
    ...overrides,
  }) as ArticleFormInput
}

export function makeInvoice(overrides?: Partial<Invoice>): Invoice {
  return InvoiceSchema.parse({
    id: autoId(),
    counterparty_id: 1,
    fiscal_year_id: 1,
    invoice_type: 'invoice',
    invoice_number: 'F-001',
    invoice_date: today(),
    due_date: today(),
    status: 'draft',
    net_amount_ore: 100000,
    vat_amount_ore: 25000,
    total_amount_ore: 125000,
    currency: 'SEK',
    paid_amount_ore: 0,
    journal_entry_id: null,
    ocr_number: null,
    notes: null,
    payment_terms: 30,
    version: 1,
    created_at: now(),
    updated_at: now(),
    ...overrides,
  }) as Invoice
}

export function makeInvoiceLine(
  overrides?: Partial<InvoiceLine>,
): InvoiceLine {
  return InvoiceLineSchema.parse({
    id: autoId(),
    invoice_id: 1,
    product_id: null,
    description: 'Konsulttjänst',
    quantity: 1,
    unit_price_ore: 100000,
    vat_code_id: 1,
    line_total_ore: 100000,
    vat_amount_ore: 25000,
    sort_order: 0,
    ...overrides,
  }) as InvoiceLine
}

export function makeExpense(overrides?: Partial<Expense>): Expense {
  return ExpenseSchema.parse({
    id: autoId(),
    fiscal_year_id: 1,
    counterparty_id: 1,
    supplier_invoice_number: null,
    expense_date: today(),
    due_date: null,
    description: 'Testkostnad',
    status: 'draft',
    payment_terms: 30,
    journal_entry_id: null,
    total_amount_ore: 50000,
    paid_amount_ore: 0,
    notes: '',
    created_at: now(),
    updated_at: now(),
    ...overrides,
  }) as Expense
}

export function makeExpenseLine(
  overrides?: Partial<ExpenseLine>,
): ExpenseLine {
  return ExpenseLineSchema.parse({
    id: autoId(),
    expense_id: 1,
    description: 'Material',
    account_number: '4010',
    quantity: 1,
    unit_price_ore: 50000,
    vat_code_id: 1,
    line_total_ore: 50000,
    vat_amount_ore: 12500,
    sort_order: 0,
    ...overrides,
  }) as ExpenseLine
}
