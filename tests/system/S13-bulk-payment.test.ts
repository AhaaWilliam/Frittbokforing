/**
 * Sprint 13 — Bulk Payments (S41–S44)
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest'
import * as iconv from 'iconv-lite'
import {
  type SystemTestContext,
  createTemplateDb,
  destroyTemplateDb,
  createSystemTestContext,
  destroyContext,
  seedAndFinalizeInvoice,
  seedAndFinalizeExpense,
} from './helpers/system-test-context'
import {
  payInvoice,
  payInvoicesBulk,
} from '../../src/main/services/invoice-service'
import {
  payExpense,
  payExpensesBulk,
} from '../../src/main/services/expense-service'
import {
  PayInvoicesBulkPayloadSchema,
  PayExpensesBulkPayloadSchema,
  BulkPaymentResultSchema,
} from '../../src/shared/ipc-schemas'
import {
  assertJournalEntryBalanced,
  assertContiguousVerNumbers,
} from './helpers/assertions'

let ctx: SystemTestContext

beforeAll(() => createTemplateDb())
afterAll(() => destroyTemplateDb())
beforeEach(() => {
  ctx = createSystemTestContext()
})
afterEach(() => destroyContext(ctx))

// ── Helpers ─────────────────────────────────────────────────────

function getJournalLines(journalEntryId: number) {
  return ctx.db
    .prepare(
      `SELECT account_number, debit_ore, credit_ore
       FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number`,
    )
    .all(journalEntryId) as {
    account_number: string
    debit_ore: number
    credit_ore: number
  }[]
}

function getJournalEntry(id: number) {
  return ctx.db
    .prepare('SELECT * FROM journal_entries WHERE id = ?')
    .get(id) as {
    id: number
    verification_number: number
    verification_series: string
    source_type: string
    source_reference: string | null
    status: string
  }
}

function getBatch(id: number) {
  return ctx.db
    .prepare('SELECT * FROM payment_batches WHERE id = ?')
    .get(id) as {
    id: number
    batch_type: string
    status: string
    bank_fee_ore: number
    bank_fee_journal_entry_id: number | null
  }
}

/** Seed invoice with specific unit_price_ore (no VAT for easy amounts: use MF code id=4) */
function seedInvoiceNoVat(ctx: SystemTestContext, unitPriceOre: number) {
  return seedAndFinalizeInvoice(ctx, {
    lines: [
      {
        product_id: null,
        description: 'Test',
        quantity: 1,
        unit_price_ore: unitPriceOre,
        vat_code_id: 4, // MF (momsfri) → 0% VAT
        account_number: '3002',
      },
    ],
  })
}

function seedExpenseNoVat(
  ctx: SystemTestContext,
  unitPriceOre: number,
  overrides?: { expenseDate?: string },
) {
  // incoming VAT code IP1=id 5 (25%), use exempt → not available for incoming.
  // Use IP1 (id=5) with 25% for now and compute total accordingly, or use 0% incoming.
  // Actually vat_code_id=4 is 'MF' which is exempt outgoing — for expenses we need incoming.
  // Let's just use IP1 (25%) and compute the total.
  return seedAndFinalizeExpense(ctx, {
    expenseDate: overrides?.expenseDate,
    lines: [
      {
        description: 'Test',
        account_number: '6110',
        quantity: 1,
        unit_price_ore: unitPriceOre,
        vat_code_id: 5, // IP1 25% incoming
      },
    ],
  })
}

function getExpenseTotal(expenseId: number): number {
  return (
    ctx.db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(expenseId) as { total_amount_ore: number }
  ).total_amount_ore
}

// ── Migration 021 ───────────────────────────────────────────────

describe('Migration 021: payment_batches + auto_bank_fee', () => {
  it('payment_batches table exists with correct columns', () => {
    const table = ctx.db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='payment_batches'",
      )
      .get() as { sql: string }
    expect(table).toBeDefined()
    expect(table.sql).toContain('batch_type')
    expect(table.sql).toContain('bank_fee_ore')
  })

  it('auto_bank_fee in journal_entries CHECK', () => {
    const table = ctx.db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='journal_entries'",
      )
      .get() as { sql: string }
    expect(table.sql).toContain('auto_bank_fee')
  })

  it('7 triggers exist', () => {
    const triggers = ctx.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name IN ('journal_entries', 'journal_entry_lines')",
      )
      .all() as { name: string }[]
    const names = triggers.map((t) => t.name)
    for (const expected of [
      'trg_immutable_booked_entry_update',
      'trg_immutable_booked_entry_delete',
      'trg_immutable_booked_line_update',
      'trg_immutable_booked_line_delete',
      'trg_immutable_booked_line_insert',
      'trg_check_balance_on_booking',
      'trg_check_period_on_booking',
    ]) {
      expect(names).toContain(expected)
    }
  })

  it('opening_balance exception preserved (SQL match)', () => {
    const trigger = ctx.db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='trg_immutable_booked_entry_update'",
      )
      .get() as { sql: string }
    expect(trigger.sql).toContain('opening_balance')
  })

  it('A2-semantic: opening_balance INSERT with status=booked succeeds', () => {
    // Semantic test: actually INSERT an opening_balance entry and UPDATE it
    const companyId = ctx.seed.companyId
    const fyId = ctx.seed.fiscalYearId
    ctx.db
      .prepare(
        `INSERT INTO journal_entries (company_id, fiscal_year_id, verification_number, verification_series,
        journal_date, description, status, source_type)
       VALUES (?, ?, 999, 'O', '2026-01-01', 'IB test', 'booked', 'opening_balance')`,
      )
      .run(companyId, fyId)

    const je = ctx.db
      .prepare(
        "SELECT id FROM journal_entries WHERE source_type = 'opening_balance' AND description = 'IB test'",
      )
      .get() as { id: number }

    // UPDATE description should succeed because opening_balance is excepted from trigger
    expect(() => {
      ctx.db
        .prepare(
          "UPDATE journal_entries SET description = 'IB uppdaterad' WHERE id = ?",
        )
        .run(je.id)
    }).not.toThrow()
  })

  it('A3: 3 indexes exist after migration 021', () => {
    const indexes = ctx.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_pb_fiscal_year', 'idx_ip_batch', 'idx_ep_batch')",
      )
      .all() as { name: string }[]
    const names = indexes.map((i) => i.name).sort()
    expect(names).toEqual([
      'idx_ep_batch',
      'idx_ip_batch',
      'idx_pb_fiscal_year',
    ])
  })

  it('A4: payment_batches CHECK constraints reject invalid values', () => {
    const fyId = ctx.seed.fiscalYearId
    // Invalid batch_type
    expect(() => {
      ctx.db
        .prepare(
          `INSERT INTO payment_batches (fiscal_year_id, batch_type, payment_date, account_number, bank_fee_ore, status)
         VALUES (?, 'invalid', '2026-03-15', '1930', 0, 'completed')`,
        )
        .run(fyId)
    }).toThrow()

    // Invalid status
    expect(() => {
      ctx.db
        .prepare(
          `INSERT INTO payment_batches (fiscal_year_id, batch_type, payment_date, account_number, bank_fee_ore, status)
         VALUES (?, 'invoice', '2026-03-15', '1930', 0, 'invalid')`,
        )
        .run(fyId)
    }).toThrow()
  })

  it('payment_batch_id on both payment tables', () => {
    const ipCols = (
      ctx.db.pragma('table_info(invoice_payments)') as { name: string }[]
    ).map((c) => c.name)
    const epCols = (
      ctx.db.pragma('table_info(expense_payments)') as { name: string }[]
    ).map((c) => c.name)
    expect(ipCols).toContain('payment_batch_id')
    expect(epCols).toContain('payment_batch_id')
  })

  it('idempotent: second run does not throw', async () => {
    const mod = await import('../../src/main/migrations')
    // Migration 021 is at 0-based index 20
    const m021 = mod.migrations[20]
    expect(() => m021.programmatic!(ctx.db)).not.toThrow()
  })
})

