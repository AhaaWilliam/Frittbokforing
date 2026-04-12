/**
 * Sprint 12 — Bank Fee on Payments
 *
 * Tests for bank_fee_ore on both invoice and expense payments.
 * Verifies journal entry balance, paid_amount isolation, dashboard,
 * VAT report, and interaction with öresutjämning.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import {
  type SystemTestContext,
  createTemplateDb,
  destroyTemplateDb,
  createSystemTestContext,
  destroyContext,
  seedAndFinalizeInvoice,
  seedAndFinalizeExpense,
} from './helpers/system-test-context'
import { PayInvoiceInputSchema, PayExpenseInputSchema } from '../../src/shared/ipc-schemas'

let ctx: SystemTestContext

beforeAll(() => createTemplateDb())
afterAll(() => destroyTemplateDb())
beforeEach(() => { ctx = createSystemTestContext() })
afterEach(() => destroyContext(ctx))

// ── Helpers ──────────────────────────────────────────────────────

function getJournalLines(journalEntryId: number) {
  return ctx.db
    .prepare(
      `SELECT account_number, debit_ore, credit_ore
       FROM journal_entry_lines
       WHERE journal_entry_id = ?
       ORDER BY line_number`,
    )
    .all(journalEntryId) as {
      account_number: string
      debit_ore: number
      credit_ore: number
    }[]
}

function sumDebit(lines: { debit_ore: number }[]) {
  return lines.reduce((s, l) => s + l.debit_ore, 0)
}

function sumCredit(lines: { credit_ore: number }[]) {
  return lines.reduce((s, l) => s + l.credit_ore, 0)
}

// ── Invoice — bank fee ──────────────────────────────────────────

describe('payInvoice with bank_fee_ore', () => {
  it('fee=0 → identical to existing flow (2 lines)', () => {
    const { invoiceId } = seedAndFinalizeInvoice(ctx)
    const inv = ctx.db
      .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
      .get(invoiceId) as { total_amount_ore: number }

    const result = ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: invoiceId,
      amount: inv.total_amount_ore,
      payment_date: '2026-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
      bank_fee_ore: 0,
    })
    expect(result.success).toBe(true)

    const lines = getJournalLines(result.data!.payment.journal_entry_id)
    expect(lines).toHaveLength(2) // bank debit + receivables credit
    expect(sumDebit(lines)).toBe(sumCredit(lines))
    expect(result.data!.payment.bank_fee_ore).toBeNull()
    expect(result.data!.payment.bank_fee_account).toBeNull()
  })

  it('fee>0 → 3 lines, 6570 with correct amount, balance OK', () => {
    const { invoiceId } = seedAndFinalizeInvoice(ctx)
    const inv = ctx.db
      .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
      .get(invoiceId) as { total_amount_ore: number }

    const feeOre = 2500 // 25 kr
    const result = ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: invoiceId,
      amount: inv.total_amount_ore,
      payment_date: '2026-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
      bank_fee_ore: feeOre,
    })
    expect(result.success).toBe(true)

    const lines = getJournalLines(result.data!.payment.journal_entry_id)
    expect(lines).toHaveLength(3)
    expect(sumDebit(lines)).toBe(sumCredit(lines))

    // Bank debit = payment - fee
    const bankLine = lines.find((l) => l.account_number === '1930')!
    expect(bankLine.debit_ore).toBe(inv.total_amount_ore - feeOre)

    // Fee debit on 6570
    const feeLine = lines.find((l) => l.account_number === '6570')!
    expect(feeLine.debit_ore).toBe(feeOre)

    // Receivables credit = full payment
    const recLine = lines.find((l) => l.account_number === '1510')!
    expect(recLine.credit_ore).toBe(inv.total_amount_ore)

    // Payment record
    expect(result.data!.payment.bank_fee_ore).toBe(feeOre)
    expect(result.data!.payment.bank_fee_account).toBe('6570')
  })

  it('fee >= amount → validation error', () => {
    const { invoiceId } = seedAndFinalizeInvoice(ctx)
    const inv = ctx.db
      .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
      .get(invoiceId) as { total_amount_ore: number }

    const result = ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: invoiceId,
      amount: inv.total_amount_ore,
      payment_date: '2026-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
      bank_fee_ore: inv.total_amount_ore,
    })
    expect(result.success).toBe(false)
    expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('paid_amount increases by amount, NOT amount + fee', () => {
    const { invoiceId } = seedAndFinalizeInvoice(ctx, {
      lines: [
        {
          product_id: null,
          description: 'Tjänst',
          quantity: 1,
          unit_price_ore: 100000, // 1000 kr → 1250 kr with 25% VAT
          vat_code_id: ctx.db
            .prepare("SELECT id FROM vat_codes WHERE code = 'MP1' LIMIT 1")
            .get()!.id as number,
          account_number: '3002',
        },
      ],
    })
    const inv = ctx.db
      .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
      .get(invoiceId) as { total_amount_ore: number }

    // Pay half with fee
    const halfAmount = Math.floor(inv.total_amount_ore / 2)
    const feeOre = 1500

    const result = ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: invoiceId,
      amount: halfAmount,
      payment_date: '2026-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
      bank_fee_ore: feeOre,
    })
    expect(result.success).toBe(true)

    const updated = ctx.db
      .prepare('SELECT paid_amount, status FROM invoices WHERE id = ?')
      .get(invoiceId) as { paid_amount: number; status: string }
    expect(updated.paid_amount).toBe(halfAmount) // NOT halfAmount + feeOre
    expect(updated.status).toBe('partial')
  })
})

// ── Expense — bank fee ──────────────────────────────────────────

describe('payExpense with bank_fee_ore', () => {
  it('fee=0 → identical to existing flow (2 lines)', () => {
    const { expenseId } = seedAndFinalizeExpense(ctx)
    const exp = ctx.db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(expenseId) as { total_amount_ore: number }

    const result = ctx.expenseService.payExpense(ctx.db, {
      expense_id: expenseId,
      amount: exp.total_amount_ore,
      payment_date: '2026-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
      bank_fee_ore: 0,
    })
    expect(result.success).toBe(true)

    const lines = getJournalLines(result.data!.payment.journal_entry_id)
    expect(lines).toHaveLength(2) // payables debit + bank credit
    expect(sumDebit(lines)).toBe(sumCredit(lines))
    expect(result.data!.payment.bank_fee_ore).toBeNull()
    expect(result.data!.payment.bank_fee_account).toBeNull()
  })

  it('fee>0 → 3 lines, 6570 debit, bank credit includes fee', () => {
    const { expenseId } = seedAndFinalizeExpense(ctx)
    const exp = ctx.db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(expenseId) as { total_amount_ore: number }

    const feeOre = 2500
    const result = ctx.expenseService.payExpense(ctx.db, {
      expense_id: expenseId,
      amount: exp.total_amount_ore,
      payment_date: '2026-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
      bank_fee_ore: feeOre,
    })
    expect(result.success).toBe(true)

    const lines = getJournalLines(result.data!.payment.journal_entry_id)
    expect(lines).toHaveLength(3)
    expect(sumDebit(lines)).toBe(sumCredit(lines))

    // Payables debit = full amount
    const payLine = lines.find((l) => l.account_number === '2440')!
    expect(payLine.debit_ore).toBe(exp.total_amount_ore)

    // Fee debit on 6570
    const feeLine = lines.find((l) => l.account_number === '6570')!
    expect(feeLine.debit_ore).toBe(feeOre)

    // Bank credit = payment + fee
    const bankLine = lines.find((l) => l.account_number === '1930')!
    expect(bankLine.credit_ore).toBe(exp.total_amount_ore + feeOre)

    expect(result.data!.payment.bank_fee_ore).toBe(feeOre)
    expect(result.data!.payment.bank_fee_account).toBe('6570')
  })

  it('fee >= amount → validation error', () => {
    const { expenseId } = seedAndFinalizeExpense(ctx)
    const exp = ctx.db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(expenseId) as { total_amount_ore: number }

    const result = ctx.expenseService.payExpense(ctx.db, {
      expense_id: expenseId,
      amount: exp.total_amount_ore,
      payment_date: '2026-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
      bank_fee_ore: exp.total_amount_ore,
    })
    expect(result.success).toBe(false)
    expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('paid_amount increases by amount, NOT amount + fee', () => {
    const { expenseId } = seedAndFinalizeExpense(ctx)
    const exp = ctx.db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(expenseId) as { total_amount_ore: number }

    const halfAmount = Math.floor(exp.total_amount_ore / 2)
    const feeOre = 1500

    const result = ctx.expenseService.payExpense(ctx.db, {
      expense_id: expenseId,
      amount: halfAmount,
      payment_date: '2026-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
      bank_fee_ore: feeOre,
    })
    expect(result.success).toBe(true)

    const updated = ctx.db
      .prepare('SELECT paid_amount, status FROM expenses WHERE id = ?')
      .get(expenseId) as { paid_amount: number; status: string }
    expect(updated.paid_amount).toBe(halfAmount)
    expect(updated.status).toBe('partial')
  })
})

// ── Öresutjämning + fee ─────────────────────────────────────────

describe('Öresutjämning + bank fee combined', () => {
  it('invoice: rounding + fee → balance OK, paid_amount = remaining', () => {
    const { invoiceId } = seedAndFinalizeInvoice(ctx)
    const inv = ctx.db
      .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
      .get(invoiceId) as { total_amount_ore: number }

    // Pay 30 öre less than total → triggers rounding
    const payAmount = inv.total_amount_ore - 30
    const feeOre = 500

    const result = ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: invoiceId,
      amount: payAmount,
      payment_date: '2026-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
      bank_fee_ore: feeOre,
    })
    expect(result.success).toBe(true)

    const lines = getJournalLines(result.data!.payment.journal_entry_id)
    expect(sumDebit(lines)).toBe(sumCredit(lines))

    // Rounding creates a 3740 debit for the 30 öre shortfall
    const roundingLine = lines.find((l) => l.account_number === '3740')
    expect(roundingLine).toBeDefined()
    expect(roundingLine!.debit_ore).toBe(30)

    // Invoice should be fully paid (rounding closed the gap)
    const updated = ctx.db
      .prepare('SELECT paid_amount, status FROM invoices WHERE id = ?')
      .get(invoiceId) as { paid_amount: number; status: string }
    expect(updated.status).toBe('paid')
    expect(updated.paid_amount).toBe(inv.total_amount_ore) // remaining, not payAmount
  })

  it('expense: rounding + fee → balance OK', () => {
    const { expenseId } = seedAndFinalizeExpense(ctx)
    const exp = ctx.db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(expenseId) as { total_amount_ore: number }

    // Pay 20 öre less → triggers rounding
    const payAmount = exp.total_amount_ore - 20
    const feeOre = 800

    const result = ctx.expenseService.payExpense(ctx.db, {
      expense_id: expenseId,
      amount: payAmount,
      payment_date: '2026-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
      bank_fee_ore: feeOre,
    })
    expect(result.success).toBe(true)

    const lines = getJournalLines(result.data!.payment.journal_entry_id)
    expect(sumDebit(lines)).toBe(sumCredit(lines))

    const updated = ctx.db
      .prepare('SELECT paid_amount, status FROM expenses WHERE id = ?')
      .get(expenseId) as { paid_amount: number; status: string }
    expect(updated.status).toBe('paid')
  })
})

// ── Regression: no fee → unchanged behavior ─────────────────────

describe('Regression: payments without fee', () => {
  it('invoice payment without bank_fee_ore field → works identically', () => {
    const { invoiceId } = seedAndFinalizeInvoice(ctx)
    const inv = ctx.db
      .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
      .get(invoiceId) as { total_amount_ore: number }

    const result = ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: invoiceId,
      amount: inv.total_amount_ore,
      payment_date: '2026-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
      // bank_fee_ore intentionally omitted
    })
    expect(result.success).toBe(true)
    const lines = getJournalLines(result.data!.payment.journal_entry_id)
    expect(lines).toHaveLength(2)
    expect(sumDebit(lines)).toBe(sumCredit(lines))
    expect(result.data!.payment.bank_fee_ore).toBeNull()
  })

  it('expense payment without bank_fee_ore field → works identically', () => {
    const { expenseId } = seedAndFinalizeExpense(ctx)
    const exp = ctx.db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(expenseId) as { total_amount_ore: number }

    const result = ctx.expenseService.payExpense(ctx.db, {
      expense_id: expenseId,
      amount: exp.total_amount_ore,
      payment_date: '2026-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(true)
    const lines = getJournalLines(result.data!.payment.journal_entry_id)
    expect(lines).toHaveLength(2)
    expect(sumDebit(lines)).toBe(sumCredit(lines))
    expect(result.data!.payment.bank_fee_ore).toBeNull()
  })
})

// ── Dashboard regression ────────────────────────────────────────

describe('Dashboard regression with bank fee', () => {
  it('unpaidReceivablesOre decreases by amount, not amount + fee', () => {
    const { invoiceId } = seedAndFinalizeInvoice(ctx)
    const inv = ctx.db
      .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
      .get(invoiceId) as { total_amount_ore: number }

    const before = ctx.dashboardService.getDashboardSummary(
      ctx.db,
      ctx.seed.fiscalYearId,
    )

    const feeOre = 2500
    ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: invoiceId,
      amount: inv.total_amount_ore,
      payment_date: '2026-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
      bank_fee_ore: feeOre,
    })

    const after = ctx.dashboardService.getDashboardSummary(
      ctx.db,
      ctx.seed.fiscalYearId,
    )

    // Receivables decrease by the invoice amount, not by amount + fee
    expect(before.unpaidReceivablesOre - after.unpaidReceivablesOre).toBe(
      inv.total_amount_ore,
    )
  })
})

// ── VAT regression ──────────────────────────────────────────────

describe('VAT report regression with bank fee', () => {
  it('bank fee on 6570 does not appear in VAT report output', () => {
    const { invoiceId } = seedAndFinalizeInvoice(ctx)
    const inv = ctx.db
      .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
      .get(invoiceId) as { total_amount_ore: number }

    const vatBefore = ctx.vatReportService.getVatReport(
      ctx.db,
      ctx.seed.fiscalYearId,
    )

    ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: invoiceId,
      amount: inv.total_amount_ore,
      payment_date: '2026-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
      bank_fee_ore: 5000,
    })

    const vatAfter = ctx.vatReportService.getVatReport(
      ctx.db,
      ctx.seed.fiscalYearId,
    )

    // VAT report should be identical — bank fees have no VAT impact
    expect(vatAfter.totalVatOre).toBe(vatBefore.totalVatOre)
  })
})

// ── Zod schema validation ───────────────────────────────────────

describe('Zod schema: bank_fee_ore validation', () => {
  const validInvoicePayment = {
    invoice_id: 1,
    amount: 100000,
    payment_date: '2026-03-20',
    payment_method: 'bankgiro' as const,
    account_number: '1930',
  }

  const validExpensePayment = {
    expense_id: 1,
    amount: 100000,
    payment_date: '2026-03-20',
    payment_method: 'bankgiro' as const,
    account_number: '1930',
  }

  it('invoice: accepts omitted bank_fee_ore', () => {
    expect(PayInvoiceInputSchema.safeParse(validInvoicePayment).success).toBe(true)
  })

  it('invoice: accepts bank_fee_ore = 0', () => {
    expect(
      PayInvoiceInputSchema.safeParse({ ...validInvoicePayment, bank_fee_ore: 0 }).success,
    ).toBe(true)
  })

  it('invoice: accepts positive bank_fee_ore', () => {
    expect(
      PayInvoiceInputSchema.safeParse({ ...validInvoicePayment, bank_fee_ore: 2500 }).success,
    ).toBe(true)
  })

  it('invoice: rejects negative bank_fee_ore', () => {
    expect(
      PayInvoiceInputSchema.safeParse({ ...validInvoicePayment, bank_fee_ore: -1 }).success,
    ).toBe(false)
  })

  it('invoice: rejects non-integer bank_fee_ore', () => {
    expect(
      PayInvoiceInputSchema.safeParse({ ...validInvoicePayment, bank_fee_ore: 25.5 }).success,
    ).toBe(false)
  })

  it('invoice: rejects string bank_fee_ore', () => {
    expect(
      PayInvoiceInputSchema.safeParse({ ...validInvoicePayment, bank_fee_ore: '2500' }).success,
    ).toBe(false)
  })

  it('expense: accepts omitted bank_fee_ore', () => {
    expect(PayExpenseInputSchema.safeParse(validExpensePayment).success).toBe(true)
  })

  it('expense: accepts positive bank_fee_ore', () => {
    expect(
      PayExpenseInputSchema.safeParse({ ...validExpensePayment, bank_fee_ore: 2500 }).success,
    ).toBe(true)
  })

  it('expense: rejects negative bank_fee_ore', () => {
    expect(
      PayExpenseInputSchema.safeParse({ ...validExpensePayment, bank_fee_ore: -1 }).success,
    ).toBe(false)
  })
})
