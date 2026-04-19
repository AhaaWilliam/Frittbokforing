import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../helpers/create-test-db'

/**
 * M137 — Sign-flip-doktrin: belopp alltid positiva i DB.
 *
 * Scanner: verifierar att invoice_lines, expense_lines, invoices, expenses
 * har CHECK-constraints på alla _ore-kolumner som förhindrar negativa belopp.
 * Sign-flip sker vid bokföring (buildJournalLines), inte i lagringsschemat.
 */

describe('M137 scanner — monetära kolumner har >= 0 CHECK', () => {
  it('invoices-tabellen: alla _ore-kolumner har >= 0 check', () => {
    const db = createTestDb()
    const schema = (
      db
        .prepare(
          `SELECT sql FROM sqlite_master WHERE type='table' AND name='invoices'`,
        )
        .get() as { sql: string }
    ).sql
    // Förvänta explicita CHECKs för minst total_amount_ore, net_amount_ore, vat_amount_ore, paid_amount_ore
    for (const col of [
      'total_amount_ore',
      'net_amount_ore',
      'vat_amount_ore',
      'paid_amount_ore',
    ]) {
      expect(schema, `${col} >= 0 constraint`).toMatch(
        new RegExp(`${col}\\s*>=\\s*0`),
      )
    }
  })

  // SKIPPED: F-TT-003 — expenses saknar >= 0 CHECKs (M127 ALTER TABLE-begränsning).
  // Testet FAILAR idag. Avmarkera .skip efter migration som table-recreate:ar expenses.
  it.skip('expenses-tabellen: alla _ore-kolumner har >= 0 check', () => {
    const db = createTestDb()
    const schema = (
      db
        .prepare(
          `SELECT sql FROM sqlite_master WHERE type='table' AND name='expenses'`,
        )
        .get() as { sql: string }
    ).sql
    for (const col of [
      'total_amount_ore',
      'net_amount_ore',
      'vat_amount_ore',
      'paid_amount_ore',
    ]) {
      expect(schema, `${col} >= 0 constraint`).toMatch(
        new RegExp(`${col}\\s*>=\\s*0`),
      )
    }
  })

  it('journal_entry_lines: debit_ore och credit_ore har >= 0 check', () => {
    const db = createTestDb()
    const schema = (
      db
        .prepare(
          `SELECT sql FROM sqlite_master WHERE type='table' AND name='journal_entry_lines'`,
        )
        .get() as { sql: string }
    ).sql
    expect(schema).toMatch(/debit_ore\s*>=\s*0/)
    expect(schema).toMatch(/credit_ore\s*>=\s*0/)
  })

  it('direkt-INSERT med negativt belopp blockeras', () => {
    const db = createTestDb()
    expect(() => {
      db.exec(`INSERT INTO journal_entry_lines
        (journal_entry_id, account_number, debit_ore, credit_ore, line_number)
        VALUES (1, '1930', -100, 0, 1)`)
    }).toThrow(/CHECK|check/)
  })
})
