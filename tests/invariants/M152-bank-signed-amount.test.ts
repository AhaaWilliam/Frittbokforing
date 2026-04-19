import { describe, it, expect } from 'vitest'
import { createTestDb } from '../helpers/create-test-db'

/**
 * M152 — Signed amount i bank-extern rådata.
 *
 * bank_transactions.amount_ore är signerad (positiv=inkommande, negativ=utgående).
 * Detta avviker från M137 (belopp positiva i DB) eftersom bank_transactions
 * är extern rådata från kontoutdrag, inte domänenhet.
 */

describe('M152 — bank_transactions.amount_ore är signerad', () => {
  it('schemat har CHECK som tillåter negativ (amount_ore <> 0)', () => {
    const db = createTestDb()
    const schema = (
      db
        .prepare(
          `SELECT sql FROM sqlite_master WHERE type='table' AND name='bank_transactions'`,
        )
        .get() as { sql: string }
    ).sql
    // Måste INTE ha "amount_ore >= 0" (det skulle bryta M152)
    expect(schema).not.toMatch(/amount_ore\s*>=\s*0/)
    // Måste ha "amount_ore <> 0" (tillåter negativ + positiv, inte noll)
    expect(schema).toMatch(/amount_ore\s*<>\s*0/)
  })

  it('direkt-INSERT av negativt amount accepteras', () => {
    const db = createTestDb()
    db.exec(`
      INSERT INTO companies (id, org_number, name, fiscal_rule, share_capital, registration_date)
      VALUES (1, '556036-0793', 'Test AB', 'K2', 2500000, '2025-01-15');
      INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
      VALUES (1, 1, '2026', '2026-01-01', '2026-12-31');
      INSERT INTO bank_statements (id, company_id, fiscal_year_id, statement_number,
        bank_account_iban, statement_date, opening_balance_ore, closing_balance_ore,
        import_file_hash)
      VALUES (1, 1, 1, 'STMT-1', 'SE1234567890', '2026-02-28', 10000, 0, 'hash1');
    `)
    // Negativt amount (utgående betalning)
    expect(() => {
      db.exec(`INSERT INTO bank_transactions
        (bank_statement_id, booking_date, value_date, amount_ore,
         reconciliation_status)
        VALUES (1, '2026-02-15', '2026-02-15', -5000, 'unmatched')`)
    }).not.toThrow()

    // Positivt amount (inkommande)
    expect(() => {
      db.exec(`INSERT INTO bank_transactions
        (bank_statement_id, booking_date, value_date, amount_ore,
         reconciliation_status)
        VALUES (1, '2026-02-16', '2026-02-16', 7500, 'unmatched')`)
    }).not.toThrow()
  })

  it('amount_ore = 0 blockeras (CHECK <> 0)', () => {
    const db = createTestDb()
    db.exec(`
      INSERT INTO companies (id, org_number, name, fiscal_rule, share_capital, registration_date)
      VALUES (1, '556036-0793', 'Test AB', 'K2', 2500000, '2025-01-15');
      INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
      VALUES (1, 1, '2026', '2026-01-01', '2026-12-31');
      INSERT INTO bank_statements (id, company_id, fiscal_year_id, statement_number,
        bank_account_iban, statement_date, opening_balance_ore, closing_balance_ore,
        import_file_hash)
      VALUES (1, 1, 1, 'STMT-1', 'SE1234567890', '2026-02-28', 0, 0, 'hash2');
    `)
    expect(() => {
      db.exec(`INSERT INTO bank_transactions
        (bank_statement_id, booking_date, value_date, amount_ore,
         reconciliation_status)
        VALUES (1, '2026-02-15', '2026-02-15', 0, 'unmatched')`)
    }).toThrow(/CHECK/i)
  })
})
