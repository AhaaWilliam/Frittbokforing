/**
 * Sprint F P2 — Batch-unmatch (M154 + M146)
 *
 * Testar unmatchBankBatch som ångrar en hel payment_batch atomärt:
 *   - Alla payments raderas
 *   - Korrigeringsverifikat (C-serie) skapas per payment + för bank-fee
 *   - paid_amount_ore återställs per invoice/expense
 *   - payment_batches.status = 'cancelled'
 *   - Bank-TX-status flippas om de var matchade
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
import {
  type SystemTestContext,
  createTemplateDb,
  destroyTemplateDb,
  createSystemTestContext,
  destroyContext,
  seedAndFinalizeInvoice,
  seedAndFinalizeExpense,
} from './system/helpers/system-test-context'
import { payInvoicesBulk } from '../src/main/services/invoice-service'
import { payExpensesBulk } from '../src/main/services/expense-service'
import {
  unmatchBankBatch,
  unmatchBankTransaction,
} from '../src/main/services/bank/bank-unmatch-service'
import { matchBankTransaction } from '../src/main/services/bank/bank-match-service'

let ctx: SystemTestContext

beforeAll(() => createTemplateDb())
afterAll(() => destroyTemplateDb())
beforeEach(() => {
  ctx = createSystemTestContext()
})
afterEach(() => destroyContext(ctx))

// ── Seed helpers ────────────────────────────────────────────────

function seedInvoiceNoVat(ctx: SystemTestContext, unitPriceOre: number) {
  return seedAndFinalizeInvoice(ctx, {
    lines: [
      {
        product_id: null,
        description: 'Test',
        quantity: 1,
        unit_price_ore: unitPriceOre,
        vat_code_id: 4, // MF
        account_number: '3002',
      },
    ],
  })
}

function seedExpenseNoVat(ctx: SystemTestContext, unitPriceOre: number) {
  return seedAndFinalizeExpense(ctx, {
    lines: [
      {
        description: 'Test',
        account_number: '6110',
        quantity: 1,
        unit_price_ore: unitPriceOre,
        vat_code_id: 5, // IP1 25%
      },
    ],
  })
}

function seedBankStatement(
  ctx: SystemTestContext,
  amounts: readonly number[],
): readonly number[] {
  const fyId = ctx.seed.fiscalYearId
  const companyId = ctx.seed.companyId
  const stmtResult = ctx.db
    .prepare(
      `INSERT INTO bank_statements (
        company_id, fiscal_year_id, statement_number, bank_account_iban,
        statement_date, opening_balance_ore, closing_balance_ore,
        source_format, import_file_hash
      ) VALUES (?, ?, 'TEST-01', 'SE4550000000050001000001',
        '2026-03-20', 0, 0, 'camt.053', ?)`,
    )
    .run(companyId, fyId, `hash-${Date.now()}`)
  const stmtId = Number(stmtResult.lastInsertRowid)
  const insertTx = ctx.db.prepare(
    `INSERT INTO bank_transactions (
      bank_statement_id, booking_date, value_date, amount_ore,
      transaction_reference, remittance_info, counterparty_iban,
      counterparty_name, bank_transaction_code
    ) VALUES (?, '2026-03-20', '2026-03-20', ?,
      NULL, NULL, NULL, NULL, NULL)`,
  )
  const ids: number[] = []
  for (const amount of amounts) {
    const r = insertTx.run(stmtId, amount)
    ids.push(Number(r.lastInsertRowid))
  }
  return ids
}

function getBatch(id: number) {
  return ctx.db
    .prepare('SELECT * FROM payment_batches WHERE id = ?')
    .get(id) as {
    id: number
    status: string
    batch_type: string
    bank_fee_journal_entry_id: number | null
  }
}

function getJournalEntry(id: number) {
  return ctx.db
    .prepare('SELECT * FROM journal_entries WHERE id = ?')
    .get(id) as {
    id: number
    verification_series: string
    status: string
    description: string
    journal_date: string
    corrected_by_id: number | null
  }
}

function getInvoice(id: number) {
  return ctx.db.prepare('SELECT * FROM invoices WHERE id = ?').get(id) as {
    id: number
    paid_amount_ore: number
    status: string
  }
}

function getExpense(id: number) {
  return ctx.db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as {
    id: number
    paid_amount_ore: number
    status: string
  }
}

function countPayments(tableName: string, batchId: number): number {
  const r = ctx.db
    .prepare(
      `SELECT COUNT(*) AS c FROM ${tableName} WHERE payment_batch_id = ?`,
    )
    .get(batchId) as { c: number }
  return r.c
}

// ── Tests ───────────────────────────────────────────────────────

describe('unmatchBankBatch — invoice batch happy path (M146)', () => {
  it('2-rads invoice-batch: alla payments raderade, 2+1 C-korrigeringar, batch cancelled', () => {
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const i2 = seedInvoiceNoVat(ctx, 200_00)
    const bulk = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 },
        { invoice_id: i2.invoiceId, amount_ore: 200_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 50_00,
    })
    expect(bulk.success).toBe(true)
    if (!bulk.success) return
    const batchId = bulk.data.batch_id!

    const result = unmatchBankBatch(ctx.db, { batch_id: batchId })
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.batch_type).toBe('invoice')
    expect(result.data.unmatched_payment_count).toBe(2)
    expect(result.data.correction_journal_entry_ids).toHaveLength(2)
    expect(result.data.bank_fee_correction_entry_id).not.toBeNull()

    // Batch cancelled
    expect(getBatch(batchId).status).toBe('cancelled')

    // All payments deleted
    expect(countPayments('invoice_payments', batchId)).toBe(0)

    // Invoices återställda
    expect(getInvoice(i1.invoiceId).paid_amount_ore).toBe(0)
    expect(getInvoice(i1.invoiceId).status).toBe('unpaid')
    expect(getInvoice(i2.invoiceId).paid_amount_ore).toBe(0)
    expect(getInvoice(i2.invoiceId).status).toBe('unpaid')

    // Korrigeringsverifikat = C-serie
    for (const id of result.data.correction_journal_entry_ids) {
      const je = getJournalEntry(id)
      expect(je.verification_series).toBe('C')
      expect(je.status).toBe('booked')
    }
  })
})

describe('unmatchBankBatch — expense batch polymorfism (M146)', () => {
  it('3-rads expense-batch: alla payments raderade, 3+1 C-korrigeringar', () => {
    const e1 = seedExpenseNoVat(ctx, 100_00)
    const e2 = seedExpenseNoVat(ctx, 200_00)
    const e3 = seedExpenseNoVat(ctx, 150_00)
    const getTotal = (id: number) =>
      (
        ctx.db
          .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
          .get(id) as { total_amount_ore: number }
      ).total_amount_ore
    const bulk = payExpensesBulk(ctx.db, {
      payments: [
        { expense_id: e1.expenseId, amount_ore: getTotal(e1.expenseId) },
        { expense_id: e2.expenseId, amount_ore: getTotal(e2.expenseId) },
        { expense_id: e3.expenseId, amount_ore: getTotal(e3.expenseId) },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 25_00,
    })
    expect(bulk.success).toBe(true)
    if (!bulk.success) return
    const batchId = bulk.data.batch_id!

    const result = unmatchBankBatch(ctx.db, { batch_id: batchId })
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.batch_type).toBe('expense')
    expect(result.data.unmatched_payment_count).toBe(3)
    expect(result.data.correction_journal_entry_ids).toHaveLength(3)
    expect(result.data.bank_fee_correction_entry_id).not.toBeNull()

    expect(getBatch(batchId).status).toBe('cancelled')
    expect(countPayments('expense_payments', batchId)).toBe(0)
    for (const e of [e1, e2, e3]) {
      expect(getExpense(e.expenseId).paid_amount_ore).toBe(0)
      expect(getExpense(e.expenseId).status).toBe('unpaid')
    }
  })
})

describe('unmatchBankBatch — batch utan bank-fee', () => {
  it('batch utan bank_fee_ore: bank_fee_correction_entry_id är null', () => {
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const bulk = payInvoicesBulk(ctx.db, {
      payments: [{ invoice_id: i1.invoiceId, amount_ore: 100_00 }],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 0,
    })
    expect(bulk.success).toBe(true)
    if (!bulk.success) return
    const batchId = bulk.data.batch_id!

    const result = unmatchBankBatch(ctx.db, { batch_id: batchId })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.bank_fee_correction_entry_id).toBeNull()
    expect(result.data.unmatched_payment_count).toBe(1)
  })
})

describe('unmatchBankBatch — re-match efter unmatch (M140 per payment-JE)', () => {
  it('Efter batch-unmatch: faktura kan betalas igen (nytt payment-JE, inte låst)', () => {
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const bulk = payInvoicesBulk(ctx.db, {
      payments: [{ invoice_id: i1.invoiceId, amount_ore: 100_00 }],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 0,
    })
    expect(bulk.success).toBe(true)
    if (!bulk.success) return
    const batchId = bulk.data.batch_id!

    const unmatch = unmatchBankBatch(ctx.db, { batch_id: batchId })
    expect(unmatch.success).toBe(true)

    // Ny bulk-betalning på samma faktura fungerar
    const bulk2 = payInvoicesBulk(ctx.db, {
      payments: [{ invoice_id: i1.invoiceId, amount_ore: 100_00 }],
      payment_date: '2026-03-20',
      account_number: '1930',
      bank_fee_ore: 0,
    })
    expect(bulk2.success).toBe(true)
    if (!bulk2.success) return
    expect(bulk2.data.succeeded).toHaveLength(1)
    expect(getInvoice(i1.invoiceId).paid_amount_ore).toBe(100_00)
  })
})

describe('unmatchBankBatch — korrigeringsverifikat cross-reference (M139)', () => {
  it('C-serie-description innehåller "Korrigering av ver. A<N>"', () => {
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const bulk = payInvoicesBulk(ctx.db, {
      payments: [{ invoice_id: i1.invoiceId, amount_ore: 100_00 }],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 50_00,
    })
    expect(bulk.success).toBe(true)
    if (!bulk.success) return

    const result = unmatchBankBatch(ctx.db, { batch_id: bulk.data.batch_id! })
    expect(result.success).toBe(true)
    if (!result.success) return

    for (const id of result.data.correction_journal_entry_ids) {
      const je = getJournalEntry(id)
      expect(je.description).toMatch(/Korrigering av ver\. A\d+/)
    }
    if (result.data.bank_fee_correction_entry_id !== null) {
      const feeCorr = getJournalEntry(result.data.bank_fee_correction_entry_id)
      expect(feeCorr.description).toMatch(/Korrigering av ver\. A\d+/)
    }
  })
})

describe('unmatchBankBatch — chronology (M142)', () => {
  it('Alla C-korrigeringar har icke-minskande datum (samma dag OK)', () => {
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const i2 = seedInvoiceNoVat(ctx, 200_00)
    const i3 = seedInvoiceNoVat(ctx, 300_00)
    const bulk = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 },
        { invoice_id: i2.invoiceId, amount_ore: 200_00 },
        { invoice_id: i3.invoiceId, amount_ore: 300_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 50_00,
    })
    expect(bulk.success).toBe(true)
    if (!bulk.success) return

    const result = unmatchBankBatch(ctx.db, { batch_id: bulk.data.batch_id! })
    expect(result.success).toBe(true)
    if (!result.success) return

    const allIds = [
      ...result.data.correction_journal_entry_ids,
      ...(result.data.bank_fee_correction_entry_id !== null
        ? [result.data.bank_fee_correction_entry_id]
        : []),
    ]
    const dates = allIds.map((id) => getJournalEntry(id).journal_date)
    for (let i = 1; i < dates.length; i++) {
      expect(
        dates[i] >= dates[i - 1],
        `chronology: ${dates[i - 1]} → ${dates[i]}`,
      ).toBe(true)
    }
  })
})

describe('unmatchBankBatch — dubbel-unmatch blockeras', () => {
  it('Andra anropet returnerar VALIDATION_ERROR (batch redan cancelled)', () => {
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const bulk = payInvoicesBulk(ctx.db, {
      payments: [{ invoice_id: i1.invoiceId, amount_ore: 100_00 }],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 0,
    })
    expect(bulk.success).toBe(true)
    if (!bulk.success) return
    const batchId = bulk.data.batch_id!

    const first = unmatchBankBatch(ctx.db, { batch_id: batchId })
    expect(first.success).toBe(true)

    const second = unmatchBankBatch(ctx.db, { batch_id: batchId })
    expect(second.success).toBe(false)
    if (second.success) return
    expect(second.code).toBe('VALIDATION_ERROR')
    expect(second.error).toContain('redan ångrad')
  })
})

describe('unmatchBankBatch — not-found batchId', () => {
  it('Okänt batch_id → NOT_FOUND', () => {
    const result = unmatchBankBatch(ctx.db, { batch_id: 999 })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('NOT_FOUND')
  })
})

describe('unmatchBankBatch — TX-status flippas om bank-TX matchad', () => {
  it('Batch-payment matchad till bank-TX → TX-status blir unmatched', () => {
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const bulk = payInvoicesBulk(ctx.db, {
      payments: [{ invoice_id: i1.invoiceId, amount_ore: 100_00 }],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 0,
    })
    expect(bulk.success).toBe(true)
    if (!bulk.success) return

    // Matcha bank-TX → batch-payment manuellt via att lägga en
    // reconciliation-rad direkt (tvärtom den vanliga matchBankTransaction-
    // flödet som bokför ny payment; vi har redan en payment)
    const [bankTxId] = seedBankStatement(ctx, [100_00])
    const paymentRow = ctx.db
      .prepare('SELECT id FROM invoice_payments WHERE payment_batch_id = ?')
      .get(bulk.data.batch_id!) as { id: number }
    ctx.db
      .prepare(
        `INSERT INTO bank_reconciliation_matches (
          bank_transaction_id, matched_entity_type, matched_entity_id,
          invoice_payment_id, expense_payment_id, fee_journal_entry_id,
          match_method
        ) VALUES (?, 'invoice', ?, ?, NULL, NULL, 'manual')`,
      )
      .run(bankTxId, i1.invoiceId, paymentRow.id)
    ctx.db
      .prepare(
        `UPDATE bank_transactions SET reconciliation_status = 'matched' WHERE id = ?`,
      )
      .run(bankTxId)

    const result = unmatchBankBatch(ctx.db, { batch_id: bulk.data.batch_id! })
    expect(result.success).toBe(true)

    const tx = ctx.db
      .prepare(
        'SELECT reconciliation_status FROM bank_transactions WHERE id = ?',
      )
      .get(bankTxId) as { reconciliation_status: string }
    expect(tx.reconciliation_status).toBe('unmatched')
  })
})

describe('unmatchBankBatch — enskild unmatch av batch-payment blockeras fortfarande', () => {
  it('unmatchBankTransaction på en batch-betald TX → BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED', () => {
    const i1 = seedInvoiceNoVat(ctx, 100_00)
    const bulk = payInvoicesBulk(ctx.db, {
      payments: [{ invoice_id: i1.invoiceId, amount_ore: 100_00 }],
      payment_date: '2026-03-15',
      account_number: '1930',
      bank_fee_ore: 0,
    })
    expect(bulk.success).toBe(true)
    if (!bulk.success) return

    // Matcha TX till batch-payment
    const [bankTxId] = seedBankStatement(ctx, [100_00])
    const paymentRow = ctx.db
      .prepare('SELECT id FROM invoice_payments WHERE payment_batch_id = ?')
      .get(bulk.data.batch_id!) as { id: number }
    ctx.db
      .prepare(
        `INSERT INTO bank_reconciliation_matches (
          bank_transaction_id, matched_entity_type, matched_entity_id,
          invoice_payment_id, expense_payment_id, fee_journal_entry_id,
          match_method
        ) VALUES (?, 'invoice', ?, ?, NULL, NULL, 'manual')`,
      )
      .run(bankTxId, i1.invoiceId, paymentRow.id)
    ctx.db
      .prepare(
        `UPDATE bank_transactions SET reconciliation_status = 'matched' WHERE id = ?`,
      )
      .run(bankTxId)

    const result = unmatchBankTransaction(ctx.db, {
      bank_transaction_id: bankTxId,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED')
  })
})

// avoid unused-import warning
void matchBankTransaction
