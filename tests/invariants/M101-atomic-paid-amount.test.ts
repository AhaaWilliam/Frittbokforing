import { describe, it, expect } from 'vitest'
import { createTestDb } from '../helpers/create-test-db'
import { createCompany } from '../../src/main/services/company-service'
import { createCounterparty } from '../../src/main/services/counterparty-service'
import {
  saveDraft,
  finalizeDraft,
  payInvoice,
} from '../../src/main/services/invoice-service'
import {
  saveExpenseDraft,
  finalizeExpense,
  payExpense,
} from '../../src/main/services/expense-service'

/**
 * M101 — Atomär paid_amount på båda sidor (invoices + expenses).
 *
 * Efter varje payInvoice/payExpense: `paid_amount_ore` speglar exakt
 * `SUM(payments.amount_ore)`. Ingen LEFT JOIN-subquery i read-paths.
 */

function ok<T>(
  r:
    | { success: true; data: T }
    | { success: false; error: string; code?: string },
): T {
  if (!r.success) throw new Error(`${r.code}: ${r.error}`)
  return r.data
}

function seed(type: 'customer' | 'supplier') {
  const db = createTestDb()
  ok(
    createCompany(db, {
      name: 'Test AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2',
      share_capital: 2_500_000,
      registration_date: '2025-01-15',
      fiscal_year_start: '2026-01-01',
      fiscal_year_end: '2026-12-31',
    }),
  )
  const companyId = (
    db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: number }
  ).id
  const fyId = (
    db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  ).id
  const cp = ok(
    createCounterparty(db, { company_id: companyId, name: 'Part AB', type }),
  )
  return { db, fyId, cpId: cp.id }
}

describe('M101 — atomär paid_amount_ore (invoices)', () => {
  it('efter delbetalning = SUM(payments)', () => {
    const { db, fyId, cpId } = seed('customer')
    const inv = ok(
      saveDraft(db, {
        fiscal_year_id: fyId,
        counterparty_id: cpId,
        invoice_date: '2026-02-01',
        due_date: '2026-03-01',
        lines: [
          {
            product_id: null,
            description: 'P',
            quantity: 1,
            unit_price_ore: 100000,
            vat_code_id: 5,
            sort_order: 0,
            account_number: '3001',
          },
        ],
      }),
    )
    ok(finalizeDraft(db, inv.id))
    ok(
      payInvoice(db, {
        invoice_id: inv.id,
        amount_ore: 30000,
        payment_date: '2026-02-15',
        payment_method: 'bank',
        account_number: '1930',
      }),
    )
    ok(
      payInvoice(db, {
        invoice_id: inv.id,
        amount_ore: 20000,
        payment_date: '2026-02-20',
        payment_method: 'bank',
        account_number: '1930',
      }),
    )
    const row = db
      .prepare(
        `SELECT paid_amount_ore,
          (SELECT COALESCE(SUM(amount_ore),0) FROM invoice_payments WHERE invoice_id = ?) AS sum
         FROM invoices WHERE id = ?`,
      )
      .get(inv.id, inv.id) as { paid_amount_ore: number; sum: number }
    expect(row.paid_amount_ore).toBe(row.sum)
    expect(row.paid_amount_ore).toBe(50000)
  })

  it('status uppdateras atomärt: partial efter delbetalning, paid efter full', () => {
    const { db, fyId, cpId } = seed('customer')
    const inv = ok(
      saveDraft(db, {
        fiscal_year_id: fyId,
        counterparty_id: cpId,
        invoice_date: '2026-02-01',
        due_date: '2026-03-01',
        lines: [
          {
            product_id: null,
            description: 'P',
            quantity: 1,
            unit_price_ore: 100000,
            vat_code_id: 5,
            sort_order: 0,
            account_number: '3001',
          },
        ],
      }),
    )
    ok(finalizeDraft(db, inv.id))

    const total = (
      db
        .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
        .get(inv.id) as { total_amount_ore: number }
    ).total_amount_ore
    // Delbetala ca 60% — oberoende av exakt total
    ok(
      payInvoice(db, {
        invoice_id: inv.id,
        amount_ore: Math.floor(total * 0.6),
        payment_date: '2026-02-15',
        payment_method: 'bank',
        account_number: '1930',
      }),
    )
    let status = (
      db
        .prepare('SELECT status FROM invoices WHERE id = ?')
        .get(inv.id) as { status: string }
    ).status
    expect(status).toBe('partial')

    // Hämta faktiska totalen och betala fullt upp
    const row1 = db
      .prepare(
        'SELECT total_amount_ore, paid_amount_ore FROM invoices WHERE id = ?',
      )
      .get(inv.id) as { total_amount_ore: number; paid_amount_ore: number }
    const remaining = row1.total_amount_ore - row1.paid_amount_ore
    ok(
      payInvoice(db, {
        invoice_id: inv.id,
        amount_ore: remaining,
        payment_date: '2026-02-20',
        payment_method: 'bank',
        account_number: '1930',
      }),
    )
    const row2 = db
      .prepare(
        'SELECT status, paid_amount_ore, total_amount_ore FROM invoices WHERE id = ?',
      )
      .get(inv.id) as {
      status: string
      paid_amount_ore: number
      total_amount_ore: number
    }
    expect(row2.paid_amount_ore).toBe(row2.total_amount_ore)
    expect(row2.status).toBe('paid')
  })
})

describe('M101 — atomär paid_amount_ore (expenses)', () => {
  it('expenses speglar samma invariant', () => {
    const { db, fyId, cpId } = seed('supplier')
    const exp = ok(
      saveExpenseDraft(db, {
        fiscal_year_id: fyId,
        counterparty_id: cpId,
        expense_date: '2026-02-01',
        due_date: '2026-03-01',
        description: 'Matinköp',
        lines: [
          {
            description: 'Mat',
            quantity: 1,
            unit_price_ore: 50000,
            vat_code_id: 5,
            sort_order: 0,
            account_number: '6110',
          },
        ],
      }),
    )
    ok(finalizeExpense(db, exp.id))
    const pre = db
      .prepare(
        'SELECT total_amount_ore, paid_amount_ore FROM expenses WHERE id = ?',
      )
      .get(exp.id) as { total_amount_ore: number; paid_amount_ore: number }
    ok(
      payExpense(db, {
        expense_id: exp.id,
        amount_ore: pre.total_amount_ore - pre.paid_amount_ore,
        payment_date: '2026-02-15',
        payment_method: 'bank',
        account_number: '1930',
      }),
    )
    const row = db
      .prepare(
        `SELECT paid_amount_ore, total_amount_ore, status FROM expenses WHERE id = ?`,
      )
      .get(exp.id) as {
      paid_amount_ore: number
      total_amount_ore: number
      status: string
    }
    expect(row.paid_amount_ore).toBe(row.total_amount_ore)
    expect(row.status).toBe('paid')
  })
})