// ── Invoice Bulk ────────────────────────────────────────────────

describe('payInvoicesBulk — happy path', () => {
  it('3 invoices + bank fee → completed batch', () => {
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const i2 = seedInvoiceNoVat(ctx, 200_00)
    const i3 = seedInvoiceNoVat(ctx, 300_00)

    const result = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 },
        { invoice_id: i2.invoiceId, amount_ore: 200_00 },
        { invoice_id: i3.invoiceId, amount_ore: 300_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 50_00,
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    const d = result.data
    expect(d.status).toBe('completed')
    expect(d.succeeded).toHaveLength(3)
    expect(d.failed).toHaveLength(0)
    expect(d.batch_id).toBeGreaterThan(0)
    expect(d.bank_fee_journal_entry_id).toBeGreaterThan(0)

    // Batch in DB
    const batch = getBatch(d.batch_id!)
    expect(batch.batch_type).toBe('invoice')
    expect(batch.status).toBe('completed')
    expect(batch.bank_fee_journal_entry_id).toBe(d.bank_fee_journal_entry_id)

    // Bank fee entry
    const bfe = getJournalEntry(d.bank_fee_journal_entry_id!)
    expect(bfe.source_type).toBe('auto_bank_fee')
    expect(bfe.source_reference).toBe(`batch:${d.batch_id}`)
    expect(bfe.verification_series).toBe('A')
    expect(bfe.status).toBe('booked')

    const lines = getJournalLines(d.bank_fee_journal_entry_id!)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({
      account_number: '6570',
      debit_ore: 50_00,
      credit_ore: 0,
    })
    expect(lines[1]).toEqual({
      account_number: '1930',
      debit_ore: 0,
      credit_ore: 50_00,
    })

    // All payments linked
    const linked = ctx.db
      .prepare(
        'SELECT COUNT(*) as c FROM invoice_payments WHERE payment_batch_id = ?',
      )
      .get(d.batch_id!) as { c: number }
    expect(linked.c).toBe(3)

    // All invoices paid
    for (const inv of [i1, i2, i3]) {
      const s = ctx.db
        .prepare('SELECT status FROM invoices WHERE id = ?')
        .get(inv.invoiceId) as { status: string }
      expect(s.status).toBe('paid')
    }
  })
})

describe('payInvoicesBulk — partial', () => {
  it('1 already-paid → 2 succeed, 1 fail, partial + bank fee', () => {
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const i2 = seedInvoiceNoVat(ctx, 200_00)
    const i3 = seedInvoiceNoVat(ctx, 300_00)

    // Pay i2 first → it becomes non-payable
    ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: i2.invoiceId,
      amount_ore: 200_00,
      payment_date: '2026-03-15',
      payment_method: 'bankgiro',
      account_number: '1930',
    })

    const result = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 },
        { invoice_id: i2.invoiceId, amount_ore: 200_00 },
        { invoice_id: i3.invoiceId, amount_ore: 300_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 20_00,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('partial')
    expect(result.data.succeeded).toHaveLength(2)
    expect(result.data.failed).toHaveLength(1)
    expect(result.data.failed[0].id).toBe(i2.invoiceId)
    expect(result.data.bank_fee_journal_entry_id).toBeGreaterThan(0)
  })
})

describe('payInvoicesBulk — all fail', () => {
  it('cancelled, no batch, no bank fee', () => {
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const i2 = seedInvoiceNoVat(ctx, 200_00)

    // Pay both → non-payable
    ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: i1.invoiceId,
      amount_ore: 100_00,
      payment_date: '2026-03-15',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: i2.invoiceId,
      amount_ore: 200_00,
      payment_date: '2026-03-15',
      payment_method: 'bankgiro',
      account_number: '1930',
    })

    const result = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 },
        { invoice_id: i2.invoiceId, amount_ore: 200_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 10_00,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('cancelled')
    expect(result.data.batch_id).toBeNull()
    expect(result.data.bank_fee_journal_entry_id).toBeNull()
  })
})

describe('payInvoicesBulk — singular', () => {
  it('1 invoice → batch + payment_batch_id', () => {
    const inv = seedInvoiceNoVat(ctx, 500_00)
    const result = payInvoicesBulk(ctx.db, {
      payments: [{ invoice_id: inv.invoiceId, amount_ore: 500_00 }],
      payment_date: '2026-03-15',
      account_number: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.batch_id).toBeGreaterThan(0)
    const p = ctx.db
      .prepare(
        'SELECT payment_batch_id FROM invoice_payments WHERE invoice_id = ?',
      )
      .get(inv.invoiceId) as { payment_batch_id: number }
    expect(p.payment_batch_id).toBe(result.data.batch_id)
  })
})

describe('payInvoicesBulk — validation', () => {
  it('bank_fee >= sum → VALIDATION_ERROR', () => {
    const inv = seedInvoiceNoVat(ctx, 100_00)
    const r = payInvoicesBulk(ctx.db, {
      payments: [{ invoice_id: inv.invoiceId, amount_ore: 100_00 }],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 100_00,
    })
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('VALIDATION_ERROR')
  })

  it('duplicate invoice_ids → VALIDATION_ERROR', () => {
    const inv = seedInvoiceNoVat(ctx, 100_00)
    const r = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: inv.invoiceId, amount_ore: 50_00 },
        { invoice_id: inv.invoiceId, amount_ore: 50_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
    })
    expect(r.success).toBe(false)
  })

  it('future payment_date → VALIDATION_ERROR', () => {
    const inv = seedInvoiceNoVat(ctx, 100_00)
    const r = payInvoicesBulk(ctx.db, {
      payments: [{ invoice_id: inv.invoiceId, amount_ore: 100_00 }],
      payment_date: '2099-01-01',
      account_number: '1930',
    })
    expect(r.success).toBe(false)
  })
})

describe('payInvoicesBulk — verification contiguity', () => {
  // Förutsätter MAX+1-allokering (se Fas 0.a)
  it('contiguous after failed savepoint', () => {
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const i2 = seedInvoiceNoVat(ctx, 200_00)
    // Pay i2 to make it fail
    ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: i2.invoiceId,
      amount_ore: 200_00,
      payment_date: '2026-03-15',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    const i3 = seedInvoiceNoVat(ctx, 300_00)

    const result = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 },
        { invoice_id: i2.invoiceId, amount_ore: 200_00 },
        { invoice_id: i3.invoiceId, amount_ore: 300_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const verNums = result.data.succeeded.map(
      (s) => getJournalEntry(s.journal_entry_id).verification_number,
    )
    expect(verNums).toHaveLength(2)
    expect(verNums[1] - verNums[0]).toBe(1)
  })
})

// ── Expense Bulk ────────────────────────────────────────────────

