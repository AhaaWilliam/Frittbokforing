import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import {
  saveDraft,
  finalizeDraft,
  payInvoice,
} from '../src/main/services/invoice-service'

let db: Database.Database

const VALID_COMPANY = {
  name: 'Test AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2026-01-15',
  fiscal_year_start: '2026-01-01',
  fiscal_year_end: '2026-12-31',
}

function seedBase(testDb: Database.Database) {
  createCompany(testDb, VALID_COMPANY)
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  const cp = createCounterparty(testDb, { name: 'Kund AB', type: 'customer' })
  if (!cp.success) throw new Error('CP failed')
  const supplierCp = createCounterparty(testDb, { name: 'Leverantör AB', type: 'supplier' })
  if (!supplierCp.success) throw new Error('Supplier CP failed')
  const vatCode = testDb.prepare("SELECT id FROM vat_codes WHERE code = 'MP1'").get() as { id: number }
  const inVatCode = testDb.prepare("SELECT id FROM vat_codes WHERE code = 'IP1'").get() as { id: number }
  return {
    fiscalYearId: fy.id,
    cpId: cp.data.id,
    supplierCpId: supplierCp.data.id,
    vatCodeId: vatCode.id,
    inVatCodeId: inVatCode.id,
  }
}

function bookInvoice(testDb: Database.Database, seed: ReturnType<typeof seedBase>, date: string) {
  const draft = saveDraft(testDb, {
    counterparty_id: seed.cpId,
    fiscal_year_id: seed.fiscalYearId,
    invoice_date: date,
    due_date: date,
    lines: [{
      product_id: null,
      description: 'Test',
      account_number: '3001',
      quantity: 1,
      unit_price_ore: 10000,
      vat_code_id: seed.vatCodeId,
      sort_order: 0,
    }],
  })
  if (!draft.success) throw new Error('Draft failed')
  const fin = finalizeDraft(testDb, draft.data.id)
  if (!fin.success) throw new Error('Finalize failed: ' + fin.error)
  return {
    invoiceId: fin.data.id,
    journalEntryId: fin.data.journal_entry_id!,
    totalAmountOre: fin.data.total_amount_ore,
  }
}

beforeEach(() => { db = createTestDb() })
afterEach(() => { db.close() })

describe('Migration 031: Immutability-hardening triggers', () => {
  it('trg_immutable_source_type blocks UPDATE on booked entry', () => {
    const seed = seedBase(db)
    const inv = bookInvoice(db, seed, '2026-03-01')
    const jeId = inv.journalEntryId

    expect(() => {
      db.prepare("UPDATE journal_entries SET source_type = 'manual' WHERE id = ?").run(jeId)
    }).toThrow('source_type kan inte ändras på bokförd verifikation.')
  })

  it('trg_immutable_source_type allows UPDATE on draft', () => {
    const seed = seedBase(db)
    // Create a manual draft journal entry
    db.prepare(`INSERT INTO journal_entries (company_id, fiscal_year_id, verification_series, journal_date, description, status, source_type)
      VALUES (1, ?, 'C', '2026-03-01', 'Test draft', 'draft', 'manual')`).run(seed.fiscalYearId)
    const jeId = (db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id

    // Should not throw — draft can change source_type
    db.prepare("UPDATE journal_entries SET source_type = 'auto_invoice' WHERE id = ?").run(jeId)
    const row = db.prepare('SELECT source_type FROM journal_entries WHERE id = ?').get(jeId) as { source_type: string }
    expect(row.source_type).toBe('auto_invoice')
  })

  it('trg_immutable_source_reference blocks UPDATE on booked entry', () => {
    const seed = seedBase(db)
    const inv = bookInvoice(db, seed, '2026-03-01')
    const jeId = inv.journalEntryId

    expect(() => {
      db.prepare("UPDATE journal_entries SET source_reference = 'tampered' WHERE id = ?").run(jeId)
    }).toThrow('source_reference kan inte ändras på bokförd verifikation.')
  })

  it('trg_immutable_corrects_entry_id blocks UPDATE on booked entry', () => {
    const seed = seedBase(db)
    const inv = bookInvoice(db, seed, '2026-03-01')
    const jeId = inv.journalEntryId

    expect(() => {
      db.prepare('UPDATE journal_entries SET corrects_entry_id = 999 WHERE id = ?').run(jeId)
    }).toThrow('corrects_entry_id kan inte ändras på bokförd verifikation.')
  })

  it('trg_no_correct_with_payments blocks status→corrected when invoice_payments exist', () => {
    const seed = seedBase(db)
    const inv = bookInvoice(db, seed, '2026-03-01')
    const inv2 = bookInvoice(db, seed, '2026-03-02') // second entry to use as corrected_by_id
    const jeId = inv.journalEntryId

    // Pay the invoice
    const payResult = payInvoice(db, {
      invoice_id: inv.invoiceId,
      amount_ore: inv.totalAmountOre,
      payment_date: '2026-03-15',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(payResult.success).toBe(true)

    // Try to mark as corrected — should fail because of payments
    expect(() => {
      db.prepare("UPDATE journal_entries SET status = 'corrected', corrected_by_id = ? WHERE id = ?")
        .run(inv2.journalEntryId, jeId)
    }).toThrow('Kan inte korrigera verifikat med beroende betalningar.')
  })

  it('correction flow works when no payments exist (status→corrected + corrected_by_id)', () => {
    const seed = seedBase(db)
    const inv = bookInvoice(db, seed, '2026-03-01')
    const inv2 = bookInvoice(db, seed, '2026-03-02') // second entry to use as corrected_by_id
    const jeId = inv.journalEntryId

    // Mark as corrected — no payments, so this should work
    db.prepare("UPDATE journal_entries SET status = 'corrected', corrected_by_id = ? WHERE id = ?")
      .run(inv2.journalEntryId, jeId)

    const row = db.prepare('SELECT status, corrected_by_id FROM journal_entries WHERE id = ?').get(jeId) as { status: string; corrected_by_id: number }
    expect(row.status).toBe('corrected')
    expect(row.corrected_by_id).toBe(inv2.journalEntryId)
  })
})
