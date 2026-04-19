import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCounterparty } from '../src/main/services/counterparty-service'
import {
  saveDraft as saveInvoiceDraft,
  finalizeDraft as finalizeInvoice,
} from '../src/main/services/invoice-service'
import { suggestMatchesForStatement } from '../src/main/services/bank/bank-match-suggester'

interface Seeded {
  companyId: number
  fyId: number
  custId: number
  vatOutId: number
}

function seed(db: Database.Database): Seeded {
  db.exec(`
    INSERT INTO companies (id, org_number, name, fiscal_rule) VALUES (1, '559000-1234', 'Int AB', 'K2');
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
    company_id: 1,
    name: 'Kund',
    type: 'customer',
    org_number: null,
    default_payment_terms: 30,
  })
  if (!cust.success) throw new Error(cust.error)
  const vat25 = db
    .prepare("SELECT id FROM vat_codes WHERE code='MP1'")
    .get() as { id: number }
  return { companyId: 1, fyId: 1, custId: cust.data.id, vatOutId: vat25.id }
}

function createUnpaidInvoice(
  db: Database.Database,
  s: Seeded,
  netOre: number,
  date = '2026-03-15',
): { id: number; totalOre: number } {
  const draft = saveInvoiceDraft(db, {
    counterparty_id: s.custId,
    fiscal_year_id: s.fyId,
    invoice_date: date,
    due_date: date,
    lines: [
      {
        product_id: null,
        description: 'Tj',
        quantity: 1,
        unit_price_ore: netOre,
        vat_code_id: s.vatOutId,
        sort_order: 0,
        account_number: '3001',
      },
    ],
  })
  if (!draft.success) throw new Error(draft.error)
  const fin = finalizeInvoice(db, draft.data.id)
  if (!fin.success) throw new Error(fin.error)
  const row = db
    .prepare('SELECT total_amount_ore FROM invoices WHERE id=?')
    .get(draft.data.id) as { total_amount_ore: number }
  return { id: draft.data.id, totalOre: row.total_amount_ore }
}

function insertStmtWithTx(
  db: Database.Database,
  s: Seeded,
  txs: Array<{
    amount_ore: number
    value_date?: string
    bank_tx_subfamily?: string | null
    counterparty_name?: string | null
    remittance_info?: string | null
  }>,
): { statementId: number; txIds: number[] } {
  const stmtRes = db
    .prepare(
      `INSERT INTO bank_statements (company_id, fiscal_year_id, statement_number, bank_account_iban,
         statement_date, opening_balance_ore, closing_balance_ore, source_format, import_file_hash)
       VALUES (?, ?, 'S', 'SE1', '2026-03-31', 0, 0, 'camt.053', ?)`,
    )
    .run(s.companyId, s.fyId, `hash-${Date.now()}-${Math.random()}`)
  const statementId = Number(stmtRes.lastInsertRowid)
  const txIds: number[] = []
  const ins = db.prepare(
    `INSERT INTO bank_transactions (bank_statement_id, booking_date, value_date, amount_ore,
       counterparty_name, remittance_info, bank_tx_domain, bank_tx_family, bank_tx_subfamily)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const tx of txs) {
    const vd = tx.value_date ?? '2026-03-15'
    // Sprint F P4: DB-driven classifier kräver alla tre BkTxCd-fält.
    // Seed default domain/family när bara subfamily anges (legacy test-API).
    const sub = tx.bank_tx_subfamily ?? null
    const res = ins.run(
      statementId,
      vd,
      vd,
      tx.amount_ore,
      tx.counterparty_name ?? null,
      tx.remittance_info ?? null,
      sub ? 'PMNT' : null,
      sub ? 'CCRD' : null,
      sub,
    )
    txIds.push(Number(res.lastInsertRowid))
  }
  return { statementId, txIds }
}

describe('S58 A5 — suggester integrerar fee-candidates', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  it('1. TX med CHRG + matchande invoice → fee-candidate rankas först (högst score)', () => {
    const s = seed(db)
    // Skapa invoice där beloppet matchar CHRG-TX (men att det är CHRG gör fee-match HIGH)
    createUnpaidInvoice(db, s, 5_000)
    // CHRG-TX: negativt (avgift)
    const { statementId } = insertStmtWithTx(db, s, [
      { amount_ore: -5_000, bank_tx_subfamily: 'CHRG' },
    ])

    const result = suggestMatchesForStatement(db, statementId)
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data).toHaveLength(1)
    const candidates = result.data[0].candidates
    // Fee-candidate ska rankas överst
    expect(candidates[0].entity_type).toBe('bank_fee')
    expect(candidates[0].score).toBe(100)
    expect(candidates[0].confidence).toBe('HIGH')
    // Invoice skulle ändå inte matcha (positiv TX skulle matchat, denna är negativ)
  })

  it('2. CHRG + inga invoices/expenses → bara fee-candidate', () => {
    const s = seed(db)
    const { statementId } = insertStmtWithTx(db, s, [
      { amount_ore: -5_000, bank_tx_subfamily: 'CHRG' },
    ])

    const result = suggestMatchesForStatement(db, statementId)
    if (!result.success) throw new Error(result.error)
    const candidates = result.data[0].candidates
    expect(candidates).toHaveLength(1)
    expect(candidates[0].entity_type).toBe('bank_fee')
    expect(candidates[0].method).toBe('auto_fee')
  })

  it('3. TX utan BkTxCd (normal kundbetalning) → fee-candidate är null, normal invoice-candidate returneras', () => {
    const s = seed(db)
    const inv = createUnpaidInvoice(db, s, 12_500)
    const invId = inv.id
    const { statementId } = insertStmtWithTx(db, s, [
      {
        amount_ore: inv.totalOre,
        counterparty_name: 'ACME AB',
        remittance_info: 'Faktura',
      },
    ])

    const result = suggestMatchesForStatement(db, statementId)
    if (!result.success) throw new Error(result.error)
    const candidates = result.data[0].candidates

    // Inga fee-candidates
    expect(
      candidates.filter(
        (c) =>
          c.entity_type === 'bank_fee' ||
          c.entity_type === 'interest_income' ||
          c.entity_type === 'interest_expense',
      ),
    ).toHaveLength(0)

    // Men invoice-candidate bör finnas (exakt belopp + datum = score 130, unik → HIGH)
    const invCand = candidates.find((c) => c.entity_type === 'invoice')
    expect(invCand).toBeDefined()
    if (invCand && invCand.entity_type === 'invoice') {
      expect(invCand.entity_id).toBe(invId)
    }
  })
})
