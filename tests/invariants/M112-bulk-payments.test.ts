import { describe, it, expect } from 'vitest'
import { createTestDb } from '../helpers/create-test-db'
import { createCompany } from '../../src/main/services/company-service'
import { createCounterparty } from '../../src/main/services/counterparty-service'
import {
  saveDraft,
  finalizeDraft,
  payInvoicesBulk,
} from '../../src/main/services/invoice-service'

/**
 * M112-M114 — Bulk-betalningar.
 *
 * M112: Services exponerar publik (IpcResult) + intern _Tx-variant.
 *       Bulk komponerar över den interna.
 * M113: Nestade savepoints via db.transaction()(). Per-rad-fel samlas i
 *       failed[]. Batch committar om minst 1 lyckas.
 * M114: Batch-nivå-verifikat (bank_fee) identifieras via source_type=
 *       'auto_bank_fee' + source_reference='batch:{id}'.
 */

function ok<T>(
  r:
    | { success: true; data: T }
    | { success: false; error: string; code?: string },
): T {
  if (!r.success) throw new Error(`${r.code}: ${r.error}`)
  return r.data
}

function seed(invoiceCount: number) {
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
    createCounterparty(db, {
      company_id: companyId,
      name: 'Kund',
      type: 'customer',
    }),
  )
  const invoiceIds: number[] = []
  for (let i = 0; i < invoiceCount; i++) {
    const inv = ok(
      saveDraft(db, {
        fiscal_year_id: fyId,
        counterparty_id: cp.id,
        invoice_date: '2026-02-01',
        due_date: '2026-03-01',
        lines: [
          {
            product_id: null,
            description: `Rad ${i + 1}`,
            quantity: 1,
            unit_price_ore: 100_000,
            vat_code_id: 4,
            sort_order: 0,
            account_number: '3001',
          },
        ],
      }),
    )
    ok(finalizeDraft(db, inv.id))
    invoiceIds.push(inv.id)
  }
  return { db, fyId, invoiceIds }
}

describe('M112-M114 — bulk-payments', () => {
  it('M112+113: bulk betalar alla framgångsrikt → status=completed', () => {
    const { db, invoiceIds } = seed(3)
    const r = ok(
      payInvoicesBulk(db, {
        payments: invoiceIds.map((id) => ({
          invoice_id: id,
          amount_ore: 100_000,
        })),
        payment_date: '2026-02-15',
        account_number: '1930',
        bank_fee_ore: 0,
      }),
    )
    expect(r.status).toBe('completed')
    expect(r.succeeded).toHaveLength(3)
    expect(r.failed).toHaveLength(0)

    // Alla fakturor markerade som betalda
    const paid = db
      .prepare(`SELECT COUNT(*) AS c FROM invoices WHERE status = 'paid'`)
      .get() as { c: number }
    expect(paid.c).toBe(3)
  })

  it('M113: blandad lyckad/misslyckad → status=partial + batch committar', () => {
    const { db, invoiceIds } = seed(2)
    const r = ok(
      payInvoicesBulk(db, {
        payments: [
          { invoice_id: invoiceIds[0], amount_ore: 100_000 },
          { invoice_id: 99999, amount_ore: 100_000 }, // finns inte
        ],
        payment_date: '2026-02-15',
        account_number: '1930',
        bank_fee_ore: 0,
      }),
    )
    expect(r.status).toBe('partial')
    expect(r.succeeded.length).toBe(1)
    expect(r.failed.length).toBe(1)
    // Första fakturan ska vara paid (savepoint committad)
    const first = db
      .prepare('SELECT status FROM invoices WHERE id = ?')
      .get(invoiceIds[0]) as { status: string }
    expect(first.status).toBe('paid')
  })

  it('M113: alla failar → status=cancelled + inget committas', () => {
    const { db } = seed(0)
    const r = ok(
      payInvoicesBulk(db, {
        payments: [{ invoice_id: 99999, amount_ore: 100_000 }],
        payment_date: '2026-02-15',
        account_number: '1930',
        bank_fee_ore: 0,
      }),
    )
    expect(r.status).toBe('cancelled')
    expect(r.batch_id).toBeNull()
    expect(r.bank_fee_journal_entry_id).toBeNull()

    // Inget payment_batch-rad
    const batches = db
      .prepare('SELECT COUNT(*) AS c FROM payment_batches')
      .get() as { c: number }
    expect(batches.c).toBe(0)
  })

  // M114 bank-fee-verifikat-flödet. Konto 6570 (Bankkostnader) och 1930
  // (Företagskonto) är förselade via migrationer — inget extra setup krävs.
  // Fullständig coverage även i S13-bulk-payment.test.ts.
  it('M114: bank_fee på batch bokförs via source_type=auto_bank_fee', () => {
    const { db, invoiceIds } = seed(2)
    const r = ok(
      payInvoicesBulk(db, {
        payments: invoiceIds.map((id) => ({
          invoice_id: id,
          amount_ore: 100_000,
        })),
        payment_date: '2026-02-15',
        account_number: '1930',
        bank_fee_ore: 500, // 5 kr avgift
      }),
    )
    expect(r.status).toBe('completed')
    expect(r.bank_fee_journal_entry_id).toBeDefined()

    const fee = db
      .prepare(
        `SELECT source_type, source_reference FROM journal_entries WHERE id = ?`,
      )
      .get(r.bank_fee_journal_entry_id) as {
      source_type: string
      source_reference: string
    }
    expect(fee.source_type).toBe('auto_bank_fee')
    expect(fee.source_reference).toMatch(/^batch:/)
  })
})
