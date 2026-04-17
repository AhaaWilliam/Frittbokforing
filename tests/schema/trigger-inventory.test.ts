// När en migration lägger till eller tar bort en trigger måste denna lista
// uppdateras explicit. Att testet failar är ett feature, inte en bug —
// det skyddar mot tysta trigger-tapp (se Sprint 15 S42, M121).

import { describe, expect, test } from 'vitest'
import { createTestDb } from '../helpers/create-test-db'

const EXPECTED_TRIGGERS = [
  { name: 'trg_validate_org_number', tbl_name: 'companies' },
  { name: 'trg_fiscal_year_no_overlap_insert', tbl_name: 'fiscal_years' },
  { name: 'trg_fiscal_year_no_overlap_update', tbl_name: 'fiscal_years' },
  {
    name: 'trg_invoice_lines_account_number_on_finalize',
    tbl_name: 'invoices',
  },
  { name: 'trg_prevent_invoice_delete', tbl_name: 'invoices' },
  { name: 'trg_check_balance_on_booking', tbl_name: 'journal_entries' },
  { name: 'trg_check_period_on_booking', tbl_name: 'journal_entries' },
  { name: 'trg_immutable_booked_entry_delete', tbl_name: 'journal_entries' },
  { name: 'trg_immutable_booked_entry_update', tbl_name: 'journal_entries' },
  { name: 'trg_immutable_corrects_entry_id', tbl_name: 'journal_entries' },
  { name: 'trg_immutable_source_reference', tbl_name: 'journal_entries' },
  { name: 'trg_immutable_source_type', tbl_name: 'journal_entries' },
  { name: 'trg_no_correct_with_payments', tbl_name: 'journal_entries' },
  { name: 'trg_immutable_booked_line_delete', tbl_name: 'journal_entry_lines' },
  { name: 'trg_immutable_booked_line_insert', tbl_name: 'journal_entry_lines' },
  { name: 'trg_immutable_booked_line_update', tbl_name: 'journal_entry_lines' },
] as const

describe('Trigger inventory', () => {
  test('matches expected list (16 triggers)', () => {
    const db = createTestDb()
    const actual = db
      .prepare(
        "SELECT name, tbl_name FROM sqlite_master WHERE type='trigger' ORDER BY tbl_name, name",
      )
      .all()
    const expected = [...EXPECTED_TRIGGERS].sort(
      (a, b) =>
        a.tbl_name.localeCompare(b.tbl_name) || a.name.localeCompare(b.name),
    )
    expect(actual).toEqual(expected)
    db.close()
  })

  test('every trigger in the list has a SQL body in sqlite_master', () => {
    const db = createTestDb()
    for (const trigger of EXPECTED_TRIGGERS) {
      const row = db
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type='trigger' AND name = ?",
        )
        .get(trigger.name) as { sql: string } | undefined
      expect(row, `Trigger ${trigger.name} missing`).toBeDefined()
      expect(row?.sql).toMatch(/CREATE TRIGGER/)
    }
    db.close()
  })
})
