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
 *   kanaler använder passthrough-objekt (`AnyEntity`, `LooseObject`,
 *   `VoidOrReceipt` etc.) — ingen kanal använder `z.unknown()`.
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
  bankBalanceOre: z.number(),
})

const LatestVerificationSchema = z
  .object({
    series: z.string(),
    number: z.number().int().nonnegative(),
    entry_date: z.string(),
  })
  .nullable()

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

// ── Reusable return-shape schemas (Sprint U) ─────────────────────────
//
// Services returnerar genomgående något av dessa mönster: (a) en entitet
// med id + godtyckliga extra fält, (b) ett mutations-kvitto `{ ok: true }`,
// (c) undefined för "fire-and-forget"-ops, (d) en array av entiteter.
// Genom att definiera mönstren en gång + `.passthrough()` tolereras
// service-evolution utan att schemat måste uppdateras per ny kolumn.

const EntityId = z.object({ id: z.number() }).passthrough()
/** Godtycklig object-entitet med numeriskt id — för listor/detaljer. */
const AnyEntity = z.object({ id: z.number() }).passthrough()
/** Nullable entity — `get`-kanaler som kan returnera null. */
const AnyEntityOrNull = AnyEntity.nullable()
/** Array av entiteter. */
const AnyEntityList = z.array(AnyEntity)
/** Generisk object-passthrough. Stramare än z.unknown() (avvisar icke-objekt)
 * men tillåter service-evolution utan schema-uppdatering. Används för
 * mutations-returvärden som inte följer `{ id }`-mönstret (t.ex.
 * `{ scheduleCount }`, `{ preview }`). */
const LooseObject = z.object({}).passthrough()
/** Vid ren mutation utan meningsfullt returvärde — service returnerar ofta
 * undefined eller ett litet kvitto-objekt. */
const VoidOrReceipt = z.union([z.undefined(), LooseObject])
/** Account-radens form (list / list-all). Loose: tester mockar med
 * {id}-shapes och produktionen returnerar account_number+name. Passthrough
 * tolererar båda. */
const AccountList = z.array(z.object({}).passthrough())
/** Finalize-kvitto (invoice/expense/manual-entry): journal_entry kopplas på. */
const FinalizeReceipt = z
  .object({
    id: z.number(),
    journal_entry_id: z.number(),
    verification_number: z.number().nullable(),
  })
  .passthrough()
/** Payment-kvitto för single-rad-betalningar. */
const PaymentReceipt = z
  .object({ payment_id: z.number(), journal_entry_id: z.number() })
  .passthrough()
/** Payment-lista (invoice:payments / expense:payments). */
const PaymentList = z.array(
  z.object({ id: z.number(), amount_ore: z.number() }).passthrough(),
)
/** PDF-generering: handler returnerar `{ data: string }` (base64). */
const PdfResult = z.object({ data: z.string() }).passthrough()
/** SIE4/SIE5/Excel-export — sparad fil eller buffer. */
const ExportResult = z
  .object({})
  .passthrough()
  .refine(
    (v: Record<string, unknown>) =>
      typeof v.filePath === 'string' ||
      typeof v.content === 'string' ||
      typeof v.saved === 'boolean' ||
      typeof v.cancelled === 'boolean',
    { message: 'Export-svar saknar filePath/content/saved/cancelled' },
  )
/** Aging-rapporter: struct med buckets + totalt belopp. */
const AgingReport = z
  .object({
    buckets: z.array(z.object({}).passthrough()),
    totalRemainingOre: z.number(),
    asOfDate: z.string(),
  })
  .passthrough()
/** Income statement / Balance sheet / Cash flow — alla returnerar groups+totals. */
const ReportPayload = z.object({}).passthrough()
/** Search-resultat: `{ results: SearchResult[], total_count: number }`. */
const SearchResult = z
  .object({
    results: z.array(z.object({}).passthrough()),
    total_count: z.number(),
  })
  .passthrough()
/** Next-number (invoice): service returnerar `{ preview: number }`. */
const NextNumber = z.object({ preview: z.number() }).passthrough()
/** Journal-entry can-correct: `{ canCorrect, reason? }`. */
const CanCorrect = z.object({ canCorrect: z.boolean() }).passthrough()
/** VAT-rapport: struct med boxar + perioder. */
const VatReport = z.object({}).passthrough()
/** Tax forecast: struct med totals. */
const TaxForecast = z.object({}).passthrough()
/** Bank-statement import: summary av rader + matches. */
const BankImportResult = z.object({ statementId: z.number() }).passthrough()
/** Bank-tx suggest: array av match-förslag. */
const BankSuggestions = z.array(z.object({}).passthrough())

// ── Channel → response data schema ────────────────────────────────────

