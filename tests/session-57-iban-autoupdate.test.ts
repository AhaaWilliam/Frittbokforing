/**
 * Sprint 57 D1 — F66-c counterparties.bank_account auto-uppdatering.
 *
 * Verifierar att matchBankTransaction opportunistiskt sätter
 * counterparty.bank_account från TX.counterparty_iban om counterparty
 * saknar IBAN. Konflikt (olika IBAN) → warning, ingen UPDATE.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type Database from 'better-sqlite3'
import log from 'electron-log'
import { createTestDb } from './helpers/create-test-db'
import { createCounterparty } from '../src/main/services/counterparty-service'
import {
  saveDraft as saveInvoiceDraft,
  finalizeDraft as finalizeInvoice,
} from '../src/main/services/invoice-service'
import { matchBankTransaction } from '../src/main/services/bank/bank-match-service'

interface Seeded {
  companyId: number
  fyId: number
  custId: number
  vatOutId: number
}

function seed(db: Database.Database, cpBankAccount: string | null): Seeded {
  db.exec(`
    INSERT INTO companies (id, org_number, name, fiscal_rule)
      VALUES (1, '559000-1234', 'Test AB', 'K2');
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
  const cust = createCounterparty(db, {
    name: 'Kund Alfa AB',
    type: 'customer',
    org_number: null,
    default_payment_terms: 30,
  })
  if (!cust.success) throw new Error(cust.error)

  // Sätt bank_account manuellt om begärt (createCounterparty tar det inte i params)
  if (cpBankAccount !== null) {
    db.prepare('UPDATE counterparties SET bank_account = ? WHERE id = ?').run(
      cpBankAccount,
      cust.data.id,
    )
  }

  const vatOut = db
    .prepare("SELECT id FROM vat_codes WHERE code='MP1'")
    .get() as { id: number }
  return {
    companyId: 1,
    fyId: 1,
    custId: cust.data.id,
    vatOutId: vatOut.id,
  }
}

function createUnpaidInvoice(
  db: Database.Database,
  s: Seeded,
  totalOre: number,
): number {
  const netOre = Math.round(totalOre / 1.25)
  const draft = saveInvoiceDraft(db, {
    counterparty_id: s.custId,
    fiscal_year_id: s.fyId,
    invoice_date: '2026-03-01',
    due_date: '2026-03-31',
    lines: [
      {
        product_id: null,
        description: 'Tjänst',
        quantity: 1,
        unit_price_ore: netOre,
        vat_code_id: s.vatOutId,
        sort_order: 0,
        account_number: '3002',
      },
    ],
  })
  if (!draft.success) throw new Error(draft.error)
  const fin = finalizeInvoice(db, draft.data.id)
  if (!fin.success) throw new Error(fin.error)
  return draft.data.id
}

function insertBankTx(
  db: Database.Database,
  s: Seeded,
  amountOre: number,
  counterpartyIban: string | null,
  valueDate = '2026-03-15',
): number {
  const stmtRes = db
    .prepare(
      `INSERT INTO bank_statements (company_id, fiscal_year_id, statement_number, bank_account_iban,
         statement_date, opening_balance_ore, closing_balance_ore, source_format, import_file_hash)
       VALUES (?, ?, 'STMT', 'SE4550000000058398257466', ?, 0, ?, 'camt.053', ?)`,
    )
    .run(s.companyId, s.fyId, valueDate, amountOre, `h-${Math.random()}`)
  const statementId = Number(stmtRes.lastInsertRowid)
  const txRes = db
    .prepare(
      `INSERT INTO bank_transactions (bank_statement_id, booking_date, value_date, amount_ore, counterparty_iban)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(statementId, valueDate, valueDate, amountOre, counterpartyIban)
  return Number(txRes.lastInsertRowid)
}

function getCpBankAccount(db: Database.Database, id: number): string | null {
  const row = db
    .prepare('SELECT bank_account FROM counterparties WHERE id = ?')
    .get(id) as { bank_account: string | null } | undefined
  return row?.bank_account ?? null
}

describe('S57 D1 — F66-c counterparty.bank_account auto-update', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    vi.restoreAllMocks()
  })

  it('1. TX har IBAN + counterparty saknar IBAN → bank_account sätts', () => {
    const s = seed(db, null)
    const invoiceId = createUnpaidInvoice(db, s, 12_500_00)
    const txId = insertBankTx(db, s, 12_500_00, 'SE45 5000 0000 0583 9825 7466')

    const res = matchBankTransaction(db, {
      bank_transaction_id: txId,
      matched_entity_type: 'invoice',
      matched_entity_id: invoiceId,
      payment_account: '1930',
    })
    expect(res.success).toBe(true)

    // Normaliserad IBAN: spaces borttagna, uppercase
    expect(getCpBankAccount(db, s.custId)).toBe('SE4550000000058398257466')
  })

  it('2. TX utan counterparty_iban → ingen UPDATE', () => {
    const s = seed(db, null)
    const invoiceId = createUnpaidInvoice(db, s, 12_500_00)
    const txId = insertBankTx(db, s, 12_500_00, null)

    const res = matchBankTransaction(db, {
      bank_transaction_id: txId,
      matched_entity_type: 'invoice',
      matched_entity_id: invoiceId,
      payment_account: '1930',
    })
    expect(res.success).toBe(true)
    expect(getCpBankAccount(db, s.custId)).toBeNull()
  })

  it('3. Counterparty har redan samma IBAN (normaliserad) → ingen UPDATE, ingen warning', () => {
    const s = seed(db, 'SE4550000000058398257466')
    const invoiceId = createUnpaidInvoice(db, s, 12_500_00)
    // TX-IBAN med spaces — efter normalisering samma som ovan
    const txId = insertBankTx(db, s, 12_500_00, 'se45 5000 0000 0583 9825 7466')

    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => log)

    const res = matchBankTransaction(db, {
      bank_transaction_id: txId,
      matched_entity_type: 'invoice',
      matched_entity_id: invoiceId,
      payment_account: '1930',
    })
    expect(res.success).toBe(true)
    expect(getCpBankAccount(db, s.custId)).toBe('SE4550000000058398257466')

    // Ingen F66-c-warning
    const f66Warnings = warnSpy.mock.calls.filter((call) =>
      String(call[0]).includes('F66-c'),
    )
    expect(f66Warnings).toHaveLength(0)
  })

  it('4. Counterparty har OLIKA IBAN → warning loggas, befintlig IBAN behålls', () => {
    const existing = 'SE9999999999999999999999'
    const s = seed(db, existing)
    const invoiceId = createUnpaidInvoice(db, s, 12_500_00)
    const txId = insertBankTx(db, s, 12_500_00, 'SE4550000000058398257466')

    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => log)

    const res = matchBankTransaction(db, {
      bank_transaction_id: txId,
      matched_entity_type: 'invoice',
      matched_entity_id: invoiceId,
      payment_account: '1930',
    })
    expect(res.success).toBe(true)

    // Befintligt IBAN oförändrat
    expect(getCpBankAccount(db, s.custId)).toBe(existing)

    // Varning loggad
    const f66Warnings = warnSpy.mock.calls.filter((call) =>
      String(call[0]).includes('F66-c'),
    )
    expect(f66Warnings.length).toBeGreaterThanOrEqual(1)
    expect(String(f66Warnings[0][0])).toContain('IBAN-konflikt')
  })
})
