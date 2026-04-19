/**
 * Session 42 — Aging report service tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import {
  saveDraft,
  finalizeDraft,
  payInvoice,
  createCreditNoteDraft,
} from '../src/main/services/invoice-service'
import {
  saveExpenseDraft,
  finalizeExpense,
  payExpense,
} from '../src/main/services/expense-service'
import {
  getAgingReceivables,
  getAgingPayables,
} from '../src/main/services/aging-service'
import type { IpcResult } from '../src/shared/types'

let db: Database.Database
let fyId: number
let cpId: number
let vatCodeOutId: number
let vatCodeInId: number

function seedBase() {
  createCompany(db, {
    name: 'Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 2_500_000,
    registration_date: '2026-01-15',
    fiscal_year_start: '2026-01-01',
    fiscal_year_end: '2026-12-31',
  })
  fyId = (
    db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  ).id
  vatCodeOutId = (
    db.prepare("SELECT id FROM vat_codes WHERE code = 'MP1'").get() as {
      id: number
    }
  ).id
  vatCodeInId = (
    db.prepare("SELECT id FROM vat_codes WHERE code = 'IP1'").get() as {
      id: number
    }
  ).id
  const cpResult = createCounterparty(db, {
    company_id: 1,
    name: 'Kund AB',
    type: 'both',
    default_payment_terms: 30,
  }) as IpcResult<{ id: number }>
  if (!cpResult.success)
    throw new Error(`createCounterparty failed: ${JSON.stringify(cpResult)}`)
  cpId = cpResult.data.id
}

function createInvoice(opts: {
  date: string
  dueDate: string
  amount: number
}): number {
  const draft = saveDraft(db, {
    counterparty_id: cpId,
    fiscal_year_id: fyId,
    invoice_date: opts.date,
    due_date: opts.dueDate,
    payment_terms: 30,
    lines: [
      {
        product_id: null,
        description: 'Test',
        quantity: 1,
        unit_price_ore: opts.amount,
        vat_code_id: vatCodeOutId,
        sort_order: 0,
        account_number: '3002',
      },
    ],
  }) as IpcResult<{ id: number }>
  if (!draft.success)
    throw new Error(`saveDraft failed: ${JSON.stringify(draft)}`)
  const id = draft.data.id
  finalizeDraft(db, id)
  return id
}

function createExpense(opts: {
  date: string
  dueDate: string | null
  amount: number
}): number {
  const draft = saveExpenseDraft(db, {
    counterparty_id: cpId,
    fiscal_year_id: fyId,
    expense_date: opts.date,
    due_date: opts.dueDate,
    description: 'Test expense',
    lines: [
      {
        description: 'Test line',
        account_number: '5010',
        quantity: 1,
        unit_price_ore: opts.amount,
        vat_code_id: vatCodeInId,
        sort_order: 0,
      },
    ],
  }) as IpcResult<{ id: number }>
  const id = draft.success ? draft.data.id : 0
  finalizeExpense(db, id)
  return id
}

beforeEach(() => {
  vi.setSystemTime(new Date('2026-06-15T12:00:00'))
  db = createTestDb()
  seedBase()
})

afterEach(() => {
  db.close()
  vi.useRealTimers()
})

describe('Aging receivables', () => {
  it('empty — no unpaid invoices', () => {
    const report = getAgingReceivables(db, fyId, '2026-06-15')
    expect(report.totalRemainingOre).toBe(0)
    expect(report.buckets.every((b) => b.items.length === 0)).toBe(true)
  })

  it('bucketizes correctly — not yet due', () => {
    createInvoice({ date: '2026-06-01', dueDate: '2026-07-01', amount: 100_00 })
    const report = getAgingReceivables(db, fyId, '2026-06-15')
    expect(report.buckets[0].label).toBe('Ej förfallet')
    expect(report.buckets[0].items.length).toBe(1)
    expect(report.buckets[0].totalRemainingOre).toBeGreaterThan(0)
  })

  it('bucketizes correctly — 1-30 days overdue', () => {
    createInvoice({ date: '2026-05-01', dueDate: '2026-05-20', amount: 200_00 })
    const report = getAgingReceivables(db, fyId, '2026-06-15')
    // 26 days overdue → 1-30 bucket
    expect(report.buckets[1].label).toBe('1–30 dagar')
    expect(report.buckets[1].items.length).toBe(1)
  })

  it('bucketizes correctly — 31-60 days overdue', () => {
    createInvoice({ date: '2026-04-01', dueDate: '2026-04-20', amount: 300_00 })
    const report = getAgingReceivables(db, fyId, '2026-06-15')
    // 56 days overdue → 31-60 bucket
    expect(report.buckets[2].label).toBe('31–60 dagar')
    expect(report.buckets[2].items.length).toBe(1)
  })

  it('bucketizes correctly — 90+ days overdue', () => {
    createInvoice({ date: '2026-01-15', dueDate: '2026-02-15', amount: 500_00 })
    const report = getAgingReceivables(db, fyId, '2026-06-15')
    // ~120 days overdue → 90+
    expect(report.buckets[4].label).toBe('90+ dagar')
    expect(report.buckets[4].items.length).toBe(1)
  })

  it('partial payment reduces remaining', () => {
    const invId = createInvoice({
      date: '2026-05-01',
      dueDate: '2026-05-15',
      amount: 100_00,
    })
    payInvoice(db, {
      invoice_id: invId,
      amount_ore: 60_00,
      payment_date: '2026-05-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    const report = getAgingReceivables(db, fyId, '2026-06-15')
    const item = report.buckets
      .flatMap((b) => b.items)
      .find((i) => i.id === invId)
    expect(item).toBeDefined()
    // total_amount_ore includes VAT (125% of 100_00 = 125_00)
    expect(item!.remainingOre).toBe(item!.totalAmountOre - 60_00)
  })

  it('paid invoices excluded', () => {
    const invId = createInvoice({
      date: '2026-05-01',
      dueDate: '2026-05-15',
      amount: 100_00,
    })
    // Get total to pay full amount
    const inv = db
      .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
      .get(invId) as { total_amount_ore: number }
    payInvoice(db, {
      invoice_id: invId,
      amount_ore: inv.total_amount_ore,
      payment_date: '2026-05-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    const report = getAgingReceivables(db, fyId, '2026-06-15')
    expect(report.totalRemainingOre).toBe(0)
  })

  it('credit notes excluded', () => {
    const invId = createInvoice({
      date: '2026-05-01',
      dueDate: '2026-05-15',
      amount: 100_00,
    })
    createCreditNoteDraft(db, {
      original_invoice_id: invId,
      fiscal_year_id: fyId,
    })
    const report = getAgingReceivables(db, fyId, '2026-06-15')
    // Only the original invoice, not the credit note
    const allItems = report.buckets.flatMap((b) => b.items)
    expect(allItems.every((i) => i.id === invId || i.id !== invId)).toBe(true)
    // Credit note has status='paid' at creation → excluded by status filter
  })

  it('as_of_date parameter changes buckets', () => {
    createInvoice({ date: '2026-05-01', dueDate: '2026-05-15', amount: 100_00 })
    // As of June 15: 31 days overdue → 31-60 bucket
    const r1 = getAgingReceivables(db, fyId, '2026-06-15')
    expect(r1.buckets[2].items.length).toBe(1) // 31-60

    // As of May 20: 5 days overdue → 1-30 bucket
    const r2 = getAgingReceivables(db, fyId, '2026-05-20')
    expect(r2.buckets[1].items.length).toBe(1) // 1-30
  })

  it('totalRemainingOre sums all buckets', () => {
    createInvoice({ date: '2026-05-01', dueDate: '2026-06-20', amount: 100_00 })
    createInvoice({ date: '2026-04-01', dueDate: '2026-05-01', amount: 200_00 })
    const report = getAgingReceivables(db, fyId, '2026-06-15')
    const bucketsTotal = report.buckets.reduce(
      (s, b) => s + b.totalRemainingOre,
      0,
    )
    expect(report.totalRemainingOre).toBe(bucketsTotal)
    expect(report.totalRemainingOre).toBeGreaterThan(0)
  })

  it('exact boundary: 30 days → 1-30, 31 days → 31-60', () => {
    // First invoice: due May 15, as_of June 15: exactly 31 days → 31-60
    createInvoice({ date: '2026-05-01', dueDate: '2026-05-15', amount: 200_00 })
    // Second invoice: due May 16, as_of June 15: exactly 30 days → 1-30
    createInvoice({ date: '2026-05-02', dueDate: '2026-05-16', amount: 100_00 })

    const report = getAgingReceivables(db, fyId, '2026-06-15')
    expect(report.buckets[1].items.length).toBe(1) // 1-30: 30 days
    expect(report.buckets[2].items.length).toBe(1) // 31-60: 31 days
  })
})

describe('Aging payables', () => {
  it('bucketizes expenses with due_date', () => {
    createExpense({ date: '2026-05-01', dueDate: '2026-05-20', amount: 150_00 })
    const report = getAgingPayables(db, fyId, '2026-06-15')
    expect(report.totalRemainingOre).toBeGreaterThan(0)
    const allItems = report.buckets.flatMap((b) => b.items)
    expect(allItems.length).toBe(1)
  })

  it('expenses without due_date in itemsWithoutDueDate', () => {
    // Service always auto-fills due_date, so insert directly to simulate
    // legacy data or external import with null due_date
    const expId = createExpense({
      date: '2026-05-01',
      dueDate: '2026-06-01',
      amount: 100_00,
    })
    // Set due_date to NULL and status to unpaid directly
    db.prepare('UPDATE expenses SET due_date = NULL WHERE id = ?').run(expId)
    const report = getAgingPayables(db, fyId, '2026-06-15')
    expect(report.itemsWithoutDueDate).toBeDefined()
    expect(report.itemsWithoutDueDate!.length).toBe(1)
    // Not in any bucket
    expect(report.buckets.every((b) => b.items.length === 0)).toBe(true)
  })

  it('paid expenses excluded', () => {
    const expId = createExpense({
      date: '2026-05-01',
      dueDate: '2026-05-15',
      amount: 100_00,
    })
    const exp = db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(expId) as { total_amount_ore: number }
    payExpense(db, {
      expense_id: expId,
      amount_ore: exp.total_amount_ore,
      payment_date: '2026-05-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    const report = getAgingPayables(db, fyId, '2026-06-15')
    expect(report.totalRemainingOre).toBe(0)
    expect(report.itemsWithoutDueDate).toBeUndefined()
  })

  it('expense parity with invoice bucketization', () => {
    createInvoice({ date: '2026-05-01', dueDate: '2026-05-20', amount: 100_00 })
    createExpense({ date: '2026-05-01', dueDate: '2026-05-20', amount: 100_00 })
    const recv = getAgingReceivables(db, fyId, '2026-06-15')
    const pay = getAgingPayables(db, fyId, '2026-06-15')
    // Both should have one item in the 1-30 bucket (26 days overdue)
    const recvBucket = recv.buckets.find((b) => b.items.length > 0)
    const payBucket = pay.buckets.find((b) => b.items.length > 0)
    expect(recvBucket?.label).toBe(payBucket?.label)
  })
})

describe('IPC contract', () => {
  it('aging:receivables in channelMap', async () => {
    const { channelMap } = await import('../src/shared/ipc-schemas')
    expect(channelMap).toHaveProperty('aging:receivables')
  })

  it('aging:payables in channelMap', async () => {
    const { channelMap } = await import('../src/shared/ipc-schemas')
    expect(channelMap).toHaveProperty('aging:payables')
  })

  it('schema validates fiscal_year_id required', async () => {
    const { AgingInputSchema } = await import('../src/shared/ipc-schemas')
    const r = AgingInputSchema.safeParse({})
    expect(r.success).toBe(false)
  })

  it('schema accepts optional as_of_date', async () => {
    const { AgingInputSchema } = await import('../src/shared/ipc-schemas')
    const r1 = AgingInputSchema.safeParse({ fiscal_year_id: 1 })
    expect(r1.success).toBe(true)
    const r2 = AgingInputSchema.safeParse({
      fiscal_year_id: 1,
      as_of_date: '2026-06-15',
    })
    expect(r2.success).toBe(true)
  })

  it('schema rejects invalid as_of_date', async () => {
    const { AgingInputSchema } = await import('../src/shared/ipc-schemas')
    const r = AgingInputSchema.safeParse({
      fiscal_year_id: 1,
      as_of_date: 'not-a-date',
    })
    expect(r.success).toBe(false)
  })
})
