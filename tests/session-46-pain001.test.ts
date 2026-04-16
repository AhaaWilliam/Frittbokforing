/**
 * Session 46: pain.001 export + bankgiro validation — service-level tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany, updateCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import {
  validateBankgiroChecksum,
  normalizeBankgiro,
} from '../src/shared/bankgiro-validation'
import {
  validateBatchForExport,
  generatePain001,
  markBatchExported,
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
let supplierId: number

beforeAll(() => {
  db = createTestDb()
  createCompany(db, {
    name: 'Pain001 Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 50000_00,
    registration_date: '2025-01-15',
    fiscal_year_start: '2025-01-01',
    fiscal_year_end: '2025-12-31',
  })
  // Add bankgiro to company
  db.prepare("UPDATE companies SET bankgiro = '1234-5678' WHERE id = 1").run()

  fyId = (db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }).id

  // Create supplier with bankgiro
  const supplier = createCounterparty(db, {
    name: 'Leverantör AB',
    type: 'supplier',
    org_number: '559999-0001',
    bankgiro: '5678-9012',
  })
  if (!supplier.success) throw new Error('Supplier creation failed')
  supplierId = supplier.data.id

  // Create a payment batch with an expense payment
  // First create a minimal expense + payment for the batch
  const vatCode = db.prepare("SELECT id FROM vat_codes WHERE code = 'IP1' LIMIT 1").get() as { id: number }

  // Insert expense directly (minimal for test)
  db.prepare(`INSERT INTO expenses (counterparty_id, fiscal_year_id, expense_date, due_date, status, supplier_invoice_number, total_amount_ore, paid_amount_ore) VALUES (?, ?, '2025-02-01', '2025-03-01', 'unpaid', 'INV-001', 12500, 12500)`).run(supplierId, fyId)
  const expenseId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id

  // Create journal entry for expense
  db.prepare(`INSERT INTO journal_entries (company_id, fiscal_year_id, verification_number, verification_series, journal_date, description, status, source_type) VALUES (1, ?, 1, 'B', '2025-02-01', 'Test expense', 'booked', 'auto_expense')`).run(fyId)
  const jeId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id

  // Create payment batch
  db.prepare(`INSERT INTO payment_batches (fiscal_year_id, batch_type, payment_date, account_number, status) VALUES (?, 'expense', '2025-02-15', '1930', 'completed')`).run(fyId)
  const batchId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id

  // Create expense payment linked to batch
  db.prepare(`INSERT INTO expense_payments (expense_id, amount_ore, payment_date, payment_method, account_number, journal_entry_id, payment_batch_id) VALUES (?, 12500, '2025-02-15', 'bankgiro', '1930', ?, ?)`).run(expenseId, jeId, batchId)
})

afterAll(() => {
  if (db) db.close()
})

describe('S46: Bankgiro validation', () => {
  it('BG1: valid bankgiro passes checksum', () => {
    // Known valid: 5805-6201 (Luhn valid)
    expect(validateBankgiroChecksum('58056201')).toBe(true)
  })

  it('BG2: invalid checksum fails', () => {
    expect(validateBankgiroChecksum('12345679')).toBe(false)
  })

  it('BG3: bankgiro with hyphen handled', () => {
    expect(normalizeBankgiro('5805-6201')).toBe('58056201')
  })

  it('BG4: too short bankgiro fails', () => {
    expect(validateBankgiroChecksum('12345')).toBe(false)
  })

  it('BG5: non-digit fails', () => {
    expect(validateBankgiroChecksum('1234-ABCD')).toBe(false)
  })
})

describe('S46: pain.001 export', () => {
  it('P1: validateBatchForExport succeeds for valid batch', () => {
    const result = validateBatchForExport(db, 1)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.valid).toBe(true)
    expect(result.data.issues).toHaveLength(0)
  })

  it('P2: validateBatchForExport fails for non-existent batch', () => {
    const result = validateBatchForExport(db, 99999)
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected failure')
    expect(result.code).toBe('NOT_FOUND')
  })

  it('P3: validateBatchForExport flags missing company bankgiro', () => {
    // Temporarily remove company bankgiro
    db.prepare('UPDATE companies SET bankgiro = NULL WHERE id = 1').run()
    const result = validateBatchForExport(db, 1)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.valid).toBe(false)
    expect(result.data.batchIssue).toBe('company_missing_bankgiro')
    // Restore
    db.prepare("UPDATE companies SET bankgiro = '1234-5678' WHERE id = 1").run()
  })

  it('P4: generatePain001 produces valid XML structure', () => {
    const result = generatePain001(db, 1)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)

    const xml = result.data.xml
    expect(xml).toContain('<?xml')
    expect(xml).toContain('CstmrCdtTrfInitn')
    expect(xml).toContain('GrpHdr')
    expect(xml).toContain('PmtInf')
    expect(xml).toContain('CdtTrfTxInf')
  })

  it('P5: pain.001 contains correct amounts (öre→kronor)', () => {
    const result = generatePain001(db, 1)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    // 12500 öre = 125.00 kr
    expect(result.data.xml).toContain('125.00')
  })

  it('P6: pain.001 contains company name', () => {
    const result = generatePain001(db, 1)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.xml).toContain('Pain001 Test AB')
  })

  it('P7: pain.001 contains supplier name', () => {
    const result = generatePain001(db, 1)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.xml).toContain('Leverantör AB')
  })

  it('P8: pain.001 contains remittance info', () => {
    const result = generatePain001(db, 1)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.xml).toContain('INV-001')
  })

  it('P9: markBatchExported updates payment_batches', () => {
    markBatchExported(db, 1, 'pain001', '/tmp/test.xml')
    const batch = db.prepare('SELECT exported_at, export_format, export_filename FROM payment_batches WHERE id = 1').get() as { exported_at: string; export_format: string; export_filename: string }
    expect(batch.export_format).toBe('pain001')
    expect(batch.export_filename).toBe('/tmp/test.xml')
    expect(batch.exported_at).not.toBeNull()
  })

  it('P10: validateBatchForExport flags already exported batch', () => {
    // batch 1 was marked exported in P9
    const result = validateBatchForExport(db, 1)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.valid).toBe(false)
    expect(result.data.batchIssue).toBe('already_exported')
  })

  // ═══ Migration ═══

  it('P11: counterparty payment columns exist', () => {
    const info = db.prepare("PRAGMA table_info('counterparties')").all() as Array<{ name: string }>
    const cols = info.map(c => c.name)
    expect(cols).toContain('bankgiro')
    expect(cols).toContain('plusgiro')
    expect(cols).toContain('bank_account')
    expect(cols).toContain('bank_clearing')
  })

  it('P12: payment_batches export columns exist', () => {
    const info = db.prepare("PRAGMA table_info('payment_batches')").all() as Array<{ name: string }>
    const cols = info.map(c => c.name)
    expect(cols).toContain('exported_at')
    expect(cols).toContain('export_format')
    expect(cols).toContain('export_filename')
  })
})
