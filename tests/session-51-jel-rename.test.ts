/**
 * Session 51 — Fas 7: journal_entry_lines column rename (M48)
 *
 * Tests:
 * 1. Migration 018 schema verification
 * 2. Trigger survival (immutability, balance, M35 opening_balance exception)
 * 3. End-to-end smoke (invoice lifecycle with new column names)
 * 4. Export format M92 leak check (SIE4, SIE5, Excel)
 */
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
} from '../src/main/services/invoice-service'
import { exportSie4 } from '../src/main/services/sie4/sie4-export-service'
import { exportSie5 } from '../src/main/services/sie5/sie5-export-service'
import { exportExcel } from '../src/main/services/excel/excel-export-service'

let db: Database.Database

function seedBase(testDb: Database.Database) {
  testDb.exec(`
    INSERT INTO companies (id, org_number, name, fiscal_rule) VALUES (1, '559000-1234', 'Test AB', 'K2');
    INSERT INTO users (id, name, email) VALUES (1, 'Testare', 'test@test.se');
    INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date) VALUES (1, 1, '2025', '2025-01-01', '2025-12-31');
    INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date)
      VALUES (1, 1, 1, '2025-01-01', '2025-01-31');
    INSERT INTO verification_sequences (fiscal_year_id, series, last_number) VALUES (1, 'A', 0);
  `)
  return { companyId: 1, userId: 1, fyId: 1 }
}

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  db.close()
})

describe('Migration 018 — journal_entry_lines rename', () => {
  it('user_version = 18 after all migrations', () => {
    const uv = db.prepare('PRAGMA user_version').get() as { user_version: number }
    expect(uv.user_version).toBe(23)
  })

  it('journal_entry_lines has debit_ore, credit_ore, vat_ore columns', () => {
    const cols = db
      .prepare('PRAGMA table_info(journal_entry_lines)')
      .all() as { name: string }[]
    const colNames = cols.map((c) => c.name)
    expect(colNames).toContain('debit_ore')
    expect(colNames).toContain('credit_ore')
    expect(colNames).toContain('vat_ore')
    expect(colNames).not.toContain('debit_amount')
    expect(colNames).not.toContain('credit_amount')
    expect(colNames).not.toContain('vat_amount')
  })
})

describe('Trigger survival after migration 018', () => {
  it('immutability: UPDATE on booked line raises error', () => {
    seedBase(db)
    // Create a draft journal entry and book it
    db.exec(`
      INSERT INTO journal_entries (id, company_id, fiscal_year_id, verification_number, journal_date, description, status, source_type)
        VALUES (1, 1, 1, 1, '2025-01-15', 'Test', 'draft', 'manual');
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
        VALUES (1, 1, '1510', 10000, 0);
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
        VALUES (1, 2, '3001', 0, 10000);
      UPDATE journal_entries SET status = 'booked' WHERE id = 1;
    `)
    expect(() => {
      db.exec(
        `UPDATE journal_entry_lines SET debit_ore = 99999 WHERE journal_entry_id = 1 AND line_number = 1`,
      )
    }).toThrow(/kan inte ändras/i)
  })

  it('balance validation: unbalanced booking raises error', () => {
    seedBase(db)
    db.exec(`
      INSERT INTO journal_entries (id, company_id, fiscal_year_id, verification_number, journal_date, description, status, source_type)
        VALUES (2, 1, 1, 2, '2025-01-15', 'Obalanserad', 'draft', 'manual');
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
        VALUES (2, 1, '1510', 10000, 0);
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
        VALUES (2, 2, '3001', 0, 5000);
    `)
    expect(() => {
      db.exec(`UPDATE journal_entries SET status = 'booked' WHERE id = 2`)
    }).toThrow(/balanserar inte/i)
  })

  it('M35: opening_balance entries can be updated/deleted', () => {
    seedBase(db)
    db.exec(`
      INSERT INTO journal_entries (id, company_id, fiscal_year_id, verification_number, journal_date, description, status, source_type)
        VALUES (3, 1, 1, 3, '2025-01-01', 'IB', 'booked', 'opening_balance');
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
        VALUES (3, 1, '1930', 500000, 0);
      INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
        VALUES (3, 2, '2081', 0, 500000);
    `)
    // UPDATE should be allowed
    expect(() => {
      db.exec(
        `UPDATE journal_entry_lines SET debit_ore = 600000 WHERE journal_entry_id = 3 AND line_number = 1`,
      )
    }).not.toThrow()
    // DELETE should be allowed
    expect(() => {
      db.exec(
        `DELETE FROM journal_entry_lines WHERE journal_entry_id = 3 AND line_number = 2`,
      )
    }).not.toThrow()
  })
})

