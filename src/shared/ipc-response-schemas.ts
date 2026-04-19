/**
 * Per-kanal response-schemas för IPC (F59 follow-up, Sprint S).
 *
 * Kanoniserar svarsvalideringen:
 * - Flyttad från tests/setup/channel-response-schemas.ts till shared/ så
 *   både renderer-test-mock och (valfri) main-process-output-validering
 *   läser från samma källa.
 * - Full coverage via `satisfies Record<ChannelName, z.ZodType>` — nya
 *   kanaler i `channelMap` tvingar kompileringsfel om motsvarande
 *   entry saknas här. Ingen tyst fallback.
 * - Täta schemas bevaras för de ~30 kanaler som hade dem. Övriga
 *   kanaler får explicit `z.unknown()` med kommentar — dessa är
 *   TODO-kandidater för progressiv åtskärpning.
 *
 * Obs: schemat validerar `data`-fältet INUTI `IpcResult.data` (success-
 * grenen). Error-grenen och IpcResult-shape valideras separat i mock-ipc.
 */
import { z } from 'zod'
import type { ChannelName } from './ipc-schemas'

// ── Reusable sub-schemas ─────────────────────────────────────────────

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

const CounterpartySchema = z
  .object({ id: z.number(), name: z.string(), type: z.string() })
  .passthrough()

const ProductSchema = z
  .object({ id: z.number(), name: z.string() })
  .passthrough()

const VatCodeSchema = z
  .object({ id: z.number(), code: z.string() })
  .passthrough()

const InvoiceListItemSchema = z.object({
  id: z.number(),
  invoice_type: z.string(),
  invoice_number: z.string(),
  invoice_date: z.string(),
  due_date: z.string(),
  net_amount_ore: z.number(),
  vat_amount_ore: z.number(),
  total_amount_ore: z.number(),
  status: z.string(),
  payment_terms: z.number(),
  counterparty_name: z.string(),
  verification_number: z.number().nullable(),
  journal_entry_id: z.number().nullable(),
  credits_invoice_id: z.number().nullable(),
  has_credit_note: z.number().nullable(),
  total_paid: z.number(),
  remaining: z.number(),
})

const InvoiceStatusCountsSchema = z.object({
  total: z.number(),
  draft: z.number(),
  unpaid: z.number(),
  partial: z.number(),
  paid: z.number(),
  overdue: z.number(),
})

const ExpenseListItemSchema = z.object({
  id: z.number(),
  expense_type: z.string(),
  credits_expense_id: z.number().nullable(),
  has_credit_note: z.number().nullable(),
  expense_date: z.string(),
  due_date: z.string().nullable(),
  description: z.string(),
  supplier_invoice_number: z.string().nullable(),
  status: z.string(),
  total_amount_ore: z.number(),
  total_paid: z.number(),
  remaining: z.number(),
  counterparty_name: z.string(),
  verification_number: z.number().nullable(),
  verification_series: z.string().nullable(),
  journal_entry_id: z.number().nullable(),
})

const ExpenseStatusCountsSchema = z.object({
  draft: z.number(),
  unpaid: z.number(),
  paid: z.number(),
  overdue: z.number(),
  partial: z.number(),
  total: z.number(),
})

const DashboardSummarySchema = z.object({
  revenueOre: z.number(),
  expensesOre: z.number(),
  operatingResultOre: z.number(),
  vatOutgoingOre: z.number(),
  vatIncomingOre: z.number(),
  vatNetOre: z.number(),
  unpaidReceivablesOre: z.number(),
  unpaidPayablesOre: z.number(),
})

const BulkPaymentResultSchema = z.object({
  batch_id: z.number().nullable(),
  status: z.enum(['completed', 'partial', 'cancelled']),
  succeeded: z.array(
    z.object({
      id: z.number(),
      payment_id: z.number(),
      journal_entry_id: z.number(),
    }),
  ),
  failed: z.array(
    z.object({ id: z.number(), error: z.string(), code: z.string() }),
  ),
  bank_fee_journal_entry_id: z.number().nullable(),
})

