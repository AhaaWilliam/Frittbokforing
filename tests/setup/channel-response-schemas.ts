/**
 * F59: Per-channel response-schema validation for mock-IPC.
 *
 * Validates the `data` field inside IpcResult responses against
 * channel-specific Zod schemas. Channels without a registered schema
 * fall back to outer IpcResult-shape-only validation (F57).
 */
import { z } from 'zod'

// === Reusable sub-schemas ===

const FiscalYearSchema = z.object({
  id: z.number(),
  company_id: z.number(),
  year_label: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  is_closed: z.union([z.literal(0), z.literal(1)]),
  annual_report_status: z.string(),
})

const FiscalPeriodSchema = z.object({
  id: z.number(),
  fiscal_year_id: z.number(),
  period_number: z.number(),
  start_date: z.string(),
  end_date: z.string(),
  is_closed: z.union([z.literal(0), z.literal(1)]),
})

const CounterpartySchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
}).passthrough()

const ProductSchema = z.object({
  id: z.number(),
  name: z.string(),
}).passthrough()

const VatCodeSchema = z.object({
  id: z.number(),
  code: z.string(),
}).passthrough()

const BulkPaymentResultSchema = z.object({
  batch_id: z.number().nullable(),
  status: z.enum(['completed', 'partial', 'cancelled']),
  succeeded: z.array(z.object({
    id: z.number(),
    payment_id: z.number(),
    journal_entry_id: z.number(),
  })),
  failed: z.array(z.object({
    id: z.number(),
    error: z.string(),
    code: z.string(),
  })),
  bank_fee_journal_entry_id: z.number().nullable(),
})

// === Channel → response data schema mapping ===

export const CHANNEL_RESPONSE_SCHEMAS: Partial<Record<string, z.ZodType>> = {
  // Fiscal Years
  'fiscal-year:list': z.array(FiscalYearSchema),
  'fiscal-year:create-new': z.object({
    fiscalYear: FiscalYearSchema,
  }).passthrough(),
  'fiscal-year:switch': FiscalYearSchema,

  // Fiscal Periods
  'fiscal-period:list': z.array(FiscalPeriodSchema),
  'fiscal-period:close': z.unknown(), // IpcResult success is sufficient
  'fiscal-period:reopen': z.unknown(),

  // Opening Balance
  'opening-balance:net-result': z.object({
    netResultOre: z.number(),
    isAlreadyBooked: z.boolean(),
  }),

  // Counterparties
  'counterparty:list': z.array(CounterpartySchema),
  'counterparty:get': CounterpartySchema.nullable(),

  // Products
  'product:list': z.array(ProductSchema),
  'product:get': ProductSchema.nullable(),

  // VAT
  'vat-code:list': z.array(VatCodeSchema),

  // Bulk payments
  'invoice:payBulk': BulkPaymentResultSchema,
  'expense:payBulk': BulkPaymentResultSchema,

  // SIE4 Import
  'import:sie4-select-file': z.object({ filePath: z.string() }).nullable(),
  'import:sie4-validate': z.object({
    valid: z.boolean(),
    errors: z.array(z.object({ code: z.string(), message: z.string() }).passthrough()),
    warnings: z.array(z.object({ code: z.string(), message: z.string() }).passthrough()),
    summary: z.object({}).passthrough(),
  }),

  // Payment batch export
  'payment-batch:validate-export': z.object({
    valid: z.boolean(),
    issues: z.array(z.object({ counterpartyId: z.number(), counterpartyName: z.string(), issue: z.string() })),
  }).passthrough(),
  'payment-batch:export-pain001': z.object({ saved: z.boolean() }).passthrough(),

  // Accruals
  'accrual:create': z.object({ id: z.number() }),
  'accrual:list': z.array(z.object({ id: z.number(), description: z.string() }).passthrough()),
  'accrual:execute': z.object({ journalEntryId: z.number() }),
  'accrual:execute-all': z.object({
    executed: z.number(),
    failed: z.array(z.object({ scheduleId: z.number(), error: z.string() })),
  }),
  'accrual:deactivate': z.undefined(),

  // Budget
  'budget:lines': z.array(z.object({
    lineId: z.string(),
    label: z.string(),
    groupId: z.string(),
    groupLabel: z.string(),
    signMultiplier: z.union([z.literal(1), z.literal(-1)]),
  })),
  'budget:get': z.array(z.object({
    id: z.number(),
    fiscal_year_id: z.number(),
    line_id: z.string(),
    period_number: z.number(),
    amount_ore: z.number(),
  }).passthrough()),
  'budget:save': z.object({ count: z.number() }),
  'budget:variance': z.object({
    lines: z.array(z.object({
      lineId: z.string(),
      label: z.string(),
    }).passthrough()),
  }),
  'budget:copy-from-previous': z.object({ count: z.number() }),

  // PDF batch
  'invoice:select-directory': z.object({ directory: z.string() }).nullable(),
  'invoice:save-pdf-batch': z.object({
    succeeded: z.number(),
    failed: z.array(z.object({ invoiceId: z.number(), error: z.string() })),
  }),
}
