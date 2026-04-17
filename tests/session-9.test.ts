import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import {
  saveDraft,
  finalizeDraft,
  payInvoice,
  getPayments,
  listInvoices,
} from '../src/main/services/invoice-service'

let db: Database.Database

const VALID_COMPANY = {
  name: 'Test AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2025-01-15',
  fiscal_year_start: '2025-01-01',
  fiscal_year_end: '2025-12-31',
}

function seedAll(testDb: Database.Database) {
  createCompany(testDb, VALID_COMPANY)
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  const cp = createCounterparty(testDb, {
    name: 'Kund AB',
    type: 'customer',
  })
  if (!cp.success) throw new Error('CP failed')
  const vatCode = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
    .get() as { id: number }
  const account = testDb
    .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
    .get() as { id: number }
  const product = createProduct(testDb, {
    name: 'Konsult',
    default_price_ore: 100000, // 1000 kr for easy math
    vat_code_id: vatCode.id,
    account_id: account.id,
  })
  if (!product.success) throw new Error('Product failed')
  return {
    fiscalYearId: fy.id,
    cpId: cp.data.id,
    vatCodeId: vatCode.id,
    productId: product.data.id,
  }
}

function createUnpaidInvoice(
  testDb: Database.Database,
  seed: ReturnType<typeof seedAll>,
  opts?: { quantity?: number; unitPrice?: number; date?: string },
) {
  const result = saveDraft(testDb, {
    counterparty_id: seed.cpId,
    fiscal_year_id: seed.fiscalYearId,
    invoice_date: opts?.date ?? '2025-03-15',
    due_date: '2099-12-31',
    lines: [
      {
        product_id: seed.productId,
        description: 'Konsult',
        quantity: opts?.quantity ?? 10,
        unit_price_ore: opts?.unitPrice ?? 100000,
        vat_code_id: seed.vatCodeId,
        sort_order: 0,
      },
    ],
  })
  if (!result.success) throw new Error('Draft failed: ' + result.error)
  const fResult = finalizeDraft(testDb, result.data.id)
  if (!fResult.success) throw new Error('Finalize failed: ' + fResult.error)
  return fResult.data
}

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  if (db) db.close()
})

