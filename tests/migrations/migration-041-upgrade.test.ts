import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../../src/main/migrations'

let db: Database.Database

afterEach(() => {
  if (db) db.close()
})

/** Run migrations from..upTo (1-indexed, inclusive) with FK-off handling */
function runMigrations(testDb: Database.Database, upTo: number, from = 1): void {
  for (let i = from - 1; i < upTo; i++) {
    // M122: table-recreate on tables with inbound FK
    const needsFkOff = i === 20 || i === 21 || i === 22 || i === 37
    if (needsFkOff) testDb.pragma('foreign_keys = OFF')

    testDb.exec('BEGIN EXCLUSIVE')
    testDb.exec(migrations[i].sql)
    migrations[i].programmatic?.(testDb)
    testDb.pragma(`user_version = ${i + 1}`)
    testDb.exec('COMMIT')

    if (needsFkOff) {
      testDb.pragma('foreign_keys = ON')
      const fkCheck = testDb.pragma('foreign_key_check') as unknown[]
      if (fkCheck.length > 0) {
        throw new Error(`Migration ${i + 1} FK check failed: ${JSON.stringify(fkCheck)}`)
      }
    }
  }
}

describe('Migration 041 upgrade smoke test (S58 F66-d)', () => {
  it('upgrade från 40 till 41: schema ändras, befintlig data bevaras, foreign_key_check tom', () => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    // Step 1: Kör migrationer 1–40
    runMigrations(db, 40)
    expect(db.pragma('user_version', { simple: true })).toBe(40)

    // Step 2: Seed en befintlig matched-rad (invoice-match)
    db.exec(`
      INSERT INTO companies (id, org_number, name, fiscal_rule) VALUES (1, '559000-1234', 'Test AB', 'K2');
      INSERT INTO users (id, name, email) VALUES (1, 'Testare', 'test@test.se');
      INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
        VALUES (1, 1, '2025', '2025-01-01', '2025-12-31');
      INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date)
        VALUES (1, 1, 1, '2025-01-01', '2025-01-31');
      INSERT INTO counterparties (id, name, type) VALUES (1, 'Kund', 'customer');
      INSERT INTO invoices (id, counterparty_id, fiscal_year_id, invoice_type, invoice_number,
        invoice_date, due_date, status, total_amount_ore, vat_amount_ore, net_amount_ore, paid_amount_ore)
        VALUES (1, 1, 1, 'customer_invoice', 'INV-1', '2025-01-15', '2025-02-14', 'paid', 10000, 0, 10000, 10000);
      INSERT INTO journal_entries (id, company_id, fiscal_year_id, verification_number, verification_series,
        journal_date, description, status, source_type)
        VALUES (1, 1, 1, 1, 'A', '2025-01-20', 'Betalning INV-1', 'booked', 'auto_payment');
      INSERT INTO invoice_payments (id, invoice_id, journal_entry_id, payment_date, amount_ore, account_number)
        VALUES (1, 1, 1, '2025-01-20', 10000, '1930');
      INSERT INTO bank_statements (id, company_id, fiscal_year_id, statement_number, bank_account_iban,
        statement_date, opening_balance_ore, closing_balance_ore, import_file_hash)
        VALUES (1, 1, 1, 'STMT-1', 'SE123', '2025-01-31', 0, 10000, 'hash1');
      INSERT INTO bank_transactions (id, bank_statement_id, booking_date, value_date, amount_ore,
        reconciliation_status) VALUES (1, 1, '2025-01-20', '2025-01-20', 10000, 'matched');
      INSERT INTO bank_reconciliation_matches (bank_transaction_id, matched_entity_type, matched_entity_id,
        invoice_payment_id, match_method)
        VALUES (1, 'invoice', 1, 1, 'manual');
    `)

    // Step 3: Kör migration 041
    runMigrations(db, 41, 41)
    expect(db.pragma('user_version', { simple: true })).toBe(41)

    // Step 4: Verifiera schema
    const brmSql = (
      db
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='bank_reconciliation_matches'")
        .get() as { sql: string }
    ).sql
    expect(brmSql).toContain('fee_journal_entry_id')
    expect(brmSql).toContain("'auto_fee'")
    expect(brmSql).toContain("'auto_interest_income'")
    expect(brmSql).toContain("'auto_interest_expense'")
    expect(brmSql).toContain("'bank_fee'")

    // Befintlig data bevarad
    const match = db
      .prepare('SELECT matched_entity_type, matched_entity_id, invoice_payment_id, fee_journal_entry_id, match_method FROM bank_reconciliation_matches WHERE bank_transaction_id = 1')
      .get() as {
        matched_entity_type: string
        matched_entity_id: number
        invoice_payment_id: number
        fee_journal_entry_id: number | null
        match_method: string
      }
    expect(match.matched_entity_type).toBe('invoice')
    expect(match.matched_entity_id).toBe(1)
    expect(match.invoice_payment_id).toBe(1)
    expect(match.fee_journal_entry_id).toBeNull()
    expect(match.match_method).toBe('manual')

    // BkTxCd-kolumner på bank_transactions
    const btCols = db.prepare('PRAGMA table_info(bank_transactions)').all() as Array<{ name: string }>
    const colNames = btCols.map((c) => c.name)
    expect(colNames).toContain('bank_tx_domain')
    expect(colNames).toContain('bank_tx_family')
    expect(colNames).toContain('bank_tx_subfamily')

    // Foreign_key_check — ska vara tom
    const fkCheck = db.pragma('foreign_key_check') as unknown[]
    expect(fkCheck).toEqual([])
  })

  it('migration 041: ny bank_fee-rad med fee_journal_entry_id accepteras; exactly-one-of CHECK enforced', () => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    runMigrations(db, 41)
    expect(db.pragma('user_version', { simple: true })).toBe(41)

    // Minimal seed
    db.exec(`
      INSERT INTO companies (id, org_number, name, fiscal_rule) VALUES (1, '559000-1234', 'Test AB', 'K2');
      INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
        VALUES (1, 1, '2025', '2025-01-01', '2025-12-31');
      INSERT INTO journal_entries (id, company_id, fiscal_year_id, verification_number, verification_series,
        journal_date, description, status, source_type)
        VALUES (1, 1, 1, 1, 'B', '2025-01-15', 'Bankavgift januari', 'booked', 'auto_bank_fee');
      INSERT INTO bank_statements (id, company_id, fiscal_year_id, statement_number, bank_account_iban,
        statement_date, opening_balance_ore, closing_balance_ore, import_file_hash)
        VALUES (1, 1, 1, 'STMT', 'SE1', '2025-01-31', 0, -5000, 'h');
      INSERT INTO bank_transactions (id, bank_statement_id, booking_date, value_date, amount_ore,
        reconciliation_status) VALUES (1, 1, '2025-01-15', '2025-01-15', -5000, 'matched');
    `)

    // Happy path: bank_fee-rad med fee_journal_entry_id + matched_entity_id=NULL
    db.prepare(
      `INSERT INTO bank_reconciliation_matches (bank_transaction_id, matched_entity_type, matched_entity_id,
         fee_journal_entry_id, match_method) VALUES (?, 'bank_fee', NULL, ?, 'auto_fee')`,
    ).run(1, 1)

    const row = db
      .prepare('SELECT matched_entity_type, fee_journal_entry_id FROM bank_reconciliation_matches WHERE bank_transaction_id = 1')
      .get() as { matched_entity_type: string; fee_journal_entry_id: number }
    expect(row.matched_entity_type).toBe('bank_fee')
    expect(row.fee_journal_entry_id).toBe(1)

    // Negative: bank_fee utan fee_journal_entry_id ska avvisas
    expect(() => {
      db.prepare(
        `INSERT INTO bank_reconciliation_matches (bank_transaction_id, matched_entity_type, matched_entity_id,
           fee_journal_entry_id, match_method) VALUES (1, 'bank_fee', NULL, NULL, 'auto_fee')`,
      ).run()
    }).toThrow(/CHECK/)

    // Negative: invoice-typ med fee_journal_entry_id ska avvisas
    expect(() => {
      db.prepare(
        `INSERT INTO bank_reconciliation_matches (bank_transaction_id, matched_entity_type, matched_entity_id,
           invoice_payment_id, fee_journal_entry_id, match_method)
         VALUES (1, 'invoice', 99, 99, 1, 'manual')`,
      ).run()
    }).toThrow(/(CHECK|UNIQUE)/)
  })
})
