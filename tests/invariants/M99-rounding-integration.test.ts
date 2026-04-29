import { describe, it, expect } from 'vitest'
import { createTestDb } from '../helpers/create-test-db'
import { createCompany } from '../../src/main/services/company-service'
import { createCounterparty } from '../../src/main/services/counterparty-service'
import {
  saveDraft,
  finalizeDraft,
  payInvoice,
} from '../../src/main/services/invoice-service'

/**
 * M99 — Öresutjämning-integration via payInvoice.
 *
 * Villkor: |diff| ≤ 50 öre och remaining > 0 → öresutjämning bokförs på
 * konto 3740. Payment-rad registreras med faktiskt-betalt belopp.
 */

function ok<T>(
  r:
    | { success: true; data: T }
    | { success: false; error: string; code?: string },
): T {
  if (!r.success) throw new Error(`${r.code}: ${r.error}`)
  return r.data
}

function setup(totalOre: number) {
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
  const inv = ok(
    saveDraft(db, {
      fiscal_year_id: fyId,
      counterparty_id: cp.id,
      invoice_date: '2026-02-01',
      due_date: '2026-03-01',
      lines: [
        {
          product_id: null,
          description: 'P',
          quantity: 1,
          unit_price_ore: totalOre,
          vat_code_id: 4,
          sort_order: 0,
          account_number: '3001',
        },
      ],
    }),
  )
  ok(finalizeDraft(db, inv.id))
  return { db, invoiceId: inv.id }
}

describe('M99 — öresutjämning vid payInvoice', () => {
  it('underbetalning ≤50 öre → debet 3740 + status=paid', () => {
    const { db, invoiceId } = setup(100_000)
    // Betala 49 öre för lite — inom threshold
    ok(
      payInvoice(db, {
        invoice_id: invoiceId,
        amount_ore: 99_951,
        payment_date: '2026-02-15',
        payment_method: 'bank',
        account_number: '1930',
      }),
    )
    const row = db
      .prepare(`SELECT status, paid_amount_ore FROM invoices WHERE id = ?`)
      .get(invoiceId) as { status: string; paid_amount_ore: number }
    expect(row.status).toBe('paid')
    // paid_amount_ore = full fordran (100_000) eftersom rounding-path
    // lagrar actualReceivablesCredit (= remaining) i amount_ore
    expect(row.paid_amount_ore).toBe(100_000)

    // Verifikatet ska ha 3740-rad
    const journalLines = db
      .prepare(
        `SELECT jel.account_number, jel.debit_ore, jel.credit_ore
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id = jel.journal_entry_id
         JOIN invoice_payments ip ON ip.journal_entry_id = je.id
         WHERE ip.invoice_id = ?`,
      )
      .all(invoiceId) as Array<{
      account_number: string
      debit_ore: number
      credit_ore: number
    }>
    const roundingLine = journalLines.find((l) => l.account_number === '3740')
    expect(roundingLine).toBeDefined()
    expect(roundingLine!.debit_ore).toBe(49) // användaren betalade 49 öre mindre
  })

  it('överbetalning ≤50 öre → kredit 3740 + status=paid', () => {
    const { db, invoiceId } = setup(100_000)
    ok(
      payInvoice(db, {
        invoice_id: invoiceId,
        amount_ore: 100_025,
        payment_date: '2026-02-15',
        payment_method: 'bank',
        account_number: '1930',
      }),
    )
    const journalLines = db
      .prepare(
        `SELECT jel.account_number, jel.debit_ore, jel.credit_ore
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id = jel.journal_entry_id
         JOIN invoice_payments ip ON ip.journal_entry_id = je.id
         WHERE ip.invoice_id = ?`,
      )
      .all(invoiceId) as Array<{
      account_number: string
      debit_ore: number
      credit_ore: number
    }>
    const rounding = journalLines.find((l) => l.account_number === '3740')
    expect(rounding).toBeDefined()
    expect(rounding!.credit_ore).toBe(25)
  })

  it('över threshold (>50 öre) → INGEN öresutjämning, status=partial', () => {
    const { db, invoiceId } = setup(100_000)
    ok(
      payInvoice(db, {
        invoice_id: invoiceId,
        amount_ore: 99_900,
        payment_date: '2026-02-15',
        payment_method: 'bank',
        account_number: '1930',
      }),
    )
    const row = db
      .prepare(`SELECT status FROM invoices WHERE id = ?`)
      .get(invoiceId) as { status: string }
    expect(row.status).toBe('partial')
  })

  it('exakt betalning → INGEN öresutjämning', () => {
    const { db, invoiceId } = setup(100_000)
    ok(
      payInvoice(db, {
        invoice_id: invoiceId,
        amount_ore: 100_000,
        payment_date: '2026-02-15',
        payment_method: 'bank',
        account_number: '1930',
      }),
    )
    const journalLines = db
      .prepare(
        `SELECT jel.account_number
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id = jel.journal_entry_id
         JOIN invoice_payments ip ON ip.journal_entry_id = je.id
         WHERE ip.invoice_id = ?`,
      )
      .all(invoiceId) as Array<{ account_number: string }>
    const rounding = journalLines.find((l) => l.account_number === '3740')
    expect(rounding).toBeUndefined()
  })
})
