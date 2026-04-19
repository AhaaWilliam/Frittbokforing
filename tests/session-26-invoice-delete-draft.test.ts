import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { deleteDraft } from '../src/main/services/invoice-service'

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

let fyId: number
let counterpartyId: number

function seedDraftInvoice(): number {
  const cpResult = db
    .prepare(
      `INSERT INTO counterparties (company_id, name, type, org_number, is_active) VALUES (1, 'Kund AB', 'customer', '556000-0001', 1)`,
    )
    .run()
  counterpartyId = Number(cpResult.lastInsertRowid)

  const invResult = db
    .prepare(
      `INSERT INTO invoices (
        counterparty_id, fiscal_year_id, invoice_type, invoice_number,
        invoice_date, due_date, status, net_amount_ore, vat_amount_ore, total_amount_ore,
        currency, payment_terms
      ) VALUES (?, ?, 'customer_invoice', '', '2025-06-01', '2025-07-01', 'draft', 100000, 25000, 125000, 'SEK', 30)`,
    )
    .run(counterpartyId, fyId)
  const invoiceId = Number(invResult.lastInsertRowid)

  db.prepare(
    `INSERT INTO invoice_lines (
      invoice_id, description, quantity, unit_price_ore, vat_code_id,
      line_total_ore, vat_amount_ore, sort_order
    ) VALUES (?, 'Produkt 1', 1, 50000, 1, 50000, 12500, 1)`,
  ).run(invoiceId)
  db.prepare(
    `INSERT INTO invoice_lines (
      invoice_id, description, quantity, unit_price_ore, vat_code_id,
      line_total_ore, vat_amount_ore, sort_order
    ) VALUES (?, 'Produkt 2', 1, 50000, 1, 50000, 12500, 2)`,
  ).run(invoiceId)

  return invoiceId
}

beforeEach(() => {
  db = createTestDb()
  createCompany(db, VALID_COMPANY)
  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  fyId = fy.id
})

afterEach(() => {
  db.close()
})

describe('deleteDraft (K4)', () => {
  it('deletes a draft invoice and its lines atomically', () => {
    const invoiceId = seedDraftInvoice()

    const result = deleteDraft(db, invoiceId)
    expect(result.success).toBe(true)

    const invoiceCount = db
      .prepare('SELECT COUNT(*) as cnt FROM invoices WHERE id = ?')
      .get(invoiceId) as { cnt: number }
    expect(invoiceCount.cnt).toBe(0)

    const lineCount = db
      .prepare('SELECT COUNT(*) as cnt FROM invoice_lines WHERE invoice_id = ?')
      .get(invoiceId) as { cnt: number }
    expect(lineCount.cnt).toBe(0)
  })

  it('returns error for non-existent invoice', () => {
    const result = deleteDraft(db, 99999)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INVOICE_NOT_FOUND')
  })

  it('returns error for non-draft invoice', () => {
    const invoiceId = seedDraftInvoice()
    // Change status to 'sent' (set account_number first to satisfy trigger)
    db.prepare(
      "UPDATE invoice_lines SET account_number = '3002' WHERE invoice_id = ? AND account_number IS NULL",
    ).run(invoiceId)
    db.prepare("UPDATE invoices SET status = 'unpaid' WHERE id = ?").run(
      invoiceId,
    )

    const result = deleteDraft(db, invoiceId)
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('INVOICE_NOT_DRAFT')
  })
})
