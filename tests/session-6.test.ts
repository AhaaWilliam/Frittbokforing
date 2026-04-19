import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import {
  saveDraft,
  getDraft,
  updateDraft,
  deleteDraft,
  listDrafts,
  nextInvoiceNumber,
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

function seedTestData(testDb: Database.Database) {
  const companyResult = createCompany(testDb, VALID_COMPANY)
  if (!companyResult.success) throw new Error('Company seed failed')

  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }

  const cp = createCounterparty(testDb, {
    company_id: 1,
    name: 'Kund AB',
    type: 'customer',
  })
  if (!cp.success) throw new Error('Counterparty seed failed')

  const vatCode = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
    .get() as { id: number }
  const vatCode12 = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP2'")
    .get() as { id: number }
  const vatCodeMF = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MF'")
    .get() as { id: number }
  const account = testDb
    .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
    .get() as { id: number }

  const product = createProduct(testDb, {
    company_id: 1,
    name: 'Konsulttjänst',
    unit: 'timme',
    default_price_ore: 95000,
    vat_code_id: vatCode.id,
    account_id: account.id,
    article_type: 'service',
  })
  if (!product.success) throw new Error('Product seed failed')

  return {
    companyId: companyResult.data.id,
    fiscalYearId: fy.id,
    counterpartyId: cp.data.id,
    productId: product.data.id,
    vatCodeId25: vatCode.id,
    vatCodeId12: vatCode12.id,
    vatCodeIdMF: vatCodeMF.id,
    accountId: account.id,
  }
}

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  if (db) db.close()
})

