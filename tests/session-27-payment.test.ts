import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import {
  saveDraft,
  finalizeDraft,
  payInvoice,
} from '../src/main/services/invoice-service'

let db: Database.Database

function createTestDb(): Database.Database {
  const testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.pragma('foreign_keys = ON')
  for (let i = 0; i < migrations.length; i++) {
    const m = migrations[i]
    testDb.exec('BEGIN EXCLUSIVE')
    testDb.exec(m.sql)
    if (m.programmatic) m.programmatic(testDb)
    testDb.pragma(`user_version = ${i + 1}`)
    testDb.exec('COMMIT')
  }
  return testDb
}

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
    default_price: 100000,
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
) {
  const result = saveDraft(testDb, {
    counterparty_id: seed.cpId,
    fiscal_year_id: seed.fiscalYearId,
    invoice_date: '2025-03-15',
    due_date: '2099-12-31',
    lines: [
      {
        product_id: seed.productId,
        description: 'Konsult',
        quantity: 10,
        unit_price_ore: 100000, // 1000 kr
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

describe('M3: Atomär paid_amount beräkning', () => {
  it('delbetalning: paid_amount = betalat belopp (inte dubbelt)', () => {
    const seed = seedAll(db)
    // total = 10 * 100000 * 1.25 = 1250000
    const inv = createUnpaidInvoice(db, seed)

    const result = payInvoice(db, {
      invoice_id: inv.id,
      amount_ore: 500000,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const row = db
      .prepare('SELECT paid_amount_ore, status FROM invoices WHERE id = ?')
      .get(inv.id) as { paid_amount_ore: number; status: string }
    expect(row.paid_amount_ore).toBe(500000)
    expect(row.status).toBe('partial')
  })

  it('slutbetalning: paid_amount = total_amount', () => {
    const seed = seedAll(db)
    const inv = createUnpaidInvoice(db, seed)

    const result = payInvoice(db, {
      invoice_id: inv.id,
      amount_ore: 1250000,
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const row = db
      .prepare('SELECT paid_amount_ore, status FROM invoices WHERE id = ?')
      .get(inv.id) as { paid_amount_ore: number; status: string }
    expect(row.paid_amount_ore).toBe(1250000)
    expect(row.status).toBe('paid')
  })

  it('payInvoice kastar OVERPAYMENT när betalning överstiger utestående belopp', () => {
    const seed = seedAll(db)
    const inv = createUnpaidInvoice(db, seed)
    // Faktura total = 1 250 000 öre (10 × 1000 kr + 25% moms)
    const result = payInvoice(db, {
      invoice_id: inv.id,
      amount_ore: 1_500_000, // 15 000 kr > 12 500 kr
      payment_date: '2025-03-20',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('OVERPAYMENT')
  })
})