// ═══════════════════════════════════════════════════════════
// Betalning/kontering (5 tester)
// ═══════════════════════════════════════════════════════════
describe('Betalning/kontering', () => {
  it('1. Fullbetalning: unpaid → paid, journal_entry skapas', () => {
    const seed = seedAll(db)
    // 10 * 100000 = 1000000 netto, 250000 moms, total = 1250000
    const inv = createUnpaidInvoice(db, seed)
    expect(inv.status).toBe('unpaid')

    const result = payInvoice(db, {
      invoice_id: inv.id,
      amount_ore: 1250000,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.invoice.status).toBe('paid')

    // Verify journal entry balance
    const lines = db
      .prepare(
        'SELECT SUM(debit_ore) as d, SUM(credit_ore) as c FROM journal_entry_lines WHERE journal_entry_id = ?',
      )
      .get(result.data.payment.journal_entry_id) as { d: number; c: number }
    expect(lines.d).toBe(lines.c)
    expect(lines.d).toBe(1250000)
  })

  it('2. Delbetalning: amount < remaining → partial', () => {
    const seed = seedAll(db)
    const inv = createUnpaidInvoice(db, seed) // total 1250000

    const result = payInvoice(db, {
      invoice_id: inv.id,
      amount_ore: 500000,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.invoice.status).toBe('partial')
  })

  it('3. Slutbetalning: partial + remaining → paid', () => {
    const seed = seedAll(db)
    const inv = createUnpaidInvoice(db, seed) // total 1250000

    payInvoice(db, {
      invoice_id: inv.id,
      amount_ore: 500000,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    const result = payInvoice(db, {
      invoice_id: inv.id,
      amount_ore: 750000,
      payment_date: '2025-03-21',
      payment_method: 'swish',
      account_number: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.invoice.status).toBe('paid')
  })

  it('4. Överbetalning > 50 öre blockeras', () => {
    const seed = seedAll(db)
    const inv = createUnpaidInvoice(db, seed) // total 1250000

    const result = payInvoice(db, {
      invoice_id: inv.id,
      amount_ore: 1250051, // 51 öre för mycket
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(false)
  })

  it('5. Verifikationsnummer i A-serie', () => {
    const seed = seedAll(db)
    const inv = createUnpaidInvoice(db, seed) // finalize = A1

    payInvoice(db, {
      invoice_id: inv.id,
      amount_ore: 1250000,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })

    const entries = db
      .prepare(
        'SELECT verification_number, verification_series FROM journal_entries WHERE fiscal_year_id = ? ORDER BY verification_number',
      )
      .all(seed.fiscalYearId) as {
      verification_number: number
      verification_series: string
    }[]
    expect(entries.length).toBe(2) // A1 (invoice) + A2 (payment)
    expect(entries[0].verification_number).toBe(1)
    expect(entries[1].verification_number).toBe(2)
    expect(entries[1].verification_series).toBe('A')
  })
})

// ═══════════════════════════════════════════════════════════
// Validering (4 tester)
// ═══════════════════════════════════════════════════════════
describe('Validering', () => {
  it('6. Kan inte betala draft → error', () => {
    const seed = seedAll(db)
    const draft = saveDraft(db, {
      counterparty_id: seed.cpId,
      fiscal_year_id: seed.fiscalYearId,
      invoice_date: '2025-03-15',
      due_date: '2099-12-31',
      lines: [
        {
          product_id: seed.productId,
          description: 'Test',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: seed.vatCodeId,
          sort_order: 0,
        },
      ],
    })
    if (!draft.success) return

    const result = payInvoice(db, {
      invoice_id: draft.data.id,
      amount_ore: 12500,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(false)
  })

  it('7. Kan inte betala redan betald → error', () => {
    const seed = seedAll(db)
    const inv = createUnpaidInvoice(db, seed)

    payInvoice(db, {
      invoice_id: inv.id,
      amount_ore: 1250000,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })

    const result = payInvoice(db, {
      invoice_id: inv.id,
      amount_ore: 100,
      payment_date: '2025-03-21',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(false)
  })

  it('8. Stängd period → error', () => {
    const seed = seedAll(db)
    const inv = createUnpaidInvoice(db, seed)

    db.prepare(
      'UPDATE accounting_periods SET is_closed = 1 WHERE fiscal_year_id = ? AND period_number = 3',
    ).run(seed.fiscalYearId)

    const result = payInvoice(db, {
      invoice_id: inv.id,
      amount_ore: 1250000,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(false)
  })

  it('9. Framtidsdatum blockeras', () => {
    const seed = seedAll(db)
    const inv = createUnpaidInvoice(db, seed)

    const result = payInvoice(db, {
      invoice_id: inv.id,
      amount_ore: 1250000,
      payment_date: '2099-01-01',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════
// invoice_payments (2 tester)
// ═══════════════════════════════════════════════════════════
describe('invoice_payments', () => {
  it('10. Payment sparas med rätt data', () => {
    const seed = seedAll(db)
    const inv = createUnpaidInvoice(db, seed)

    payInvoice(db, {
      invoice_id: inv.id,
      amount_ore: 500000,
      payment_date: '2025-03-20',
      payment_method: 'swish',
      account_number: '1930',
    })

    const payments = getPayments(db, inv.id)
    expect(payments.length).toBe(1)
    expect(payments[0].amount_ore).toBe(500000)
    expect(payments[0].payment_method).toBe('swish')
    expect(payments[0].account_number).toBe('1930')
  })

  it('11. Flera delbetalningar → korrekt remaining', () => {
    const seed = seedAll(db)
    const inv = createUnpaidInvoice(db, seed) // total 1250000

    payInvoice(db, {
      invoice_id: inv.id,
      amount_ore: 400000,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    payInvoice(db, {
      invoice_id: inv.id,
      amount_ore: 400000,
      payment_date: '2025-03-21',
      payment_method: 'bankgiro',
      account_number: '1930',
    })

    const payments = getPayments(db, inv.id)
    expect(payments.length).toBe(2)
    const totalPaid = payments.reduce((s, p) => s + p.amount_ore, 0)
    expect(totalPaid).toBe(800000)
    // remaining = 1250000 - 800000 = 450000
  })
})

// ═══════════════════════════════════════════════════════════
// Integration (2 tester)
// ═══════════════════════════════════════════════════════════
describe('Integration', () => {
  it('12. listInvoices inkluderar total_paid och remaining', () => {
    const seed = seedAll(db)
    const inv = createUnpaidInvoice(db, seed) // total 1250000

    payInvoice(db, {
      invoice_id: inv.id,
      amount_ore: 500000,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })

    const result = listInvoices(db, { fiscal_year_id: seed.fiscalYearId })
    const item = result.items.find((i) => i.id === inv.id)
    expect(item).toBeDefined()
    expect(item!.total_paid).toBe(500000)
    expect(item!.remaining).toBe(750000)
  })

  it('13. Statusräknare inkluderar partial', () => {
    const seed = seedAll(db)
    const inv = createUnpaidInvoice(db, seed)

    payInvoice(db, {
      invoice_id: inv.id,
      amount_ore: 500000,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })

    const result = listInvoices(db, { fiscal_year_id: seed.fiscalYearId })
    expect(result.counts.partial).toBe(1)
  })

  it('14. Migration 008 — payment_method + account_number columns', () => {
    const v = db.pragma('user_version', { simple: true })
    expect(v).toBe(40) // S53: Uppdatera vid nya migrationer

    const cols = (
      db.pragma('table_info(invoice_payments)') as { name: string }[]
    ).map((c) => c.name)
    expect(cols).toContain('payment_method')
    expect(cols).toContain('account_number')
  })
})