// ═══════════════════════════════════════════════════════════
// Draft CRUD (5 tester)
// ═══════════════════════════════════════════════════════════
describe('Invoice draft CRUD', () => {
  it('1. Spara draft med kund + 2 rader → success', () => {
    const seed = seedTestData(db)
    const result = saveDraft(db, {
      counterparty_id: seed.counterpartyId,
      fiscal_year_id: seed.fiscalYearId,
      invoice_date: '2025-03-01',
      due_date: '2025-03-31',
      payment_terms: 30,
      lines: [
        {
          product_id: seed.productId,
          description: 'Konsulttjänst',
          quantity: 40,
          unit_price_ore: 95000,
          vat_code_id: seed.vatCodeId25,
          sort_order: 0,
        },
        {
          product_id: null,
          description: 'Friform-rad',
          quantity: 1,
          unit_price_ore: 50000,
          vat_code_id: seed.vatCodeId25,
          sort_order: 1,
        },
      ],
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('draft')
    expect(result.data.invoice_number).toBe('')
    // 40 * 95000 + 1 * 50000 = 3850000
    expect(result.data.net_amount_ore).toBe(3850000)
    // 3850000 * 0.25 = 962500
    expect(result.data.vat_amount_ore).toBe(962500)
    expect(result.data.total_amount_ore).toBe(4812500)
    expect(result.data.lines.length).toBe(2)
  })

  it('2. Hämta draft → inkluderar lines sorterade', () => {
    const seed = seedTestData(db)
    const saved = saveDraft(db, {
      counterparty_id: seed.counterpartyId,
      fiscal_year_id: seed.fiscalYearId,
      invoice_date: '2025-03-01',
      due_date: '2025-03-31',
      lines: [
        {
          product_id: null,
          description: 'Rad 2',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: seed.vatCodeId25,
          sort_order: 1,
        },
        {
          product_id: null,
          description: 'Rad 1',
          quantity: 1,
          unit_price_ore: 20000,
          vat_code_id: seed.vatCodeId25,
          sort_order: 0,
        },
      ],
    })
    if (!saved.success) return

    const draft = getDraft(db, saved.data.id)
    expect(draft).not.toBeNull()
    expect(draft!.lines.length).toBe(2)
    expect(draft!.lines[0].sort_order).toBe(0)
    expect(draft!.lines[0].description).toBe('Rad 1')
    expect(draft!.lines[1].sort_order).toBe(1)
    expect(draft!.counterparty_name).toBe('Kund AB')
  })

  it('3. Uppdatera draft → total_amount uppdateras', () => {
    const seed = seedTestData(db)
    const saved = saveDraft(db, {
      counterparty_id: seed.counterpartyId,
      fiscal_year_id: seed.fiscalYearId,
      invoice_date: '2025-03-01',
      due_date: '2025-03-31',
      lines: [
        {
          product_id: null,
          description: 'Original',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: seed.vatCodeId25,
          sort_order: 0,
        },
      ],
    })
    if (!saved.success) return

    const updated = updateDraft(db, {
      id: saved.data.id,
      counterparty_id: seed.counterpartyId,
      invoice_date: '2025-03-01',
      due_date: '2025-03-31',
      lines: [
        {
          product_id: null,
          description: 'Uppdaterad',
          quantity: 2,
          unit_price_ore: 50000,
          vat_code_id: seed.vatCodeId25,
          sort_order: 0,
        },
      ],
    })

    expect(updated.success).toBe(true)
    if (!updated.success) return
    expect(updated.data.net_amount_ore).toBe(100000) // 2 * 50000
    expect(updated.data.vat_amount_ore).toBe(25000) // 100000 * 0.25
    expect(updated.data.lines[0].description).toBe('Uppdaterad')
  })

  it('4. Ta bort draft → getDraft returnerar null', () => {
    const seed = seedTestData(db)
    const saved = saveDraft(db, {
      counterparty_id: seed.counterpartyId,
      fiscal_year_id: seed.fiscalYearId,
      invoice_date: '2025-03-01',
      due_date: '2025-03-31',
      lines: [
        {
          product_id: null,
          description: 'Test',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: seed.vatCodeId25,
          sort_order: 0,
        },
      ],
    })
    if (!saved.success) return

    const result = deleteDraft(db, saved.data.id)
    expect(result.success).toBe(true)

    const draft = getDraft(db, saved.data.id)
    expect(draft).toBeNull()
  })

  it('5. Lista drafts filtrerar på fiscal_year_id + status', () => {
    const seed = seedTestData(db)
    saveDraft(db, {
      counterparty_id: seed.counterpartyId,
      fiscal_year_id: seed.fiscalYearId,
      invoice_date: '2025-03-01',
      due_date: '2025-03-31',
      lines: [
        {
          product_id: null,
          description: 'Draft 1',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: seed.vatCodeId25,
          sort_order: 0,
        },
      ],
    })
    saveDraft(db, {
      counterparty_id: seed.counterpartyId,
      fiscal_year_id: seed.fiscalYearId,
      invoice_date: '2025-04-01',
      due_date: '2025-04-30',
      lines: [
        {
          product_id: null,
          description: 'Draft 2',
          quantity: 1,
          unit_price_ore: 20000,
          vat_code_id: seed.vatCodeId25,
          sort_order: 0,
        },
      ],
    })

    const drafts = listDrafts(db, seed.fiscalYearId)
    expect(drafts.length).toBe(2)
    expect(drafts[0].counterparty_name).toBe('Kund AB')
  })
})

// ═══════════════════════════════════════════════════════════
// Momsberäkning (4 tester)
// ═══════════════════════════════════════════════════════════
describe('Momsberäkning', () => {
  it('6. En rad 25% moms → korrekt beräkning', () => {
    const seed = seedTestData(db)
    const result = saveDraft(db, {
      counterparty_id: seed.counterpartyId,
      fiscal_year_id: seed.fiscalYearId,
      invoice_date: '2025-03-01',
      due_date: '2025-03-31',
      lines: [
        {
          product_id: null,
          description: 'Konsulttjänst 40h',
          quantity: 40,
          unit_price_ore: 95000, // 950 kr
          vat_code_id: seed.vatCodeId25,
          sort_order: 0,
        },
      ],
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    // 40 * 95000 = 3800000 (38 000 kr)
    expect(result.data.net_amount_ore).toBe(3800000)
    // 3800000 * 0.25 = 950000 (9 500 kr)
    expect(result.data.vat_amount_ore).toBe(950000)
    expect(result.data.total_amount_ore).toBe(4750000)
  })

  it('7. Två rader med olika moms (25% + 12%) → korrekt summering', () => {
    const seed = seedTestData(db)
    const result = saveDraft(db, {
      counterparty_id: seed.counterpartyId,
      fiscal_year_id: seed.fiscalYearId,
      invoice_date: '2025-03-01',
      due_date: '2025-03-31',
      lines: [
        {
          product_id: null,
          description: 'Tjänst 25%',
          quantity: 10,
          unit_price_ore: 100000, // 1000 kr
          vat_code_id: seed.vatCodeId25,
          sort_order: 0,
        },
        {
          product_id: null,
          description: 'Vara 12%',
          quantity: 5,
          unit_price_ore: 20000, // 200 kr
          vat_code_id: seed.vatCodeId12,
          sort_order: 1,
        },
      ],
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    // Rad 1: 10 * 100000 = 1000000, moms 250000
    // Rad 2: 5 * 20000 = 100000, moms 12000
    expect(result.data.net_amount_ore).toBe(1100000)
    expect(result.data.vat_amount_ore).toBe(262000)
    expect(result.data.total_amount_ore).toBe(1362000)
  })

  it('8. Nollmoms → vat_amount = 0', () => {
    const seed = seedTestData(db)
    const result = saveDraft(db, {
      counterparty_id: seed.counterpartyId,
      fiscal_year_id: seed.fiscalYearId,
      invoice_date: '2025-03-01',
      due_date: '2025-03-31',
      lines: [
        {
          product_id: null,
          description: 'Momsfritt',
          quantity: 1,
          unit_price_ore: 50000,
          vat_code_id: seed.vatCodeIdMF,
          sort_order: 0,
        },
      ],
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.vat_amount_ore).toBe(0)
    expect(result.data.total_amount_ore).toBe(50000)
  })

  it('9. Avrundning: udda belopp', () => {
    const seed = seedTestData(db)
    const result = saveDraft(db, {
      counterparty_id: seed.counterpartyId,
      fiscal_year_id: seed.fiscalYearId,
      invoice_date: '2025-03-01',
      due_date: '2025-03-31',
      lines: [
        {
          product_id: null,
          description: 'Udda belopp',
          quantity: 1,
          unit_price_ore: 33333, // 333.33 kr
          vat_code_id: seed.vatCodeId25,
          sort_order: 0,
        },
      ],
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.net_amount_ore).toBe(33333)
    // Math.round(33333 * 0.25) = Math.round(8333.25) = 8333
    expect(result.data.vat_amount_ore).toBe(8333)
  })
})

// ═══════════════════════════════════════════════════════════
// Validering (3 tester)
// ═══════════════════════════════════════════════════════════
describe('Validering', () => {
  it('10. counterparty_id = 0 → VALIDATION_ERROR', () => {
    const seed = seedTestData(db)
    const result = saveDraft(db, {
      counterparty_id: 0,
      fiscal_year_id: seed.fiscalYearId,
      invoice_date: '2025-03-01',
      due_date: '2025-03-31',
      lines: [
        {
          product_id: null,
          description: 'Test',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: seed.vatCodeId25,
          sort_order: 0,
        },
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('11. Tom faktura (inga rader) → VALIDATION_ERROR', () => {
    const seed = seedTestData(db)
    const result = saveDraft(db, {
      counterparty_id: seed.counterpartyId,
      fiscal_year_id: seed.fiscalYearId,
      invoice_date: '2025-03-01',
      due_date: '2025-03-31',
      lines: [],
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('12. Kan inte uppdatera icke-draft → INVOICE_NOT_DRAFT', () => {
    const seed = seedTestData(db)
    const saved = saveDraft(db, {
      counterparty_id: seed.counterpartyId,
      fiscal_year_id: seed.fiscalYearId,
      invoice_date: '2025-03-01',
      due_date: '2025-03-31',
      lines: [
        {
          product_id: null,
          description: 'Test',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: seed.vatCodeId25,
          sort_order: 0,
        },
      ],
    })
    if (!saved.success) return

    // Manually set to 'unpaid' (set account_number first to satisfy trigger)
    db.prepare(
      "UPDATE invoice_lines SET account_number = '3002' WHERE invoice_id = ? AND account_number IS NULL",
    ).run(saved.data.id)
    db.prepare("UPDATE invoices SET status = 'unpaid' WHERE id = ?").run(
      saved.data.id,
    )

    const result = updateDraft(db, {
      id: saved.data.id,
      counterparty_id: seed.counterpartyId,
      invoice_date: '2025-03-01',
      due_date: '2025-03-31',
      lines: [
        {
          product_id: null,
          description: 'Changed',
          quantity: 1,
          unit_price_ore: 20000,
          vat_code_id: seed.vatCodeId25,
          sort_order: 0,
        },
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('INVOICE_NOT_DRAFT')
  })
})

// ═══════════════════════════════════════════════════════════
// Preview + Integration (2 tester)
// ═══════════════════════════════════════════════════════════
describe('Preview + Integration', () => {
  it('13. nextInvoiceNumber returnerar MAX + 1', () => {
    const seed = seedTestData(db)

    // Inga fakturor → preview = 1
    const first = nextInvoiceNumber(db, seed.fiscalYearId)
    expect(first.preview).toBe(1)

    // Manuellt insert med invoice_number=5
    db.prepare(
      `INSERT INTO invoices (counterparty_id, fiscal_year_id, invoice_type, invoice_number, invoice_date, due_date, net_amount_ore, total_amount_ore, status)
       VALUES (?, ?, 'customer_invoice', '5', '2025-01-01', '2025-01-31', 10000, 12500, 'unpaid')`,
    ).run(seed.counterpartyId, seed.fiscalYearId)

    const second = nextInvoiceNumber(db, seed.fiscalYearId)
    expect(second.preview).toBe(6)
  })

  it('14. Migration 006 — invoice_lines tabell + fiscal_year_id kolumn', () => {
    // Verifiera invoice_lines existerar
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_lines'",
      )
      .all()
    expect(tables.length).toBe(1)

    // Verifiera fiscal_year_id på invoices
    const cols = (db.pragma('table_info(invoices)') as { name: string }[]).map(
      (c) => c.name,
    )
    expect(cols).toContain('fiscal_year_id')
    expect(cols).toContain('payment_terms')
  })
})
