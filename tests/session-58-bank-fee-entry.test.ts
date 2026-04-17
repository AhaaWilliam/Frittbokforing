import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { _createBankFeeEntryTx } from '../src/main/services/bank/bank-fee-entry-service'
import type { FeeClassification } from '../src/main/services/bank/bank-fee-classifier'

function seed(db: Database.Database): { companyId: number; fyId: number } {
  db.exec(`
    INSERT INTO companies (id, org_number, name, fiscal_rule)
      VALUES (1, '559000-1234', 'Fee AB', 'K2');
    INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
      VALUES (1, 1, '2026', '2026-01-01', '2026-12-31');
  `)
  for (let m = 1; m <= 12; m++) {
    const start = `2026-${String(m).padStart(2, '0')}-01`
    const endDay = new Date(2026, m, 0).getDate()
    const end = `2026-${String(m).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
    db.prepare(
      'INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date) VALUES (1, 1, ?, ?, ?)',
    ).run(m, start, end)
  }
  return { companyId: 1, fyId: 1 }
}

function insertTx(
  db: Database.Database,
  s: { companyId: number; fyId: number },
  amountOre: number,
  valueDate = '2026-03-15',
): number {
  const stmtRes = db
    .prepare(
      `INSERT INTO bank_statements (company_id, fiscal_year_id, statement_number, bank_account_iban,
         statement_date, opening_balance_ore, closing_balance_ore, source_format, import_file_hash)
       VALUES (?, ?, 'STMT', 'SE4550000000058398257466', ?, 0, ?, 'camt.053', ?)`,
    )
    .run(
      s.companyId,
      s.fyId,
      valueDate,
      amountOre,
      `h-${valueDate}-${amountOre}`,
    )
  const statementId = Number(stmtRes.lastInsertRowid)
  const txRes = db
    .prepare(
      `INSERT INTO bank_transactions (bank_statement_id, booking_date, value_date, amount_ore)
       VALUES (?, ?, ?, ?)`,
    )
    .run(statementId, valueDate, valueDate, amountOre)
  return Number(txRes.lastInsertRowid)
}

function classBankFee(): FeeClassification {
  return {
    type: 'bank_fee',
    account: '6570',
    series: 'B',
    score: 100,
    confidence: 'HIGH',
    reasons: ['BkTxCd CHRG'],
    method: 'auto_fee',
  }
}

function classIncome(): FeeClassification {
  return {
    type: 'interest_income',
    account: '8310',
    series: 'A',
    score: 100,
    confidence: 'HIGH',
    reasons: ['BkTxCd INTR'],
    method: 'auto_interest_income',
  }
}

function classExpense(): FeeClassification {
  return {
    type: 'interest_expense',
    account: '8410',
    series: 'B',
    score: 100,
    confidence: 'HIGH',
    reasons: ['BkTxCd INTR'],
    method: 'auto_interest_expense',
  }
}

describe('S58 A4 — bank-fee-entry-service', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  it('1. bank_fee (-50 kr) → D 6570 / K 1930, B-serie, reconciliation-rad skapas', () => {
    const s = seed(db)
    const txId = insertTx(db, s, -5_000)

    const result = db.transaction(() =>
      _createBankFeeEntryTx(db, {
        bank_transaction_id: txId,
        classification: classBankFee(),
        payment_account: '1930',
      }),
    )()

    expect(result.journal_entry_id).toBeGreaterThan(0)
    const je = db
      .prepare(
        'SELECT verification_series, source_type, status FROM journal_entries WHERE id = ?',
      )
      .get(result.journal_entry_id) as {
      verification_series: string
      source_type: string
      status: string
    }
    expect(je.verification_series).toBe('B')
    expect(je.source_type).toBe('auto_bank_fee')
    expect(je.status).toBe('booked')

    const lines = db
      .prepare(
        'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
      )
      .all(result.journal_entry_id) as Array<{
      account_number: string
      debit_ore: number
      credit_ore: number
    }>
    expect(lines).toEqual([
      { account_number: '6570', debit_ore: 5_000, credit_ore: 0 },
      { account_number: '1930', debit_ore: 0, credit_ore: 5_000 },
    ])

    const match = db
      .prepare(
        'SELECT matched_entity_type, fee_journal_entry_id, match_method FROM bank_reconciliation_matches WHERE bank_transaction_id = ?',
      )
      .get(txId) as {
      matched_entity_type: string
      fee_journal_entry_id: number
      match_method: string
    }
    expect(match.matched_entity_type).toBe('bank_fee')
    expect(match.fee_journal_entry_id).toBe(result.journal_entry_id)
    expect(match.match_method).toBe('auto_fee')

    const tx = db
      .prepare(
        'SELECT reconciliation_status FROM bank_transactions WHERE id = ?',
      )
      .get(txId) as { reconciliation_status: string }
    expect(tx.reconciliation_status).toBe('matched')
  })

  it('2. interest_income (+100 kr) → D 1930 / K 8310, A-serie', () => {
    const s = seed(db)
    const txId = insertTx(db, s, 10_000)

    const result = db.transaction(() =>
      _createBankFeeEntryTx(db, {
        bank_transaction_id: txId,
        classification: classIncome(),
        payment_account: '1930',
      }),
    )()

    const je = db
      .prepare('SELECT verification_series FROM journal_entries WHERE id = ?')
      .get(result.journal_entry_id) as { verification_series: string }
    expect(je.verification_series).toBe('A')

    const lines = db
      .prepare(
        'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
      )
      .all(result.journal_entry_id) as Array<{
      account_number: string
      debit_ore: number
      credit_ore: number
    }>
    expect(lines).toEqual([
      { account_number: '1930', debit_ore: 10_000, credit_ore: 0 },
      { account_number: '8310', debit_ore: 0, credit_ore: 10_000 },
    ])
  })

  it('3. interest_expense (-200 kr) → D 8410 / K 1930, B-serie', () => {
    const s = seed(db)
    const txId = insertTx(db, s, -20_000)

    const result = db.transaction(() =>
      _createBankFeeEntryTx(db, {
        bank_transaction_id: txId,
        classification: classExpense(),
        payment_account: '1930',
      }),
    )()

    const je = db
      .prepare('SELECT verification_series FROM journal_entries WHERE id = ?')
      .get(result.journal_entry_id) as { verification_series: string }
    expect(je.verification_series).toBe('B')

    const lines = db
      .prepare(
        'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
      )
      .all(result.journal_entry_id) as Array<{
      account_number: string
      debit_ore: number
      credit_ore: number
    }>
    expect(lines).toEqual([
      { account_number: '8410', debit_ore: 20_000, credit_ore: 0 },
      { account_number: '1930', debit_ore: 0, credit_ore: 20_000 },
    ])
  })

  it('4. Reconciliation-rad uppfyller exactly-one-of: fee_journal_entry_id satt, invoice/expense_payment NULL', () => {
    const s = seed(db)
    const txId = insertTx(db, s, -5_000)
    db.transaction(() =>
      _createBankFeeEntryTx(db, {
        bank_transaction_id: txId,
        classification: classBankFee(),
        payment_account: '1930',
      }),
    )()
    const row = db
      .prepare(
        'SELECT invoice_payment_id, expense_payment_id, fee_journal_entry_id, matched_entity_id FROM bank_reconciliation_matches WHERE bank_transaction_id = ?',
      )
      .get(txId) as {
      invoice_payment_id: number | null
      expense_payment_id: number | null
      fee_journal_entry_id: number | null
      matched_entity_id: number | null
    }
    expect(row.invoice_payment_id).toBeNull()
    expect(row.expense_payment_id).toBeNull()
    expect(row.fee_journal_entry_id).not.toBeNull()
    expect(row.matched_entity_id).toBeNull()
  })

  it('5. Chronology (M142): bakåtdaterat mot senare B-verifikat avvisas; skipChronologyCheck bypassar', () => {
    const s = seed(db)
    // Först: skapa en fee på 2026-03-15 (B-serie)
    const txLater = insertTx(db, s, -5_000, '2026-03-15')
    db.transaction(() =>
      _createBankFeeEntryTx(db, {
        bank_transaction_id: txLater,
        classification: classBankFee(),
        payment_account: '1930',
      }),
    )()

    // Sedan: försök skapa en fee på 2026-02-15 (tidigare datum) utan skip → ska avvisas
    const txEarlier = insertTx(db, s, -3_000, '2026-02-15')
    let thrown: unknown
    try {
      db.transaction(() =>
        _createBankFeeEntryTx(db, {
          bank_transaction_id: txEarlier,
          classification: classBankFee(),
          payment_account: '1930',
        }),
      )()
      expect.fail('should have thrown chronology error')
    } catch (err) {
      thrown = err
    }
    expect(thrown).toMatchObject({ code: 'VALIDATION_ERROR', field: 'date' })
    expect((thrown as { error: string }).error).toMatch(
      /2026-02-15.*före.*2026-03-15/,
    )

    // Skippa chronology → passerar
    expect(() =>
      db.transaction(() =>
        _createBankFeeEntryTx(db, {
          bank_transaction_id: txEarlier,
          classification: classBankFee(),
          payment_account: '1930',
          skipChronologyCheck: true,
        }),
      )(),
    ).not.toThrow()
  })

  it('6. Stängd period → PERIOD_CLOSED', () => {
    const s = seed(db)
    db.prepare(
      `UPDATE accounting_periods SET is_closed = 1 WHERE fiscal_year_id = ? AND period_number = 3`,
    ).run(s.fyId)
    const txId = insertTx(db, s, -5_000, '2026-03-15')
    try {
      db.transaction(() =>
        _createBankFeeEntryTx(db, {
          bank_transaction_id: txId,
          classification: classBankFee(),
          payment_account: '1930',
        }),
      )()
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toMatchObject({ code: 'PERIOD_CLOSED' })
    }
  })
})