export const channelResponseMap = {
  // Company
  'company:create': EntityId,
  'company:get': AnyEntityOrNull,
  'company:update': VoidOrReceipt,
  'company:list': AnyEntityList,
  'company:switch': LooseObject.nullable(),

  // Fiscal Years
  'fiscal-year:list': z.array(FiscalYearSchema),
  'fiscal-year:create-new': z
    .object({ fiscalYear: FiscalYearSchema })
    .passthrough(),
  'fiscal-year:switch': FiscalYearSchema,

  // Fiscal Periods
  'fiscal-period:list': z.array(FiscalPeriodSchema),
  'fiscal-period:close': VoidOrReceipt,
  'fiscal-period:reopen': VoidOrReceipt,

  // Opening Balance
  'opening-balance:net-result': z.object({
    netResultOre: z.number(),
    isAlreadyBooked: z.boolean(),
  }),

  // Counterparties
  'counterparty:list': z.array(CounterpartySchema),
  'counterparty:get': CounterpartySchema.nullable(),
  'counterparty:create': EntityId,
  'counterparty:update': VoidOrReceipt,
  'counterparty:deactivate': VoidOrReceipt,
  'counterparty:set-default-account': VoidOrReceipt,

  // Products
  'product:list': z.array(ProductSchema),
  'product:get': ProductSchema.nullable(),
  'product:create': EntityId,
  'product:update': VoidOrReceipt,
  'product:deactivate': VoidOrReceipt,
  'product:set-customer-price': VoidOrReceipt,
  'product:remove-customer-price': VoidOrReceipt,
  'product:get-price-for-customer': z
    .object({ price_ore: z.number(), source: z.string() })
    .passthrough(),

  // VAT & Accounts
  'vat-code:list': z.array(VatCodeSchema),
  'account:list': AccountList,
  'account:list-all': AccountList,
  'account:create': z.object({ account_number: z.string() }).passthrough(),
  'account:update': VoidOrReceipt,
  'account:toggle-active': VoidOrReceipt,
  'account:get-statement': z
    .object({ lines: z.array(z.object({}).passthrough()) })
    .passthrough(),

  // Invoices
  'invoice:save-draft': EntityId,
  'invoice:get-draft': AnyEntityOrNull,
  'invoice:update-draft': VoidOrReceipt,
  'invoice:delete-draft': VoidOrReceipt,
  'invoice:list-drafts': AnyEntityList,
  'invoice:next-number': NextNumber,
  'invoice:list': z.object({
    items: z.array(InvoiceListItemSchema),
    counts: InvoiceStatusCountsSchema,
    total_items: z.number(),
  }),
  'invoice:finalize': FinalizeReceipt,
  'invoice:update-sent': VoidOrReceipt,
  'invoice:pay': PaymentReceipt,
  'invoice:payBulk': BulkPaymentResultSchema,
  'invoice:payments': PaymentList,
  'invoice:generate-pdf': PdfResult,
  'invoice:save-pdf': ExportResult,
  'invoice:select-directory': z.object({ directory: z.string() }).nullable(),
  'invoice:save-pdf-batch': z.object({
    succeeded: z.number(),
    failed: z.array(z.object({ invoiceId: z.number(), error: z.string() })),
  }),
  'invoice:create-credit-note-draft': EntityId,

  // Expenses
  'expense:save-draft': EntityId,
  'expense:get-draft': AnyEntityOrNull,
  'expense:update-draft': VoidOrReceipt,
  'expense:delete-draft': VoidOrReceipt,
  'expense:list-drafts': AnyEntityList,
  'expense:finalize': FinalizeReceipt,
  'expense:attach-receipt': z
    .object({ receipt_path: z.string() })
    .passthrough(),
  'expense:select-receipt-file': z.object({ filePath: z.string() }).nullable(),
  'expense:pay': PaymentReceipt,
  'expense:payBulk': BulkPaymentResultSchema,
  'expense:payments': PaymentList,
  'expense:get': AnyEntityOrNull,
  'expense:list': z.object({
    expenses: z.array(ExpenseListItemSchema),
    counts: ExpenseStatusCountsSchema,
    total_items: z.number(),
  }),
  'expense:create-credit-note-draft': EntityId,

  // Manual Entries
  'manual-entry:save-draft': EntityId,
  'manual-entry:get': AnyEntityOrNull,
  'manual-entry:update-draft': VoidOrReceipt,
  'manual-entry:delete-draft': VoidOrReceipt,
  'manual-entry:list-drafts': AnyEntityList,
  'manual-entry:list': AnyEntityList,
  'manual-entry:finalize': FinalizeReceipt,

  // Journal Entry Corrections
  'journal-entry:correct': FinalizeReceipt,
  'journal-entry:can-correct': CanCorrect,
  'journal-entry:list-imported': z.array(
    z
      .object({
        journal_entry_id: z.number(),
        verification_number: z.number(),
        verification_series: z.string(),
        journal_date: z.string(),
        description: z.string().nullable(),
        source_reference: z.string().nullable(),
        total_amount_ore: z.number(),
      })
      .passthrough(),
  ),

  // Dashboard & Reports
  'dashboard:summary': DashboardSummarySchema,
  'journal:latest-verification': LatestVerificationSchema,
  'vat:report': VatReport,
  'tax:forecast': TaxForecast,
  'report:income-statement': ReportPayload,
  'report:balance-sheet': ReportPayload,
  'report:cash-flow': ReportPayload,

  // Exports
  'export:sie5': ExportResult,
  'export:sie4': ExportResult,
  'export:excel': ExportResult,
  'export:write-file': ExportResult,

  // Global Search
  'search:global': SearchResult,

  // Aging
  'aging:receivables': AgingReport,
  'aging:payables': AgingReport,

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

  // SIE5 Import (Sprint U2)
  'import:sie5-select-file': z.object({ filePath: z.string() }).nullable(),
  'import:sie5-validate': z.object({
    valid: z.boolean(),
    errors: z.array(
      z.object({ code: z.string(), message: z.string() }).passthrough(),
    ),
    warnings: z.array(
      z.object({ code: z.string(), message: z.string() }).passthrough(),
    ),
    summary: z.object({}).passthrough(),
  }),
  'import:sie5-execute': z.object({
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

  // SEPA DD (Sprint U1)
  'sepa-dd:create-mandate': z
    .object({ id: z.number(), mandate_reference: z.string() })
    .passthrough(),
  'sepa-dd:list-mandates': z.array(
    z.object({ id: z.number(), mandate_reference: z.string() }).passthrough(),
  ),
  'sepa-dd:revoke-mandate': z.object({ id: z.number() }),
  'sepa-dd:create-collection': z
    .object({ id: z.number(), amount_ore: z.number() })
    .passthrough(),
  'sepa-dd:create-batch': z.object({
    batch_id: z.number(),
    collection_count: z.number(),
  }),
  'sepa-dd:export-pain008': z.object({ saved: z.boolean() }).passthrough(),
  'sepa-dd:list-collections': z.array(
    z.object({ id: z.number(), amount_ore: z.number() }).passthrough(),
  ),
  'sepa-dd:list-batches': z.array(
    z.object({ id: z.number(), collection_count: z.number() }).passthrough(),
  ),

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
  'depreciation:create-asset': EntityId,
  'depreciation:update-asset': z
    .object({ scheduleCount: z.number() })
    .passthrough(),
  'depreciation:list': AnyEntityList,
  'depreciation:get': AnyEntityOrNull,
  'depreciation:dispose': z.union([z.null(), LooseObject, z.undefined()]),
  'depreciation:delete': z.union([z.null(), LooseObject, z.undefined()]),
  'depreciation:execute-period': z
    .object({
      executedScheduleCount: z.number(),
      totalDepreciationOre: z.number(),
    })
    .passthrough(),

  // Bank statement / reconciliation
  'bank-statement:import': BankImportResult,
  'bank-statement:list': AnyEntityList,
  'bank-statement:get': AnyEntityOrNull,
  'bank-statement:match-transaction': z
    .object({ match_id: z.number() })
    .passthrough(),
  'bank-statement:suggest-matches': BankSuggestions,
  'bank-statement:unmatch-transaction': VoidOrReceipt,
  'bank-statement:unmatch-batch': VoidOrReceipt,
  'bank-statement:create-fee-entry': z
    .object({ journal_entry_id: z.number() })
    .passthrough(),
  'bank-tx-mapping:list': AnyEntityList,
  'bank-tx-mapping:upsert': EntityId,
  'bank-tx-mapping:delete': VoidOrReceipt,
  // Sprint 16 — Live verifikat-preview (ADR 006). Lös passthrough-spec
  // räcker här eftersom data konsumeras typat via electron.d.ts.
  'preview:journal-lines': LooseObject,
  // Sprint VS-107 — Inkorgen receipts. Loose passthrough: list returnerar
  // array, single returnerar entity, counts returnerar `{inbox,booked,archived}`,
  // bulk-archive returnerar `{succeeded,failed}`, delete returnerar `{deleted}`.
  'receipt:list': AnyEntityList,
  'receipt:create': AnyEntity,
  'receipt:update-notes': AnyEntity,
  'receipt:archive': AnyEntity,
  'receipt:archive-bulk': LooseObject,
  'receipt:counts': LooseObject,
  'receipt:delete': LooseObject,
  'receipt:link-to-expense': LooseObject,
} as const satisfies Record<ChannelName, z.ZodType>

export type ChannelResponseMap = typeof channelResponseMap
