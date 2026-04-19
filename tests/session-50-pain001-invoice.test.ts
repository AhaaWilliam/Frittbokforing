/**
 * Session 50: pain.001 export — symmetric support for invoice batches.
 *
 * Expense-sidan (S46) exporterade redan pain.001. Denna sprint öppnar samma
 * funktion för invoice-batchar (`batch_type='invoice'`). Remittance-fältet
 * använder `invoices.invoice_number` istället för `expenses.supplier_invoice_number`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import {
  validateBatchForExport,
  generatePain001,
} from '../src/main/services/payment/pain001-export-service'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  for (let i = 0; i < migrations.length; i++) {
    const m = migrations[i]
    db.exec('BEGIN EXCLUSIVE')
    if (m.sql) db.exec(m.sql)
    if (m.programmatic) m.programmatic(db)
    db.pragma(`user_version = ${i + 1}`)
    db.exec('COMMIT')
  }
  return db
}

let db: Database.Database
let fyId: number
let customerId: number
let batchId: number

beforeAll(() => {
  db = createTestDb()
  createCompany(db, {
    name: 'Invoice Pain Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 50000_00,
    registration_date: '2025-01-15',
    fiscal_year_start: '2025-01-01',
    fiscal_year_end: '2025-12-31',
  })
  db.prepare("UPDATE companies SET bankgiro = '1234-5678' WHERE id = 1").run()

  fyId = (
    db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  ).id

  const customer = createCounterparty(db, {
    company_id: 1,
    name: 'Kund AB',
    type: 'customer',
    org_number: '559999-0002',
    bankgiro: '5678-9012',
  })
  if (!customer.success) throw new Error('Customer creation failed')
  customerId = customer.data.id

  // Insert invoice directly (credit note — money out to customer)
  db.prepare(
    `INSERT INTO invoices (counterparty_id, fiscal_year_id, invoice_number, invoice_date, due_date, status, invoice_type, net_amount_ore, vat_amount_ore, total_amount_ore, paid_amount_ore)
     VALUES (?, ?, 'FAKT-100', '2025-02-01', '2025-03-01', 'paid', 'credit_note', 10000, 2500, 12500, 12500)`,
  ).run(customerId, fyId)
  const invoiceId = (
    db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }
  ).id

  // Journal entry for invoice (A-series)
  db.prepare(
    `INSERT INTO journal_entries (company_id, fiscal_year_id, verification_number, verification_series, journal_date, description, status, source_type)
     VALUES (1, ?, 1, 'A', '2025-02-01', 'Test kreditfaktura', 'booked', 'auto_payment')`,
  ).run(fyId)
  const jeId = (
    db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }
  ).id

  // Invoice batch
  db.prepare(
    `INSERT INTO payment_batches (fiscal_year_id, batch_type, payment_date, account_number, status)
     VALUES (?, 'invoice', '2025-02-15', '1930', 'completed')`,
  ).run(fyId)
  batchId = (
    db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }
  ).id

  // Invoice payment linked to batch
  db.prepare(
    `INSERT INTO invoice_payments (invoice_id, amount_ore, payment_date, payment_method, account_number, journal_entry_id, payment_batch_id)
     VALUES (?, 12500, '2025-02-15', 'bank', '1930', ?, ?)`,
  ).run(invoiceId, jeId, batchId)
})

afterAll(() => {
  if (db) db.close()
})

describe('S50: pain.001 export för invoice-batch', () => {
  it('I1: validateBatchForExport succeeds for valid invoice batch', () => {
    const result = validateBatchForExport(db, batchId)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.valid).toBe(true)
    expect(result.data.issues).toHaveLength(0)
  })

  it('I2: validateBatchForExport flags customer without payment info', () => {
    // New customer without any payment info
    const bad = createCounterparty(db, {
      company_id: 1,
      name: 'Ingen-Bankgiro Kund',
      type: 'customer',
    })
    if (!bad.success) throw new Error('create failed')

    db.prepare(
      `INSERT INTO invoices (counterparty_id, fiscal_year_id, invoice_number, invoice_date, due_date, status, invoice_type, net_amount_ore, vat_amount_ore, total_amount_ore, paid_amount_ore)
       VALUES (?, ?, 'FAKT-101', '2025-02-01', '2025-03-01', 'paid', 'credit_note', 4000, 1000, 5000, 5000)`,
    ).run(bad.data.id, fyId)
    const invId = (
      db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }
    ).id

    db.prepare(
      `INSERT INTO journal_entries (company_id, fiscal_year_id, verification_number, verification_series, journal_date, description, status, source_type)
       VALUES (1, ?, 2, 'A', '2025-02-01', 'test', 'booked', 'auto_payment')`,
    ).run(fyId)
    const jeId = (
      db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }
    ).id

    db.prepare(
      `INSERT INTO payment_batches (fiscal_year_id, batch_type, payment_date, account_number, status)
       VALUES (?, 'invoice', '2025-02-16', '1930', 'completed')`,
    ).run(fyId)
    const badBatchId = (
      db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }
    ).id

    db.prepare(
      `INSERT INTO invoice_payments (invoice_id, amount_ore, payment_date, payment_method, account_number, journal_entry_id, payment_batch_id)
       VALUES (?, 5000, '2025-02-16', 'bank', '1930', ?, ?)`,
    ).run(invId, jeId, badBatchId)

    const result = validateBatchForExport(db, badBatchId)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.valid).toBe(false)
    expect(result.data.issues).toHaveLength(1)
    expect(result.data.issues[0].issue).toBe('missing_all_payment_info')
    expect(result.data.issues[0].counterpartyName).toBe('Ingen-Bankgiro Kund')
  })

  it('I3: generatePain001 produces valid XML for invoice batch', () => {
    const result = generatePain001(db, batchId)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)

    const xml = result.data.xml
    expect(xml).toContain('<?xml')
    expect(xml).toContain('CstmrCdtTrfInitn')
    expect(xml).toContain('<PmtInf>')
  })

  it('I4: XML contains customer name as creditor', () => {
    const result = generatePain001(db, batchId)
    if (!result.success) throw new Error(result.error)
    expect(result.data.xml).toContain('Kund AB')
  })

  it('I5: XML contains invoice_number as remittance', () => {
    const result = generatePain001(db, batchId)
    if (!result.success) throw new Error(result.error)
    expect(result.data.xml).toContain('FAKT-100')
  })

  it('I6: XML amount is correct (öre → kronor)', () => {
    const result = generatePain001(db, batchId)
    if (!result.success) throw new Error(result.error)
    // 12500 öre = 125.00 kr
    expect(result.data.xml).toContain('125.00')
  })

  it('I7: XML filename uses batch id and date', () => {
    const result = generatePain001(db, batchId)
    if (!result.success) throw new Error(result.error)
    expect(result.data.filename).toBe(`PAIN001_${batchId}_2025-02-15.xml`)
  })

  it('I8: PmtInfId references the batch id', () => {
    const result = generatePain001(db, batchId)
    if (!result.success) throw new Error(result.error)
    expect(result.data.xml).toContain(`BATCH-${batchId}`)
  })
})