// Placeholder för progressiv åtskärpning. Förtydligar att kanalen är
// registrerad men ännu inte har ett tätt schema.
const TODO = z.unknown()

// ── Channel → response data schema ────────────────────────────────────

export const channelResponseMap = {
  // Company
  'company:create': TODO,
  'company:get': TODO,
  'company:update': TODO,
  'company:list': TODO,
  'company:switch': TODO,

  // Fiscal Years
  'fiscal-year:list': z.array(FiscalYearSchema),
  'fiscal-year:create-new': z
    .object({ fiscalYear: FiscalYearSchema })
    .passthrough(),
  'fiscal-year:switch': FiscalYearSchema,

  // Fiscal Periods
  'fiscal-period:list': z.array(FiscalPeriodSchema),
  'fiscal-period:close': z.unknown(),
  'fiscal-period:reopen': z.unknown(),

  // Opening Balance
  'opening-balance:net-result': z.object({
    netResultOre: z.number(),
    isAlreadyBooked: z.boolean(),
  }),

  // Counterparties
  'counterparty:list': z.array(CounterpartySchema),
  'counterparty:get': CounterpartySchema.nullable(),
  'counterparty:create': TODO,
  'counterparty:update': TODO,
  'counterparty:deactivate': TODO,

  // Products
  'product:list': z.array(ProductSchema),
  'product:get': ProductSchema.nullable(),
  'product:create': TODO,
  'product:update': TODO,
  'product:deactivate': TODO,
  'product:set-customer-price': TODO,
  'product:remove-customer-price': TODO,
  'product:get-price-for-customer': TODO,

  // VAT & Accounts
  'vat-code:list': z.array(VatCodeSchema),
  'account:list': TODO,
  'account:list-all': TODO,
  'account:create': TODO,
  'account:update': TODO,
  'account:toggle-active': TODO,
  'account:get-statement': TODO,

  // Invoices
  'invoice:save-draft': TODO,
  'invoice:get-draft': TODO,
  'invoice:update-draft': TODO,
  'invoice:delete-draft': TODO,
  'invoice:list-drafts': TODO,
  'invoice:next-number': TODO,
  'invoice:list': z.object({
    items: z.array(InvoiceListItemSchema),
    counts: InvoiceStatusCountsSchema,
    total_items: z.number(),
  }),
  'invoice:finalize': TODO,
  'invoice:update-sent': TODO,
  'invoice:pay': TODO,
  'invoice:payBulk': BulkPaymentResultSchema,
  'invoice:payments': TODO,
  'invoice:generate-pdf': TODO,
  'invoice:save-pdf': TODO,
  'invoice:select-directory': z.object({ directory: z.string() }).nullable(),
  'invoice:save-pdf-batch': z.object({
    succeeded: z.number(),
    failed: z.array(z.object({ invoiceId: z.number(), error: z.string() })),
  }),
  'invoice:create-credit-note-draft': TODO,

  // Expenses
  'expense:save-draft': TODO,
  'expense:get-draft': TODO,
  'expense:update-draft': TODO,
  'expense:delete-draft': TODO,
  'expense:list-drafts': TODO,
  'expense:finalize': TODO,
  'expense:pay': TODO,
  'expense:payBulk': BulkPaymentResultSchema,
  'expense:payments': TODO,
  'expense:get': TODO,
  'expense:list': z.object({
    expenses: z.array(ExpenseListItemSchema),
    counts: ExpenseStatusCountsSchema,
    total_items: z.number(),
  }),
  'expense:create-credit-note-draft': TODO,

  // Manual Entries
  'manual-entry:save-draft': TODO,
  'manual-entry:get': TODO,
  'manual-entry:update-draft': TODO,
  'manual-entry:delete-draft': TODO,
  'manual-entry:list-drafts': TODO,
  'manual-entry:list': TODO,
  'manual-entry:finalize': TODO,

  // Journal Entry Corrections
  'journal-entry:correct': TODO,
  'journal-entry:can-correct': TODO,

  // Dashboard & Reports
  'dashboard:summary': DashboardSummarySchema,
  'vat:report': TODO,
  'tax:forecast': TODO,
  'report:income-statement': TODO,
  'report:balance-sheet': TODO,
  'report:cash-flow': TODO,

  // Exports
  'export:sie5': TODO,
  'export:sie4': TODO,
  'export:excel': TODO,
  'export:write-file': TODO,

  // Global Search
  'search:global': TODO,

  // Aging
  'aging:receivables': TODO,
  'aging:payables': TODO,

  // SIE4 Import
  'import:sie4-select-file': z.object({ filePath: z.string() }).nullable(),
  'import:sie4-validate': z.object({
    valid: z.boolean(),
    errors: z.array(
      z.object({ code: z.string(), message: z.string() }).passthrough(),
    ),
    warnings: z.array(
      z.object({ code: z.string(), message: z.string() }).passthrough(),
    ),
    summary: z.object({}).passthrough(),
  }),
  'import:sie4-execute': z.object({
    companyId: z.number(),
    fiscalYearId: z.number(),
    accountsAdded: z.number(),
    accountsUpdated: z.number(),
    entriesImported: z.number(),
    linesImported: z.number(),
    warnings: z.array(z.string()),
  }),

  // Payment batch export
  'payment-batch:validate-export': z
    .object({
      valid: z.boolean(),
      issues: z.array(
        z.object({
          counterpartyId: z.number(),
          counterpartyName: z.string(),
          issue: z.string(),
        }),
      ),
    })
    .passthrough(),
  'payment-batch:export-pain001': z
    .object({ saved: z.boolean() })
    .passthrough(),

  // Accruals
  'accrual:create': z.object({ id: z.number() }),
  'accrual:list': z.array(
    z.object({ id: z.number(), description: z.string() }).passthrough(),
  ),
  'accrual:execute': z.object({ journalEntryId: z.number() }),
  'accrual:execute-all': z.object({
    executed: z.number(),
    failed: z.array(z.object({ scheduleId: z.number(), error: z.string() })),
  }),
  'accrual:deactivate': z.undefined(),

  // Budget
  'budget:lines': z.array(
    z.object({
      lineId: z.string(),
      label: z.string(),
      groupId: z.string(),
      groupLabel: z.string(),
      signMultiplier: z.union([z.literal(1), z.literal(-1)]),
    }),
  ),
  'budget:get': z.array(
    z
      .object({
        id: z.number(),
        fiscal_year_id: z.number(),
        line_id: z.string(),
        period_number: z.number(),
        amount_ore: z.number(),
      })
      .passthrough(),
  ),
  'budget:save': z.object({ count: z.number() }),
  'budget:variance': z.object({
    lines: z.array(
      z.object({ lineId: z.string(), label: z.string() }).passthrough(),
    ),
  }),
  'budget:copy-from-previous': z.object({ count: z.number() }),

  // Depreciation
  'depreciation:create-asset': TODO,
  'depreciation:update-asset': TODO,
  'depreciation:list': TODO,
  'depreciation:get': TODO,
  'depreciation:dispose': TODO,
  'depreciation:delete': TODO,
  'depreciation:execute-period': TODO,

  // Bank statement / reconciliation
  'bank-statement:import': TODO,
  'bank-statement:list': TODO,
  'bank-statement:get': TODO,
  'bank-statement:match-transaction': TODO,
  'bank-statement:suggest-matches': TODO,
  'bank-statement:unmatch-transaction': TODO,
  'bank-statement:unmatch-batch': TODO,
  'bank-statement:create-fee-entry': TODO,
  'bank-tx-mapping:list': TODO,
  'bank-tx-mapping:upsert': TODO,
  'bank-tx-mapping:delete': TODO,
} as const satisfies Record<ChannelName, z.ZodType>

export type ChannelResponseMap = typeof channelResponseMap