describe('payExpensesBulk — happy path', () => {
  it('3 expenses + bank fee → B-series, completed', () => {
    const e1 = seedExpenseNoVat(ctx, 100_00)
    const e2 = seedExpenseNoVat(ctx, 200_00)
    const e3 = seedExpenseNoVat(ctx, 300_00)

    const t1 = getExpenseTotal(e1.expenseId)
    const t2 = getExpenseTotal(e2.expenseId)
    const t3 = getExpenseTotal(e3.expenseId)

    const result = payExpensesBulk(ctx.db, {
      payments: [
        { expense_id: e1.expenseId, amount_ore: t1 },
        { expense_id: e2.expenseId, amount_ore: t2 },
        { expense_id: e3.expenseId, amount_ore: t3 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 25_00,
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.status).toBe('completed')
    expect(result.data.succeeded).toHaveLength(3)

    const bfe = getJournalEntry(result.data.bank_fee_journal_entry_id!)
    expect(bfe.verification_series).toBe('B')
    expect(bfe.source_type).toBe('auto_bank_fee')

    for (const exp of [e1, e2, e3]) {
      const s = ctx.db
        .prepare('SELECT status FROM expenses WHERE id = ?')
        .get(exp.expenseId) as { status: string }
      expect(s.status).toBe('paid')
    }
  })
})

describe('payExpensesBulk — chronology', () => {
  it('backdated batch → VALIDATION_ERROR at bulk level', () => {
    // Seed both expenses FIRST (finalization creates B-series entries at March 15)
    const e1 = seedExpenseNoVat(ctx, 100_00)
    const e2 = seedExpenseNoVat(ctx, 200_00)
    const t1 = getExpenseTotal(e1.expenseId)
    const t2 = getExpenseTotal(e2.expenseId)

    // Pay e1 at April 10 — this creates a B-series payment entry AFTER all finalization entries
    const payResult = ctx.expenseService.payExpense(ctx.db, {
      expense_id: e1.expenseId,
      amount_ore: t1,
      payment_date: '2026-04-10',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(payResult.success).toBe(true)

    // Verify last B-series entry is at 2026-04-10
    const lastB = ctx.db
      .prepare(
        `SELECT journal_date FROM journal_entries
       WHERE fiscal_year_id = ? AND verification_series = 'B'
       ORDER BY verification_number DESC LIMIT 1`,
      )
      .get(ctx.seed.fiscalYearId) as { journal_date: string }
    expect(lastB.journal_date).toBe('2026-04-10')

    // Bulk-pay e2 at March 15, which is before the April 10 B-series entry
    const result = payExpensesBulk(ctx.db, {
      payments: [{ expense_id: e2.expenseId, amount_ore: t2 }],
      payment_date: '2026-03-15',
      account_number: '1930',
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('payment_date < expense_date → per-row fail, batch partial', () => {
    // Both expenses at same date (chronology OK), then push one's date forward via DB update
    const normalExp = seedExpenseNoVat(ctx, 200_00) // March 15
    const lateExp = seedExpenseNoVat(ctx, 100_00) // March 15

    // Push lateExp's expense_date to April 10 AFTER finalize (bypass chronology for test setup)
    ctx.db
      .prepare('UPDATE expenses SET expense_date = ? WHERE id = ?')
      .run('2026-04-10', lateExp.expenseId)

    const t1 = getExpenseTotal(lateExp.expenseId)
    const t2 = getExpenseTotal(normalExp.expenseId)

    // Bulk-pay at March 15 → lateExp fails (payment_date < expense_date)
    const result = payExpensesBulk(ctx.db, {
      payments: [
        { expense_id: lateExp.expenseId, amount_ore: t1 },
        { expense_id: normalExp.expenseId, amount_ore: t2 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('partial')
    expect(result.data.failed).toHaveLength(1)
    expect(result.data.failed[0].id).toBe(lateExp.expenseId)
    expect(result.data.failed[0].code).toBe('PAYMENT_BEFORE_EXPENSE')
  })
})

// ── Zod Schemas ─────────────────────────────────────────────────

describe('Zod bulk payment schemas', () => {
  it('PayInvoicesBulkPayloadSchema accepts valid', () => {
    expect(
      PayInvoicesBulkPayloadSchema.safeParse({
        payments: [{ invoice_id: 1, amount_ore: 100 }],
        payment_date: '2026-03-15',
        account_number: '1930',
      }).success,
    ).toBe(true)
  })

  it('PayInvoicesBulkPayloadSchema rejects extra fields', () => {
    expect(
      PayInvoicesBulkPayloadSchema.safeParse({
        payments: [{ invoice_id: 1, amount_ore: 100, extra: true }],
        payment_date: '2026-03-15',
        account_number: '1930',
      }).success,
    ).toBe(false)
  })

  it('PayExpensesBulkPayloadSchema accepts valid', () => {
    expect(
      PayExpensesBulkPayloadSchema.safeParse({
        payments: [{ expense_id: 1, amount_ore: 100 }],
        payment_date: '2026-03-15',
        account_number: '1930',
      }).success,
    ).toBe(true)
  })

  it('BulkPaymentResultSchema validates completed', () => {
    expect(
      BulkPaymentResultSchema.safeParse({
        batch_id: 1,
        status: 'completed',
        succeeded: [{ id: 1, payment_id: 1, journal_entry_id: 1 }],
        failed: [],
        bank_fee_journal_entry_id: 2,
      }).success,
    ).toBe(true)
  })

  it('BulkPaymentResultSchema validates cancelled with nulls', () => {
    expect(
      BulkPaymentResultSchema.safeParse({
        batch_id: null,
        status: 'cancelled',
        succeeded: [],
        failed: [{ id: 1, error: 'x', code: 'E' }],
        bank_fee_journal_entry_id: null,
      }).success,
    ).toBe(true)
  })

  it('PayInvoicesBulkPayloadSchema rejects empty payments', () => {
    expect(
      PayInvoicesBulkPayloadSchema.safeParse({
        payments: [],
        payment_date: '2026-03-15',
        account_number: '1930',
      }).success,
    ).toBe(false)
  })

  it('PayInvoicesBulkPayloadSchema rejects per-row bank_fee_ore', () => {
    const result = PayInvoicesBulkPayloadSchema.safeParse({
      payments: [{ invoice_id: 1, amount_ore: 100, bank_fee_ore: 10 }],
      payment_date: '2026-03-15',
      account_number: '1930',
    })
    expect(result.success).toBe(false)
  })

  it('PayExpensesBulkPayloadSchema rejects extra fields', () => {
    expect(
      PayExpensesBulkPayloadSchema.safeParse({
        payments: [{ expense_id: 1, amount_ore: 100, extra: true }],
        payment_date: '2026-03-15',
        account_number: '1930',
      }).success,
    ).toBe(false)
  })

  it('PayExpensesBulkPayloadSchema rejects empty payments', () => {
    expect(
      PayExpensesBulkPayloadSchema.safeParse({
        payments: [],
        payment_date: '2026-03-15',
        account_number: '1930',
      }).success,
    ).toBe(false)
  })

  it('PayExpensesBulkPayloadSchema rejects per-row bank_fee_ore', () => {
    const result = PayExpensesBulkPayloadSchema.safeParse({
      payments: [{ expense_id: 1, amount_ore: 100, bank_fee_ore: 10 }],
      payment_date: '2026-03-15',
      account_number: '1930',
    })
    expect(result.success).toBe(false)
  })

  it('PayInvoicesBulkPayloadSchema accepts user_note', () => {
    expect(
      PayInvoicesBulkPayloadSchema.safeParse({
        payments: [{ invoice_id: 1, amount_ore: 100 }],
        payment_date: '2026-03-15',
        account_number: '1930',
        user_note: 'Testanteckning',
      }).success,
    ).toBe(true)
  })

  it('PayInvoicesBulkPayloadSchema missing required field', () => {
    expect(
      PayInvoicesBulkPayloadSchema.safeParse({
        payments: [{ invoice_id: 1, amount_ore: 100 }],
        account_number: '1930',
      }).success,
    ).toBe(false)
  })

  it('PayExpensesBulkPayloadSchema missing required field', () => {
    expect(
      PayExpensesBulkPayloadSchema.safeParse({
        payments: [{ expense_id: 1, amount_ore: 100 }],
        account_number: '1930',
      }).success,
    ).toBe(false)
  })
})

// ── B5: Cross-FY invoice bulk ──────────────────────────────────

describe('payInvoicesBulk — cross fiscal year', () => {
  it('B5: FY2025 invoice paid in FY2026 → payment JE in FY2026 A-series', () => {
    // Create a second FY for 2025
    const companyId = ctx.seed.companyId
    ctx.db
      .prepare(
        `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
       VALUES (?, '2025', '2025-01-01', '2025-12-31')`,
      )
      .run(companyId)
    const fy2025 = ctx.db
      .prepare("SELECT id FROM fiscal_years WHERE year_label = '2025'")
      .get() as { id: number }

    for (let m = 1; m <= 12; m++) {
      const start = `2025-${String(m).padStart(2, '0')}-01`
      const lastDay = new Date(2025, m, 0).getDate()
      const end = `2025-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      ctx.db
        .prepare(
          `INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date)
         VALUES (?, ?, ?, ?, ?)`,
        )
        .run(companyId, fy2025.id, m, start, end)
    }

    // verification_sequences table dropped in migration 028 (F7)

    // Create customer with correct schema fields
    const custResult = ctx.counterpartyService.createCounterparty(ctx.db, {
      company_id: 1,
      name: 'CrossFY Kund',
      type: 'customer',
    })
    expect(custResult.success).toBe(true)
    if (!custResult.success) return
    const customer = custResult.data

    // Create invoice in FY2025
    const draftResult = ctx.invoiceService.saveDraft(ctx.db, {
      counterparty_id: customer.id,
      fiscal_year_id: fy2025.id,
      invoice_date: '2025-06-15',
      due_date: '2025-07-14',
      lines: [
        {
          product_id: null,
          description: 'FY2025 tjänst',
          quantity: 1,
          unit_price_ore: 50_00,
          vat_code_id: 4,
          account_number: '3002',
          sort_order: 0,
        },
      ],
    })
    expect(draftResult.success).toBe(true)
    if (!draftResult.success) return

    const finalizeResult = ctx.invoiceService.finalizeDraft(
      ctx.db,
      draftResult.data.id,
    )
    expect(finalizeResult.success).toBe(true)
    if (!finalizeResult.success) return
    const inv2025Id = draftResult.data.id

    // Seed invoice in FY2026 (default)
    const inv2026 = seedInvoiceNoVat(ctx, 100_00)

    // Bulk pay both with date in FY2026
    const result = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: inv2025Id, amount_ore: 50_00 },
        { invoice_id: inv2026.invoiceId, amount_ore: 100_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.status).toBe('completed')
    expect(result.data.succeeded).toHaveLength(2)

    // Payment journal entries should be in FY2026 (payment_date determines FY)
    for (const s of result.data.succeeded) {
      const je = ctx.db
        .prepare(
          'SELECT fiscal_year_id, verification_series FROM journal_entries WHERE id = ?',
        )
        .get(s.journal_entry_id) as {
        fiscal_year_id: number
        verification_series: string
      }
      expect(je.verification_series).toBe('A')
      expect(je.fiscal_year_id).toBe(ctx.seed.fiscalYearId)
    }
  })
})

// ── B8: payment_date outside all FY ────────────────────────────

describe('payInvoicesBulk — payment_date outside FY', () => {
  it('B8: payment_date matching no FY → VALIDATION_ERROR', () => {
    const inv = seedInvoiceNoVat(ctx, 100_00)
    const r = payInvoicesBulk(ctx.db, {
      payments: [{ invoice_id: inv.invoiceId, amount_ore: 100_00 }],
      payment_date: '2020-01-01', // no FY exists for 2020
      account_number: '1930',
    })
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('VALIDATION_ERROR')
    expect(r.error).toBe('Betalningsdatum faller inte i något räkenskapsår.')
  })
})

// ── B9: Contiguous A-series after happy-path batch ─────────────

describe('payInvoicesBulk — A-series contiguity (happy path)', () => {
  it('B9: A-series vernummer contiguous after successful batch', () => {
    // Förutsätter MAX+1-allokering
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const i2 = seedInvoiceNoVat(ctx, 200_00)
    const i3 = seedInvoiceNoVat(ctx, 300_00)

    payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 },
        { invoice_id: i2.invoiceId, amount_ore: 200_00 },
        { invoice_id: i3.invoiceId, amount_ore: 300_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 10_00,
    })

    // All A-series entries (including finalization + payment + bank-fee) must be contiguous
    assertContiguousVerNumbers(ctx.db, ctx.seed.fiscalYearId, 'A')
  })
})

// ── B11: Bank-fee with account_number ≠ 1930 ──────────────────

describe('payInvoicesBulk — custom bank account', () => {
  it('B11: account_number=1940 → bank-fee credit uses 1940', () => {
    const inv = seedInvoiceNoVat(ctx, 100_00)
    const result = payInvoicesBulk(ctx.db, {
      payments: [{ invoice_id: inv.invoiceId, amount_ore: 100_00 }],
      payment_date: '2026-03-15',
      account_number: '1940',
      bank_fee_ore: 15_00,
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const lines = getJournalLines(result.data.bank_fee_journal_entry_id!)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({
      account_number: '6570',
      debit_ore: 15_00,
      credit_ore: 0,
    })
    expect(lines[1]).toEqual({
      account_number: '1940',
      debit_ore: 0,
      credit_ore: 15_00,
    })
  })
})

// ── C2–C11: Expense bulk mirror tests ──────────────────────────

describe('payExpensesBulk — partial', () => {
  it('C2: 1 already-paid → 2 succeed, 1 fail, partial + bank fee', () => {
    const e1 = seedExpenseNoVat(ctx, 100_00)
    const e2 = seedExpenseNoVat(ctx, 200_00)
    const e3 = seedExpenseNoVat(ctx, 300_00)

    const t2 = getExpenseTotal(e2.expenseId)

    // Pay e2 first (must be after finalization date to satisfy M6 chronology)
    const prePayResult = ctx.expenseService.payExpense(ctx.db, {
      expense_id: e2.expenseId,
      amount_ore: t2,
      payment_date: '2026-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(prePayResult.success).toBe(true)

    const t1 = getExpenseTotal(e1.expenseId)
    const t3 = getExpenseTotal(e3.expenseId)

    const result = payExpensesBulk(ctx.db, {
      payments: [
        { expense_id: e1.expenseId, amount_ore: t1 },
        { expense_id: e2.expenseId, amount_ore: t2 },
        { expense_id: e3.expenseId, amount_ore: t3 },
      ],
      payment_date: '2026-03-20',
      account_number: '1930',
      bank_fee_ore: 20_00,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('partial')
    expect(result.data.succeeded).toHaveLength(2)
    expect(result.data.failed).toHaveLength(1)
    expect(result.data.failed[0].id).toBe(e2.expenseId)
    expect(result.data.bank_fee_journal_entry_id).toBeGreaterThan(0)
  })
})

describe('payExpensesBulk — all fail', () => {
  it('C3: cancelled, no batch, no bank fee', () => {
    const e1 = seedExpenseNoVat(ctx, 100_00)
    const e2 = seedExpenseNoVat(ctx, 200_00)
    const t1 = getExpenseTotal(e1.expenseId)
    const t2 = getExpenseTotal(e2.expenseId)

    // Pay both (after finalization date to satisfy M6)
    const r1 = ctx.expenseService.payExpense(ctx.db, {
      expense_id: e1.expenseId,
      amount_ore: t1,
      payment_date: '2026-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(r1.success).toBe(true)
    const r2 = ctx.expenseService.payExpense(ctx.db, {
      expense_id: e2.expenseId,
      amount_ore: t2,
      payment_date: '2026-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(r2.success).toBe(true)

    const result = payExpensesBulk(ctx.db, {
      payments: [
        { expense_id: e1.expenseId, amount_ore: t1 },
        { expense_id: e2.expenseId, amount_ore: t2 },
      ],
      payment_date: '2026-03-20',
      account_number: '1930',
      bank_fee_ore: 10_00,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('cancelled')
    expect(result.data.batch_id).toBeNull()
    expect(result.data.bank_fee_journal_entry_id).toBeNull()
  })
})

describe('payExpensesBulk — singular', () => {
  it('C4: 1 expense → batch + payment_batch_id', () => {
    const exp = seedExpenseNoVat(ctx, 500_00)
    const total = getExpenseTotal(exp.expenseId)
    const result = payExpensesBulk(ctx.db, {
      payments: [{ expense_id: exp.expenseId, amount_ore: total }],
      payment_date: '2026-03-15',
      account_number: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.batch_id).toBeGreaterThan(0)
    const p = ctx.db
      .prepare(
        'SELECT payment_batch_id FROM expense_payments WHERE expense_id = ?',
      )
      .get(exp.expenseId) as { payment_batch_id: number }
    expect(p.payment_batch_id).toBe(result.data.batch_id)
  })
})

describe('payExpensesBulk — validation', () => {
  it('C6: bank_fee >= sum → VALIDATION_ERROR', () => {
    const exp = seedExpenseNoVat(ctx, 100_00)
    const total = getExpenseTotal(exp.expenseId)
    const r = payExpensesBulk(ctx.db, {
      payments: [{ expense_id: exp.expenseId, amount_ore: total }],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: total,
    })
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('VALIDATION_ERROR')
  })

  it('C7: duplicate expense_ids → VALIDATION_ERROR', () => {
    const exp = seedExpenseNoVat(ctx, 100_00)
    const r = payExpensesBulk(ctx.db, {
      payments: [
        { expense_id: exp.expenseId, amount_ore: 50_00 },
        { expense_id: exp.expenseId, amount_ore: 50_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
    })
    expect(r.success).toBe(false)
  })

  it('C8: future payment_date → VALIDATION_ERROR', () => {
    const exp = seedExpenseNoVat(ctx, 100_00)
    const r = payExpensesBulk(ctx.db, {
      payments: [
        {
          expense_id: exp.expenseId,
          amount_ore: getExpenseTotal(exp.expenseId),
        },
      ],
      payment_date: '2099-01-01',
      account_number: '1930',
    })
    expect(r.success).toBe(false)
  })

  it('C8b: payment_date outside all FY → VALIDATION_ERROR', () => {
    const exp = seedExpenseNoVat(ctx, 100_00)
    const r = payExpensesBulk(ctx.db, {
      payments: [
        {
          expense_id: exp.expenseId,
          amount_ore: getExpenseTotal(exp.expenseId),
        },
      ],
      payment_date: '2020-01-01',
      account_number: '1930',
    })
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('VALIDATION_ERROR')
  })
})

describe('payExpensesBulk — B-series contiguity', () => {
  it('C9: B-series vernummer contiguous after successful batch', () => {
    // Förutsätter MAX+1-allokering
    const e1 = seedExpenseNoVat(ctx, 100_00)
    const e2 = seedExpenseNoVat(ctx, 200_00)
    const t1 = getExpenseTotal(e1.expenseId)
    const t2 = getExpenseTotal(e2.expenseId)

    payExpensesBulk(ctx.db, {
      payments: [
        { expense_id: e1.expenseId, amount_ore: t1 },
        { expense_id: e2.expenseId, amount_ore: t2 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 10_00,
    })

    assertContiguousVerNumbers(ctx.db, ctx.seed.fiscalYearId, 'B')
  })
})

describe('payExpensesBulk — contiguity after partial', () => {
  it('C10: vernummer contiguous after savepoint rollback', () => {
    // Förutsätter MAX+1-allokering
    const e1 = seedExpenseNoVat(ctx, 100_00)
    const e2 = seedExpenseNoVat(ctx, 200_00)
    const e3 = seedExpenseNoVat(ctx, 300_00)
    const t2 = getExpenseTotal(e2.expenseId)

    // Pay e2 first (after finalization date to satisfy M6)
    const prePayResult = ctx.expenseService.payExpense(ctx.db, {
      expense_id: e2.expenseId,
      amount_ore: t2,
      payment_date: '2026-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(prePayResult.success).toBe(true)

    const t1 = getExpenseTotal(e1.expenseId)
    const t3 = getExpenseTotal(e3.expenseId)

    const result = payExpensesBulk(ctx.db, {
      payments: [
        { expense_id: e1.expenseId, amount_ore: t1 },
        { expense_id: e2.expenseId, amount_ore: t2 },
        { expense_id: e3.expenseId, amount_ore: t3 },
      ],
      payment_date: '2026-03-20',
      account_number: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.succeeded).toHaveLength(2)
    const verNums = result.data.succeeded.map(
      (s) => getJournalEntry(s.journal_entry_id).verification_number,
    )
    expect(verNums).toHaveLength(2)
    expect(verNums[1] - verNums[0]).toBe(1)
  })
})

describe('payExpensesBulk — custom bank account', () => {
  it('C11: account_number=1940 → bank-fee credit uses 1940', () => {
    const exp = seedExpenseNoVat(ctx, 100_00)
    const total = getExpenseTotal(exp.expenseId)
    const result = payExpensesBulk(ctx.db, {
      payments: [{ expense_id: exp.expenseId, amount_ore: total }],
      payment_date: '2026-03-15',
      account_number: '1940',
      bank_fee_ore: 15_00,
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const lines = getJournalLines(result.data.bank_fee_journal_entry_id!)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual({
      account_number: '6570',
      debit_ore: 15_00,
      credit_ore: 0,
    })
    expect(lines[1]).toEqual({
      account_number: '1940',
      debit_ore: 0,
      credit_ore: 15_00,
    })
  })
})

// ── C14: skipChronologyCheck=false on public payExpense ─────────

describe('payExpense — chronology check regression', () => {
  it('C14: public payExpense enforces M6 chronology (skipChronologyCheck=false)', () => {
    const e1 = seedExpenseNoVat(ctx, 100_00)
    const e2 = seedExpenseNoVat(ctx, 200_00)
    const t1 = getExpenseTotal(e1.expenseId)
    const t2 = getExpenseTotal(e2.expenseId)

    // Pay e1 at April 10 → creates B-series entry dated April 10
    const payResult = payExpense(ctx.db, {
      expense_id: e1.expenseId,
      amount_ore: t1,
      payment_date: '2026-04-10',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(payResult.success).toBe(true)

    // Try to pay e2 at March 15 (before April 10 B-series entry)
    const result = payExpense(ctx.db, {
      expense_id: e2.expenseId,
      amount_ore: t2,
      payment_date: '2026-03-15',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(false)
  })
})

// ── D1: Public payInvoice contract ─────────────────────────────

describe('payInvoice — public contract', () => {
  it('D1: returns {invoice, payment} without journalEntryId', () => {
    const inv = seedInvoiceNoVat(ctx, 100_00)
    const result = payInvoice(ctx.db, {
      invoice_id: inv.invoiceId,
      amount_ore: 100_00,
      payment_date: '2026-03-15',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toHaveProperty('invoice')
    expect(result.data).toHaveProperty('payment')
    expect(result.data).not.toHaveProperty('journalEntryId')
    // Verify no extra keys
    const keys = Object.keys(result.data).sort()
    expect(keys).toEqual(['invoice', 'payment'])
  })
})

// ── F1–F6: Cross-cutting invariants ────────────────────────────

describe('Cross-cutting invariants — journal entry balance (F1)', () => {
  it('F1: all journal entries from invoice bulk are balanced', () => {
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const i2 = seedInvoiceNoVat(ctx, 200_00)
    const result = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 },
        { invoice_id: i2.invoiceId, amount_ore: 200_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 25_00,
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    for (const s of result.data.succeeded) {
      assertJournalEntryBalanced(ctx.db, s.journal_entry_id)
    }
    assertJournalEntryBalanced(ctx.db, result.data.bank_fee_journal_entry_id!)
  })

  it('F1: all journal entries from expense bulk are balanced', () => {
    const e1 = seedExpenseNoVat(ctx, 100_00)
    const e2 = seedExpenseNoVat(ctx, 200_00)
    const t1 = getExpenseTotal(e1.expenseId)
    const t2 = getExpenseTotal(e2.expenseId)

    const result = payExpensesBulk(ctx.db, {
      payments: [
        { expense_id: e1.expenseId, amount_ore: t1 },
        { expense_id: e2.expenseId, amount_ore: t2 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 25_00,
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    for (const s of result.data.succeeded) {
      assertJournalEntryBalanced(ctx.db, s.journal_entry_id)
    }
    assertJournalEntryBalanced(ctx.db, result.data.bank_fee_journal_entry_id!)
  })
})

describe('Cross-cutting invariants — bank-fee source_type (F2)', () => {
  it('F2: bank_fee_journal_entry_id → source_type=auto_bank_fee', () => {
    const inv = seedInvoiceNoVat(ctx, 100_00)
    const result = payInvoicesBulk(ctx.db, {
      payments: [{ invoice_id: inv.invoiceId, amount_ore: 100_00 }],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 30_00,
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const batch = getBatch(result.data.batch_id!)
    expect(batch.bank_fee_journal_entry_id).toBe(
      result.data.bank_fee_journal_entry_id,
    )

    const je = getJournalEntry(result.data.bank_fee_journal_entry_id!)
    expect(je.source_type).toBe('auto_bank_fee')
  })
})

describe('Cross-cutting invariants — FK integrity (F3)', () => {
  it('F3: all non-null payment_batch_id reference existing batch', () => {
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const i2 = seedInvoiceNoVat(ctx, 200_00)
    payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 },
        { invoice_id: i2.invoiceId, amount_ore: 200_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
    })

    const orphans = ctx.db
      .prepare(
        `SELECT ip.id FROM invoice_payments ip
       WHERE ip.payment_batch_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM payment_batches pb WHERE pb.id = ip.payment_batch_id)`,
      )
      .all()
    expect(orphans).toHaveLength(0)
  })
})

describe('Cross-cutting invariants — source_reference (F4)', () => {
  it('F4: bank-fee source_reference = batch:{id}', () => {
    const exp = seedExpenseNoVat(ctx, 100_00)
    const total = getExpenseTotal(exp.expenseId)
    const result = payExpensesBulk(ctx.db, {
      payments: [{ expense_id: exp.expenseId, amount_ore: total }],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 20_00,
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const je = getJournalEntry(result.data.bank_fee_journal_entry_id!)
    expect(je.source_reference).toBe(`batch:${result.data.batch_id}`)
  })
})

describe('Cross-cutting invariants — immutability trigger (F5)', () => {
  it('F5: UPDATE description on booked entry → throws', () => {
    const inv = seedInvoiceNoVat(ctx, 100_00)
    const result = payInvoicesBulk(ctx.db, {
      payments: [{ invoice_id: inv.invoiceId, amount_ore: 100_00 }],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 10_00,
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    // Bank-fee entry is booked — try to UPDATE description (blocked by trigger)
    const jeId = result.data.bank_fee_journal_entry_id!
    expect(() => {
      ctx.db
        .prepare(
          "UPDATE journal_entries SET description = 'hacked' WHERE id = ?",
        )
        .run(jeId)
    }).toThrow(/Bokförd verifikation kan inte ändras/)
  })

  // Note: source_reference is NOT blocked by the trigger (see Fas 0.b finding).
  // M114's INSERT-only strategy for source_reference is application-level discipline,
  // not trigger-enforced. Flagged for Sprint 14: consider hardening trigger or
  // codifying M114 as explicit application discipline.
})

describe('Cross-cutting invariants — sequential bulk (F6)', () => {
  it('F6: two sequential bulk calls → contiguous A-series across both', () => {
    // First batch
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const i2 = seedInvoiceNoVat(ctx, 200_00)
    payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 },
        { invoice_id: i2.invoiceId, amount_ore: 200_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 10_00,
    })

    // Second batch
    const i3 = seedInvoiceNoVat(ctx, 300_00)
    const i4 = seedInvoiceNoVat(ctx, 400_00)
    payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i3.invoiceId, amount_ore: 300_00 },
        { invoice_id: i4.invoiceId, amount_ore: 400_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 15_00,
    })

    // Entire A-series must be contiguous
    assertContiguousVerNumbers(ctx.db, ctx.seed.fiscalYearId, 'A')
  })
})

// ── E6: user_note propagation ──────────────────────────────────

describe('payInvoicesBulk — user_note propagation (E6)', () => {
  it('E6: user_note is stored in payment_batches', () => {
    const inv = seedInvoiceNoVat(ctx, 100_00)
    const result = payInvoicesBulk(ctx.db, {
      payments: [{ invoice_id: inv.invoiceId, amount_ore: 100_00 }],
      payment_date: '2026-03-15',
      account_number: '1930',
      user_note: 'Testanteckning för batch',
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const batch = ctx.db
      .prepare('SELECT user_note FROM payment_batches WHERE id = ?')
      .get(result.data.batch_id!) as { user_note: string | null }
    expect(batch.user_note).toBe('Testanteckning för batch')
  })

  it('E6: user_note defaults to null when omitted', () => {
    const inv = seedInvoiceNoVat(ctx, 200_00)
    const result = payInvoicesBulk(ctx.db, {
      payments: [{ invoice_id: inv.invoiceId, amount_ore: 200_00 }],
      payment_date: '2026-03-15',
      account_number: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const batch = ctx.db
      .prepare('SELECT user_note FROM payment_batches WHERE id = ?')
      .get(result.data.batch_id!) as { user_note: string | null }
    expect(batch.user_note).toBeNull()
  })
})

// ── G1/G2: SIE roundtrip ──────────────────────────────────────

describe('SIE4 export after bulk batch (G1)', () => {
  it('G1: bank-fee verifikat with åäö description appears in SIE4 CP437', () => {
    const inv = seedInvoiceNoVat(ctx, 100_00)
    const result = payInvoicesBulk(ctx.db, {
      payments: [{ invoice_id: inv.invoiceId, amount_ore: 100_00 }],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 10_00,
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    // Patch bank-fee description to include åäö for CP437 test
    // (M114: source_reference set at INSERT, but description IS blocked by trigger
    //  on booked entries — so we need to test with the actual description or use
    //  a non-booked approach. The actual description is "Bankavgift bulk-betalning 2026-03-15"
    //  which has no åäö. Since we can't UPDATE booked entries, we verify that
    //  the SIE4 export includes the bank-fee VER correctly and the company name
    //  "Testföretag AB" (which has ö) roundtrips through CP437.)
    const sie4 = ctx.sie4ExportService.exportSie4(ctx.db, {
      fiscalYearId: ctx.seed.fiscalYearId,
    })
    const buf = Buffer.from(sie4.content)
    // Decode as CP437
    const decoded = iconv.decode(buf, 'cp437')

    // Company name with ö survives roundtrip
    expect(decoded).toContain('Testföretag AB')

    // Bank-fee VER exists
    expect(decoded).toContain('Bankavgift bulk-betalning')
    expect(decoded).toContain('6570')
  })
})

describe('SIE5 export after bulk batch (G2)', () => {
  it('G2: bank-fee verifikat appears in SIE5 UTF-8', () => {
    const inv = seedInvoiceNoVat(ctx, 100_00)
    const result = payInvoicesBulk(ctx.db, {
      payments: [{ invoice_id: inv.invoiceId, amount_ore: 100_00 }],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 10_00,
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const sie5 = ctx.sie5ExportService.exportSie5(ctx.db, {
      fiscalYearId: ctx.seed.fiscalYearId,
    })

    // SIE5 is UTF-8 XML — bank-fee entry should exist
    expect(sie5).toContain('Bankavgift bulk-betalning')
    expect(sie5).toContain('6570')
    // Company name with ö in UTF-8
    expect(sie5).toContain('Testföretag AB')
  })
})

// ══════════════════════════════════════════════════════════════════
// Sprint 13b — Fas 3: Interaktions- och idempotens-scenarier
// ═══════���══════════════════���═══════════════════════════════════════

describe('IDEMP1 — dubbelklick/retry på bulk', () => {
  it('samma payload igen → 0 succeeded, 3 failed med ALREADY_PAID-liknande', () => {
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const i2 = seedInvoiceNoVat(ctx, 200_00)
    const i3 = seedInvoiceNoVat(ctx, 300_00)

    const first = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 },
        { invoice_id: i2.invoiceId, amount_ore: 200_00 },
        { invoice_id: i3.invoiceId, amount_ore: 300_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
    })
    expect(first.success).toBe(true)
    if (!first.success) return
    expect(first.data.succeeded).toHaveLength(3)

    // Exakt samma payload igen
    const second = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 },
        { invoice_id: i2.invoiceId, amount_ore: 200_00 },
        { invoice_id: i3.invoiceId, amount_ore: 300_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
    })
    expect(second.success).toBe(true)
    if (!second.success) return
    expect(second.data.succeeded).toHaveLength(0)
    expect(second.data.failed).toHaveLength(3)
    expect(second.data.status).toBe('cancelled')

    // Ingen ny payment_batches-rad
    const batchCount = (
      ctx.db.prepare('SELECT COUNT(*) as c FROM payment_batches').get() as {
        c: number
      }
    ).c
    expect(batchCount).toBe(1) // Bara första batchen

    // Inga duplicate invoice_payments
    const paymentCount = (
      ctx.db.prepare('SELECT COUNT(*) as c FROM invoice_payments').get() as {
        c: number
      }
    ).c
    expect(paymentCount).toBe(3)
  })
})

describe('IDEMP2 — partial retry', () => {
  it('retry efter partial → failed betalas, redan-betalda ALREADY_PAID', () => {
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const i2 = seedInvoiceNoVat(ctx, 200_00)
    const i3 = seedInvoiceNoVat(ctx, 300_00)

    // Betala i2 separat → non-payable i bulk
    ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: i2.invoiceId,
      amount_ore: 200_00,
      payment_date: '2026-03-15',
      payment_method: 'bankgiro',
      account_number: '1930',
    })

    // Första bulk → i1+i3 lyckas, i2 failar
    const first = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 },
        { invoice_id: i2.invoiceId, amount_ore: 200_00 },
        { invoice_id: i3.invoiceId, amount_ore: 300_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
    })
    expect(first.success).toBe(true)
    if (!first.success) return
    expect(first.data.status).toBe('partial')
    expect(first.data.succeeded).toHaveLength(2)
    expect(first.data.failed).toHaveLength(1)
    expect(first.data.failed[0].id).toBe(i2.invoiceId)

    // Retry exakt samma payload — nu failar alla (i1+i3 paid, i2 fortfarande paid)
    const second = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 },
        { invoice_id: i2.invoiceId, amount_ore: 200_00 },
        { invoice_id: i3.invoiceId, amount_ore: 300_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
    })
    expect(second.success).toBe(true)
    if (!second.success) return
    expect(second.data.status).toBe('cancelled')
    expect(second.data.failed).toHaveLength(3)

    // Korrekt antal batches: 1 partial (cancelled skapar ingen batch)
    const batchCount = (
      ctx.db.prepare('SELECT COUNT(*) as c FROM payment_batches').get() as {
        c: number
      }
    ).c
    expect(batchCount).toBe(1)

    // Total invoice_payments: 3 (1 separat + 2 från första bulk)
    const paymentCount = (
      ctx.db.prepare('SELECT COUNT(*) as c FROM invoice_payments').get() as {
        c: number
      }
    ).c
    expect(paymentCount).toBe(3)
  })
})

describe('BULK-ÖRES1 — öresutjämning i bulk (positivt kontrakt)', () => {
  it('amount_ore 1 öre > remaining → öresutjämning sker automatiskt', () => {
    // 3 fakturor med 9999 öre (99.99 kr) vardera
    const i1 = seedInvoiceNoVat(ctx, 99_99)
    const i2 = seedInvoiceNoVat(ctx, 99_99)
    const i3 = seedInvoiceNoVat(ctx, 99_99)

    // Betala 100.00 kr (10000 öre) per rad — 1 öre mer per rad
    const result = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 },
        { invoice_id: i2.invoiceId, amount_ore: 100_00 },
        { invoice_id: i3.invoiceId, amount_ore: 100_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.succeeded).toHaveLength(3)
    expect(result.data.status).toBe('completed')

    // Alla 3 fakturor ska vara fully paid (öresutjämning stänger resten)
    for (const s of result.data.succeeded) {
      const inv = ctx.db
        .prepare('SELECT status, paid_amount_ore FROM invoices WHERE id = ?')
        .get(s.id) as { status: string; paid_amount_ore: number }
      expect(inv.status).toBe('paid')
      // paid_amount_ore = remaining (9999), inte amount_ore (10000)
      expect(inv.paid_amount_ore).toBe(99_99)

      // Verifikat ska ha 3740-rad (öresutjämning) — 1 öre kredit
      const lines = getJournalLines(s.journal_entry_id)
      const roundingLine = lines.find((l) => l.account_number === '3740')
      expect(roundingLine).toBeDefined()
      expect(roundingLine!.credit_ore).toBe(1) // Kund betalade mer → kredit 3740
    }
  })
})

describe('BULK-ÖRES2 — öresutjämning + bank-fee samma batch', () => {
  it('öresutjämning och batch-bank-fee samexisterar korrekt', () => {
    const i1 = seedInvoiceNoVat(ctx, 99_99) // remaining = 9999
    const i2 = seedInvoiceNoVat(ctx, 200_00) // remaining = 20000

    const result = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 }, // 1 öre mer → öresutjämning
        { invoice_id: i2.invoiceId, amount_ore: 200_00 }, // exakt belopp
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 25_00,
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.succeeded).toHaveLength(2)
    expect(result.data.bank_fee_journal_entry_id).toBeGreaterThan(0)

    // Öresutjämning bara på i1
    const i1Lines = getJournalLines(
      result.data.succeeded.find((s) => s.id === i1.invoiceId)!
        .journal_entry_id,
    )
    expect(i1Lines.some((l) => l.account_number === '3740')).toBe(true)

    const i2Lines = getJournalLines(
      result.data.succeeded.find((s) => s.id === i2.invoiceId)!
        .journal_entry_id,
    )
    expect(i2Lines.some((l) => l.account_number === '3740')).toBe(false)

    // Bank-fee-verifikatet påverkas INTE av öresutjämning
    const feeLines = getJournalLines(result.data.bank_fee_journal_entry_id!)
    expect(feeLines).toHaveLength(2)
    expect(feeLines[0]).toEqual({
      account_number: '6570',
      debit_ore: 25_00,
      credit_ore: 0,
    })
    expect(feeLines[1]).toEqual({
      account_number: '1930',
      debit_ore: 0,
      credit_ore: 25_00,
    })
  })
})

describe('BANK-FEE-EDGE1 — bank_fee_ore: 0 vs undefined', () => {
  it('explicit bank_fee_ore: 0 → inget bank-fee-verifikat', () => {
    const i1 = seedInvoiceNoVat(ctx, 100_00)

    const result = payInvoicesBulk(ctx.db, {
      payments: [{ invoice_id: i1.invoiceId, amount_ore: 100_00 }],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 0,
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('completed')
    expect(result.data.bank_fee_journal_entry_id).toBeNull()

    const batch = getBatch(result.data.batch_id!)
    expect(batch.bank_fee_journal_entry_id).toBeNull()
  })

  it('undefined bank_fee_ore → inget bank-fee-verifikat', () => {
    const i1 = seedInvoiceNoVat(ctx, 100_00)

    const result = payInvoicesBulk(ctx.db, {
      payments: [{ invoice_id: i1.invoiceId, amount_ore: 100_00 }],
      payment_date: '2026-03-15',
      account_number: '1930',
      // bank_fee_ore utelämnat
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('completed')
    expect(result.data.bank_fee_journal_entry_id).toBeNull()

    const batch = getBatch(result.data.batch_id!)
    expect(batch.bank_fee_journal_entry_id).toBeNull()
  })
})

// ══════════════════════════════════════════════════════════════════
// Sprint 13b — Fas 4: SIE-roundtrip för partial batch
// ══════════════════════════════════════════════════════════════════

describe('SIE-PARTIAL1 — SIE4 roundtrip med partial batch', () => {
  it('partial batch: 2 payment-verifikat + 1 bank-fee roundtrippar i SIE4', () => {
    // KONTRAKT Sprint 13: se produktdiskussion Sprint 14
    // Bank-fee bokförs HELT vid partial (inte proportionellt).
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const i2 = seedInvoiceNoVat(ctx, 200_00)
    const i3 = seedInvoiceNoVat(ctx, 300_00)

    // Betala i2 separat → non-payable
    ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: i2.invoiceId,
      amount_ore: 200_00,
      payment_date: '2026-03-15',
      payment_method: 'bankgiro',
      account_number: '1930',
    })

    const result = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 },
        { invoice_id: i2.invoiceId, amount_ore: 200_00 },
        { invoice_id: i3.invoiceId, amount_ore: 300_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 15_00,
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('partial')
    expect(result.data.succeeded).toHaveLength(2)
    expect(result.data.bank_fee_journal_entry_id).toBeGreaterThan(0)

    // Exportera SIE4
    const sie4 = ctx.sie4ExportService.exportSie4(ctx.db, {
      fiscalYearId: ctx.seed.fiscalYearId,
    })
    const buf = Buffer.from(sie4.content)
    const decoded = iconv.decode(buf, 'cp437')

    // Payment-verifikat existerar i SIE4
    expect(decoded).toContain('Betalning faktura')

    // Bank-fee-verifikat med hela 1500 öre (inte proportionellt)
    expect(decoded).toContain('Bankavgift bulk-betalning')
    expect(decoded).toContain('6570')

    // Verifiera source_reference bevaras i DB (SIE exporterar inte detta fält)
    const bankFeeEntry = getJournalEntry(result.data.bank_fee_journal_entry_id!)
    expect(bankFeeEntry.source_reference).toBe(`batch:${result.data.batch_id}`)
    expect(bankFeeEntry.source_type).toBe('auto_bank_fee')

    // Bank-fee = hela 15_00 (inte proportionellt 10_00 för 2/3)
    const feeLines = getJournalLines(result.data.bank_fee_journal_entry_id!)
    expect(feeLines[0]).toEqual({
      account_number: '6570',
      debit_ore: 15_00,
      credit_ore: 0,
    })
  })
})

describe('SIE-PARTIAL2 — SIE5 roundtrip med partial batch', () => {
  it('partial batch: payment + bank-fee roundtrippar i SIE5 UTF-8', () => {
    // KONTRAKT Sprint 13: se produktdiskussion Sprint 14
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const i2 = seedInvoiceNoVat(ctx, 200_00)
    const i3 = seedInvoiceNoVat(ctx, 300_00)

    ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: i2.invoiceId,
      amount_ore: 200_00,
      payment_date: '2026-03-15',
      payment_method: 'bankgiro',
      account_number: '1930',
    })

    const result = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 },
        { invoice_id: i2.invoiceId, amount_ore: 200_00 },
        { invoice_id: i3.invoiceId, amount_ore: 300_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 15_00,
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const sie5 = ctx.sie5ExportService.exportSie5(ctx.db, {
      fiscalYearId: ctx.seed.fiscalYearId,
    })

    // UTF-8: åäö preserved
    expect(sie5).toContain('Testföretag AB')
    expect(sie5).toContain('Bankavgift bulk-betalning')
    expect(sie5).toContain('6570')

    // Payment-verifikat existerar i SIE5
    expect(sie5).toContain('Betalning faktura')
  })
})

// ══════════════════════════════════════════════════════════════════
// Sprint 13b — Fas 6: USER-NOTE-REGRESSION
// ══════════════════════════════════════════════════════════════════

describe('USER-NOTE-REGRESSION — user_note stannar i payment_batches', () => {
  it('user_note sparas i batch men läcker inte in i journal eller payments', () => {
    const uniqueNote = 'TESTFLAGG-12345'
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const i2 = seedInvoiceNoVat(ctx, 200_00)

    const result = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 },
        { invoice_id: i2.invoiceId, amount_ore: 200_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 10_00,
      user_note: uniqueNote,
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    // Positivt: user_note i payment_batches
    const batch = ctx.db
      .prepare('SELECT user_note FROM payment_batches WHERE id = ?')
      .get(result.data.batch_id) as { user_note: string | null }
    expect(batch.user_note).toBe(uniqueNote)

    // Negativt: INGEN journal_entry.description innehåller noten
    const jeWithNote = ctx.db
      .prepare(
        'SELECT COUNT(*) as c FROM journal_entries WHERE description LIKE ?',
      )
      .get(`%${uniqueNote}%`) as { c: number }
    expect(jeWithNote.c).toBe(0)

    // Negativt: INGEN invoice_payment har noten i något textfält
    // (Kontrollera payment_method och account_number — de enda textfälten)
    const payWithNote = ctx.db
      .prepare(
        `SELECT COUNT(*) as c FROM invoice_payments
       WHERE payment_method LIKE ? OR account_number LIKE ?`,
      )
      .get(`%${uniqueNote}%`, `%${uniqueNote}%`) as { c: number }
    expect(payWithNote.c).toBe(0)

    // Negativt: INGEN journal_entry_lines.description innehåller noten
    const lineWithNote = ctx.db
      .prepare(
        'SELECT COUNT(*) as c FROM journal_entry_lines WHERE description LIKE ?',
      )
      .get(`%${uniqueNote}%`) as { c: number }
    expect(lineWithNote.c).toBe(0)
  })
})
