import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import {
  saveDraft,
  finalizeDraft,
  listInvoices,
  refreshInvoiceStatuses,
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
    company_id: 1,
    name: 'Acme AB',
    type: 'customer',
  })
  if (!cp.success) throw new Error('CP failed')
  const cp2 = createCounterparty(testDb, {
    company_id: 1,
    name: 'Beta AB',
    type: 'customer',
  })
  if (!cp2.success) throw new Error('CP2 failed')
  const vatCode = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
    .get() as { id: number }
  const account = testDb
    .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
    .get() as { id: number }
  const product = createProduct(testDb, {
    company_id: 1,
    name: 'Konsult',
    default_price_ore: 95000,
    vat_code_id: vatCode.id,
    account_id: account.id,
  })
  if (!product.success) throw new Error('Product failed')
  return {
    fiscalYearId: fy.id,
    cpId: cp.data.id,
    cp2Id: cp2.data.id,
    vatCodeId: vatCode.id,
    productId: product.data.id,
  }
}

function createDraft(
  testDb: Database.Database,
  seed: ReturnType<typeof seedAll>,
  opts?: { date?: string; cpId?: number; dueDate?: string },
) {
  return saveDraft(testDb, {
    counterparty_id: opts?.cpId ?? seed.cpId,
    fiscal_year_id: seed.fiscalYearId,
    invoice_date: opts?.date ?? '2025-03-15',
    due_date: opts?.dueDate ?? '2099-12-31', // Far future to avoid overdue in tests
    lines: [
      {
        product_id: seed.productId,
        description: 'Konsult',
        quantity: 10,
        unit_price_ore: 95000,
        vat_code_id: seed.vatCodeId,
        sort_order: 0,
      },
    ],
  })
}

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  if (db) db.close()
})

// ═══════════════════════════════════════════════════════════
// invoice:list (4 tester)
// ═══════════════════════════════════════════════════════════
describe('invoice:list', () => {
  it('1. Lista alla fakturor returnerar drafts + bokförda', () => {
    const seed = seedAll(db)
    const d1 = createDraft(db, seed, { date: '2025-03-15' })
    if (!d1.success) return
    const d2 = createDraft(db, seed, { date: '2025-03-16' })
    if (!d2.success) return
    const fResult = finalizeDraft(db, d1.data.id)
    // If finalize failed, the test should still show what happened
    if (!fResult.success) {
      expect(fResult).toMatchObject({ success: true })
    }

    const result = listInvoices(db, { fiscal_year_id: seed.fiscalYearId })
    expect(result.items.length).toBe(2)
    expect(result.items.find((i) => i.status === 'unpaid')).toBeDefined()
    expect(result.items.find((i) => i.status === 'draft')).toBeDefined()
    expect(result.items[0].counterparty_name).toBe('Acme AB')
  })

  it('2. Filtrera på status=unpaid → bara obetalda', () => {
    const seed = seedAll(db)
    const d1 = createDraft(db, seed, { date: '2025-03-15' })
    if (!d1.success) return
    const d2 = createDraft(db, seed, { date: '2025-03-16' })
    if (!d2.success) return
    finalizeDraft(db, d1.data.id)

    const result = listInvoices(db, {
      fiscal_year_id: seed.fiscalYearId,
      status: 'unpaid',
    })
    expect(result.items.length).toBe(1)
    expect(result.items[0].status).toBe('unpaid')
  })

  it('3. Sök på kundnamn → matchande fakturor', () => {
    const seed = seedAll(db)
    createDraft(db, seed, { cpId: seed.cpId }) // Acme
    createDraft(db, seed, { cpId: seed.cp2Id }) // Beta

    const result = listInvoices(db, {
      fiscal_year_id: seed.fiscalYearId,
      search: 'Acme',
    })
    expect(result.items.length).toBe(1)
    expect(result.items[0].counterparty_name).toBe('Acme AB')
  })

  it('4. Sortering invoice_date DESC → nyast först', () => {
    const seed = seedAll(db)
    createDraft(db, seed, { date: '2025-01-01' })
    createDraft(db, seed, { date: '2025-06-01' })
    createDraft(db, seed, { date: '2025-03-01' })

    const result = listInvoices(db, {
      fiscal_year_id: seed.fiscalYearId,
      sort_by: 'invoice_date',
      sort_order: 'desc',
    })
    expect(result.items[0].invoice_date).toBe('2025-06-01')
    expect(result.items[2].invoice_date).toBe('2025-01-01')
  })
})