describe('E2E smoke: invoice lifecycle with renamed columns', () => {
  it('create → book → pay → verify balance', () => {
    const seed = seedBase(db)
    const cp = createCounterparty(db, { name: 'Kund AB', type: 'customer' })
    if (!cp.success) throw new Error(cp.error)

    const vatCode = db
      .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
      .get() as { id: number }
    const account = db
      .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
      .get() as { id: number }
    const prod = createProduct(db, {
      name: 'Konsulttjänst',
      default_price: 100_000,
      vat_code_id: vatCode.id,
      account_id: account.id,
    })
    if (!prod.success) throw new Error(prod.error)

    const draft = saveDraft(db, {
      fiscal_year_id: seed.fyId,
      counterparty_id: cp.data.id,
      invoice_date: '2025-01-15',
      due_date: '2025-02-15',
      payment_terms: 30,
      lines: [
        {
          product_id: prod.data.id,
          description: 'Konsulttimme',
          quantity: 2,
          unit_price_ore: 100_000,
          vat_code_id: vatCode.id,
          sort_order: 0,
        },
      ],
    })
    if (!draft.success) throw new Error(draft.error)

    const fin = finalizeDraft(db, draft.data.id)
    if (!fin.success) throw new Error(fin.error)

    // Verify journal lines use new column names and balance
    const jels = db
      .prepare(
        `SELECT debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ?`,
      )
      .all(fin.data.journal_entry_id) as {
      debit_ore: number
      credit_ore: number
    }[]

    const totalDebit = jels.reduce((s, l) => s + l.debit_ore, 0)
    const totalCredit = jels.reduce((s, l) => s + l.credit_ore, 0)
    expect(totalDebit).toBe(totalCredit)
    expect(totalDebit).toBeGreaterThan(0)

    // Pay
    const pay = payInvoice(db, {
      invoice_id: draft.data.id,
      amount_ore: totalDebit,
      payment_date: '2025-01-20',
      account_number: '1930',
    })
    if (!pay.success) throw new Error(pay.error)

    // Verify payment journal lines balance too
    const payJels = db
      .prepare(
        `SELECT debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ?`,
      )
      .all(pay.data.payment.journal_entry_id) as {
      debit_ore: number
      credit_ore: number
    }[]

    const payDebit = payJels.reduce((s, l) => s + l.debit_ore, 0)
    const payCredit = payJels.reduce((s, l) => s + l.credit_ore, 0)
    expect(payDebit).toBe(payCredit)
  })
})

describe('M92 export format — no _ore leak', () => {
  function seedWithBookedEntry(testDb: Database.Database) {
    const seed = seedBase(testDb)
    const cp = createCounterparty(testDb, { name: 'Export Kund', type: 'customer' })
    if (!cp.success) throw new Error(cp.error)

    const vatCode = testDb
      .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
      .get() as { id: number }
    const account = testDb
      .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
      .get() as { id: number }
    const prod = createProduct(testDb, {
      name: 'Exportprodukt',
      default_price: 50_000,
      vat_code_id: vatCode.id,
      account_id: account.id,
    })
    if (!prod.success) throw new Error(prod.error)

    const draft = saveDraft(testDb, {
      fiscal_year_id: seed.fyId,
      counterparty_id: cp.data.id,
      invoice_date: '2025-01-15',
      due_date: '2025-02-15',
      payment_terms: 30,
      lines: [
        {
          product_id: prod.data.id,
          description: 'Produkt',
          quantity: 1,
          unit_price_ore: 50_000,
          vat_code_id: vatCode.id,
          sort_order: 0,
        },
      ],
    })
    if (!draft.success) throw new Error(draft.error)

    const fin = finalizeDraft(testDb, draft.data.id)
    if (!fin.success) throw new Error(fin.error)

    return seed
  }

  it('SIE4 output does not contain _ore', () => {
    const seed = seedWithBookedEntry(db)
    const result = exportSie4(db, { fiscalYearId: seed.fyId })
    const sie4Text = result.content.toString('utf-8')
    expect(sie4Text).not.toContain('_ore')
  })

  it('SIE5 output does not contain _ore', () => {
    const seed = seedWithBookedEntry(db)
    const sie5 = exportSie5(db, { fiscalYearId: seed.fyId })
    expect(sie5).not.toContain('_ore')
  })

  it('Excel output does not contain _ore in headers or values', async () => {
    const seed = seedWithBookedEntry(db)
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(result.buffer)

    workbook.eachSheet((sheet) => {
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          const val = String(cell.value ?? '')
          expect(val).not.toContain('_ore')
        })
      })
    })
  })
})
