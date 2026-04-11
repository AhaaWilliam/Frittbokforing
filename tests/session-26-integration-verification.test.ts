/**
 * Session 26 – Integration verification
 * Verifies that all K1–K4 fixes are in place and work correctly together.
 *
 * K1  – bookYearEndResult runs atomically inside createNewFiscalYear
 * K2  – todayLocal() returns local-time date (YYYY-MM-DD format)
 * K3  – todayLocal() matches local Date components, not UTC
 * K4  – deleteDraft wraps deletes in a transaction
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { createNewFiscalYear } from '../src/main/services/fiscal-service'
import {
  calculateNetResult,
  bookYearEndResult,
} from '../src/main/services/opening-balance-service'
import { deleteDraft } from '../src/main/services/invoice-service'
import { todayLocal } from '../src/shared/date-utils'

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

let companyId: number
let fyId: number

function seedBookedEntry(opts: {
  debitAccount: string
  creditAccount: string
  amount: number
  date: string
  series?: string
}) {
  const series = opts.series ?? 'A'
  const maxVer = db
    .prepare(
      `SELECT COALESCE(MAX(verification_number), 0) + 1 as n
       FROM journal_entries WHERE fiscal_year_id = ? AND verification_series = ?`,
    )
    .get(fyId, series) as { n: number }

  const je = db
    .prepare(
      `INSERT INTO journal_entries (
        company_id, fiscal_year_id, verification_number, verification_series,
        journal_date, description, status, source_type
      ) VALUES (?, ?, ?, ?, ?, 'Test', 'draft', 'manual')`,
    )
    .run(companyId, fyId, maxVer.n, series, opts.date)
  const jeId = Number(je.lastInsertRowid)

  db.prepare(
    `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
     VALUES (?, 1, ?, ?, 0)`,
  ).run(jeId, opts.debitAccount, opts.amount)
  db.prepare(
    `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
     VALUES (?, 2, ?, 0, ?)`,
  ).run(jeId, opts.creditAccount, opts.amount)

  db.prepare("UPDATE journal_entries SET status = 'booked' WHERE id = ?").run(
    jeId,
  )
  return jeId
}

function seedDraftInvoice(): number {
  const cpResult = db
    .prepare(
      `INSERT INTO counterparties (name, type, org_number, is_active)
       VALUES ('Kund AB', 'customer', '556000-0001', 1)`,
    )
    .run()
  const counterpartyId = Number(cpResult.lastInsertRowid)

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
    ) VALUES (?, 'Produkt 1', 1, 60000, 1, 60000, 15000, 1)`,
  ).run(invoiceId)
  db.prepare(
    `INSERT INTO invoice_lines (
      invoice_id, description, quantity, unit_price_ore, vat_code_id,
      line_total_ore, vat_amount_ore, sort_order
    ) VALUES (?, 'Produkt 2', 1, 40000, 1, 40000, 10000, 2)`,
  ).run(invoiceId)

  return invoiceId
}

beforeEach(() => {
  db = createTestDb()
  createCompany(db, VALID_COMPANY)
  const co = db.prepare('SELECT id FROM companies LIMIT 1').get() as {
    id: number
  }
  companyId = co.id
  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  fyId = fy.id
})

afterEach(() => {
  db.close()
})

// ─── K1: bookYearEndResult runs atomically inside createNewFiscalYear ──────────

describe('K1 – atomic year-end result booking', () => {
  it('books C-series result and creates new FY in one transaction', () => {
    seedBookedEntry({
      debitAccount: '1510',
      creditAccount: '3001',
      amount: 5_000_000,
      date: '2025-06-15',
    })

    const netResult = calculateNetResult(db, fyId)
    expect(netResult).toBe(5_000_000)

    const result = createNewFiscalYear(db, companyId, fyId, {
      confirmBookResult: true,
      netResultOre: 5_000_000,
    })

    // New FY created
    expect(result.fiscalYear.start_date).toBe('2026-01-01')

    // C-series voucher exists in old FY
    const cVouchers = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM journal_entries WHERE verification_series = 'C' AND fiscal_year_id = ?",
      )
      .get(fyId) as { cnt: number }
    expect(cVouchers.cnt).toBe(1)

    // O-series opening balance exists in new FY
    const obVouchers = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM journal_entries WHERE verification_series = 'O' AND fiscal_year_id = ?",
      )
      .get(result.fiscalYear.id) as { cnt: number }
    expect(obVouchers.cnt).toBe(1)
  })

  it('rolls back C-series voucher when new FY creation fails', () => {
    seedBookedEntry({
      debitAccount: '1510',
      creditAccount: '3001',
      amount: 5_000_000,
      date: '2025-06-15',
    })

    // Force conflict: pre-create the target FY
    db.prepare(
      `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
       VALUES (?, '2026', '2026-01-01', '2026-12-31')`,
    ).run(companyId)

    expect(() =>
      createNewFiscalYear(db, companyId, fyId, {
        confirmBookResult: true,
        netResultOre: 5_000_000,
      }),
    ).toThrow('Räkenskapsår för denna period finns redan')

    // C-series voucher must NOT exist — rolled back with the transaction
    const cVouchers = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM journal_entries WHERE verification_series = 'C' AND fiscal_year_id = ?",
      )
      .get(fyId) as { cnt: number }
    expect(cVouchers.cnt).toBe(0)
  })

  it('race condition guard rejects stale netResultOre', () => {
    seedBookedEntry({
      debitAccount: '1510',
      creditAccount: '3001',
      amount: 5_000_000,
      date: '2025-06-15',
    })

    expect(() =>
      createNewFiscalYear(db, companyId, fyId, {
        confirmBookResult: true,
        netResultOre: 1_000, // deliberately wrong
      }),
    ).toThrow('ändrats sedan dialogen öppnades')

    // No new FY
    const fys = db
      .prepare('SELECT COUNT(*) as cnt FROM fiscal_years')
      .get() as { cnt: number }
    expect(fys.cnt).toBe(1)
  })

  it('double-booking guard rejects when result is already booked', () => {
    seedBookedEntry({
      debitAccount: '1510',
      creditAccount: '3001',
      amount: 5_000_000,
      date: '2025-06-15',
    })

    // Book via the proper function first
    bookYearEndResult(db, fyId, 5_000_000)

    // Actual net result is now 0 (8999 cancels out 3001) — race condition guard fires
    expect(() =>
      createNewFiscalYear(db, companyId, fyId, {
        confirmBookResult: true,
        netResultOre: 5_000_000,
      }),
    ).toThrow()
  })
})

// ─── K2+K3: todayLocal() returns local-time date ───────────────────────────────

describe('K2+K3 – todayLocal() local-time date', () => {
  it('returns a YYYY-MM-DD formatted string of length 10', () => {
    const date = todayLocal()
    expect(date).toHaveLength(10)
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('matches local Date components, not UTC', () => {
    const d = new Date()
    const date = todayLocal()
    const [y, m, day] = date.split('-').map(Number)
    expect(y).toBe(d.getFullYear())
    expect(m).toBe(d.getMonth() + 1)
    expect(day).toBe(d.getDate())
  })
})

// ─── K4: deleteDraft wraps deletes in a transaction ───────────────────────────

describe('K4 – deleteDraft atomically removes invoice and lines', () => {
  it('removes the invoice row and all invoice_lines in one operation', () => {
    const invoiceId = seedDraftInvoice()

    const result = deleteDraft(db, invoiceId)
    expect(result.success).toBe(true)

    const invoiceRow = db
      .prepare('SELECT COUNT(*) as cnt FROM invoices WHERE id = ?')
      .get(invoiceId) as { cnt: number }
    expect(invoiceRow.cnt).toBe(0)

    const lineRows = db
      .prepare('SELECT COUNT(*) as cnt FROM invoice_lines WHERE invoice_id = ?')
      .get(invoiceId) as { cnt: number }
    expect(lineRows.cnt).toBe(0)
  })

  it('returns INVOICE_NOT_DRAFT without deleting when status is not draft', () => {
    const invoiceId = seedDraftInvoice()
    db.prepare("UPDATE invoices SET status = 'unpaid' WHERE id = ?").run(
      invoiceId,
    )

    const result = deleteDraft(db, invoiceId)
    expect(result.success).toBe(false)
    expect(result.code).toBe('INVOICE_NOT_DRAFT')

    // Invoice and lines must still exist
    const invoiceRow = db
      .prepare('SELECT COUNT(*) as cnt FROM invoices WHERE id = ?')
      .get(invoiceId) as { cnt: number }
    expect(invoiceRow.cnt).toBe(1)

    const lineRows = db
      .prepare('SELECT COUNT(*) as cnt FROM invoice_lines WHERE invoice_id = ?')
      .get(invoiceId) as { cnt: number }
    expect(lineRows.cnt).toBe(2)
  })
})