// ═══════════════════════════════════════════════════════════
// Overdue-logik (3 tester)
// ═══════════════════════════════════════════════════════════
describe('Overdue-logik', () => {
  it('5. unpaid med due_date < idag → overdue', () => {
    const seed = seedAll(db)
    const d = createDraft(db, seed, { date: '2025-03-15' })
    if (!d.success) return
    finalizeDraft(db, d.data.id)

    // Set due_date to yesterday
    db.prepare(
      "UPDATE invoices SET due_date = date('now', '-1 day') WHERE id = ?",
    ).run(d.data.id)

    const changed = refreshInvoiceStatuses(db)
    expect(changed).toBe(1)

    const inv = db
      .prepare('SELECT status FROM invoices WHERE id = ?')
      .get(d.data.id) as { status: string }
    expect(inv.status).toBe('overdue')
  })

  it('6. unpaid med due_date >= idag → oförändrad', () => {
    const seed = seedAll(db)
    const d = createDraft(db, seed, { date: '2025-03-15' })
    if (!d.success) return
    finalizeDraft(db, d.data.id)

    // Set due_date to tomorrow
    db.prepare(
      "UPDATE invoices SET due_date = date('now', '+1 day') WHERE id = ?",
    ).run(d.data.id)

    refreshInvoiceStatuses(db)

    const inv = db
      .prepare('SELECT status FROM invoices WHERE id = ?')
      .get(d.data.id) as { status: string }
    expect(inv.status).toBe('unpaid')
  })

  it('7. draft med due_date < idag → INTE ändrad till overdue', () => {
    const seed = seedAll(db)
    const d = createDraft(db, seed)
    if (!d.success) return

    db.prepare(
      "UPDATE invoices SET due_date = date('now', '-1 day') WHERE id = ?",
    ).run(d.data.id)

    refreshInvoiceStatuses(db)

    const inv = db
      .prepare('SELECT status FROM invoices WHERE id = ?')
      .get(d.data.id) as { status: string }
    expect(inv.status).toBe('draft')
  })
})

// ═══════════════════════════════════════════════════════════
// Statusräknare + integration (3 tester)
// ═══════════════════════════════════════════════════════════
describe('Statusräknare + integration', () => {
  it('8. Rätt count per status', () => {
    const seed = seedAll(db)
    // 2 drafts
    createDraft(db, seed, { date: '2025-03-15' })
    createDraft(db, seed, { date: '2025-03-16' })
    // 1 unpaid
    const d3 = createDraft(db, seed, { date: '2025-03-17' })
    if (!d3.success) return
    finalizeDraft(db, d3.data.id)

    const result = listInvoices(db, { fiscal_year_id: seed.fiscalYearId })
    expect(result.counts.draft).toBe(2)
    expect(result.counts.unpaid).toBe(1)
    expect(result.counts.total).toBe(3)
  })

  it('9. counterparty_name via JOIN', () => {
    const seed = seedAll(db)
    createDraft(db, seed, { cpId: seed.cpId })

    const result = listInvoices(db, { fiscal_year_id: seed.fiscalYearId })
    expect(result.items[0].counterparty_name).toBe('Acme AB')
  })

  it('10. verification_number via JOIN för bokförda', () => {
    const seed = seedAll(db)
    const d = createDraft(db, seed, { date: '2025-03-15' })
    if (!d.success) return
    finalizeDraft(db, d.data.id)
    createDraft(db, seed, { date: '2025-03-16' }) // draft

    const result = listInvoices(db, { fiscal_year_id: seed.fiscalYearId })
    const booked = result.items.find((i) => i.status === 'unpaid')
    const draft = result.items.find((i) => i.status === 'draft')
    expect(booked?.verification_number).toBe(1)
    expect(draft?.verification_number).toBeNull()
  })
})
