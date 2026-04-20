/**
 * Bank reconciliation — state-machine integration test.
 *
 * Happy path full circle:
 *   camt.053 import → suggester (auto-match) → applyMatch
 *     → unmatch (M154) → re-match (new payment-JE)
 *
 * Anchors: M152 (signed amount in raw bank data), M153 (deterministic
 * integer scoring), M154 (unmatch via correction-entry, per-payment-JE
 * one-time lock).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCounterparty } from '../src/main/services/counterparty-service'
import {
  saveDraft as saveInvoiceDraft,
  finalizeDraft as finalizeInvoice,
} from '../src/main/services/invoice-service'
import {
  saveExpenseDraft,
  finalizeExpense,
} from '../src/main/services/expense-service'
import { importBankStatement } from '../src/main/services/bank/bank-statement-service'
import { suggestMatchesForStatement } from '../src/main/services/bank/bank-match-suggester'
import { matchBankTransaction } from '../src/main/services/bank/bank-match-service'
import { unmatchBankTransaction } from '../src/main/services/bank/bank-unmatch-service'

interface Seeded {
  companyId: number
  fyId: number
  custId: number
  suppId: number
  vatOutId: number
  vatInId: number
  invoiceId: number
  invoiceTotalOre: number
  expenseId: number
  expenseTotalOre: number
}

const IBAN = 'SE4550000000058398257466'
const INVOICE_NET_ORE = 80_000 // 800 kr net → 1000 kr total (25% VAT)
const EXPENSE_NET_ORE = 40_000 // 400 kr net → 500 kr total (25% VAT)

function seed(db: Database.Database): Seeded {
  db.exec(`
    INSERT INTO companies (id, org_number, name, fiscal_rule)
      VALUES (1, '559000-1234', 'StateMachine AB', 'K2');
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
    name: 'Kund Alfa AB',
    type: 'customer',
    org_number: null,
    default_payment_terms: 30,
  })
  if (!cust.success) throw new Error(cust.error)

  const supp = createCounterparty(db, {
    company_id: 1,
    name: 'Lev Gamma AB',
    type: 'supplier',
    org_number: null,
    default_payment_terms: 30,
  })
  if (!supp.success) throw new Error(supp.error)

  const vatOut = db.prepare("SELECT id FROM vat_codes WHERE code='MP1'").get() as { id: number }
  const vatIn = db.prepare("SELECT id FROM vat_codes WHERE code='IP1'").get() as { id: number }

  const invDraft = saveInvoiceDraft(db, {
    counterparty_id: cust.data.id,
    fiscal_year_id: 1,
    invoice_date: '2026-03-01',
    due_date: '2026-03-31',
    lines: [
      {
        product_id: null,
        description: 'Konsultation',
        quantity: 1,
        unit_price_ore: INVOICE_NET_ORE,
        vat_code_id: vatOut.id,
        sort_order: 0,
        account_number: '3001',
      },
    ],
  })
  if (!invDraft.success) throw new Error(invDraft.error)
  const invFin = finalizeInvoice(db, invDraft.data.id)
  if (!invFin.success) throw new Error(invFin.error)
  const invRow = db
    .prepare('SELECT total_amount_ore FROM invoices WHERE id=?')
    .get(invDraft.data.id) as { total_amount_ore: number }

  const expDraft = saveExpenseDraft(db, {
    fiscal_year_id: 1,
    counterparty_id: supp.data.id,
    expense_date: '2026-03-02',
    due_date: '2026-04-01',
    description: 'Kontorsmaterial',
    lines: [
      {
        description: 'Pennor',
        account_number: '6110',
        quantity: 1,
        unit_price_ore: EXPENSE_NET_ORE,
        vat_code_id: vatIn.id,
      },
    ],
  })
  if (!expDraft.success) throw new Error(expDraft.error)
  const expFin = finalizeExpense(db, expDraft.data.id)
  if (!expFin.success) throw new Error(expFin.error)
  const expRow = db
    .prepare('SELECT total_amount_ore FROM expenses WHERE id=?')
    .get(expDraft.data.id) as { total_amount_ore: number }

  return {
    companyId: 1,
    fyId: 1,
    custId: cust.data.id,
    suppId: supp.data.id,
    vatOutId: vatOut.id,
    vatInId: vatIn.id,
    invoiceId: invDraft.data.id,
    invoiceTotalOre: invRow.total_amount_ore,
    expenseId: expDraft.data.id,
    expenseTotalOre: expRow.total_amount_ore,
  }
}

function buildCamt053(invoiceTotalOre: number, expenseTotalOre: number): string {
  const invKr = (invoiceTotalOre / 100).toFixed(2)
  const expKr = (expenseTotalOre / 100).toFixed(2)
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>SM-001</MsgId><CreDtTm>2026-03-31T23:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>SM-STMT-001</Id>
      <CreDtTm>2026-03-31T23:00:00</CreDtTm>
      <Acct><Id><IBAN>${IBAN}</IBAN></Id><Ccy>SEK</Ccy></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="SEK">0.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-03-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="SEK">${(invoiceTotalOre - expenseTotalOre) / 100}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-03-31</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="SEK">${invKr}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-03-15</Dt></BookgDt>
        <ValDt><Dt>2026-03-15</Dt></ValDt>
        <AcctSvcrRef>SM-IN-1</AcctSvcrRef>
      </Ntry>
      <Ntry>
        <Amt Ccy="SEK">${expKr}</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2026-03-20</Dt></BookgDt>
        <ValDt><Dt>2026-03-20</Dt></ValDt>
        <AcctSvcrRef>SM-OUT-1</AcctSvcrRef>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`
}

describe('Bank state machine — import → match → unmatch → re-match', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  it('happy path: camt.053 import yields signed amounts (M152), suggester proposes correct sides (M153), match/unmatch/re-match invariants hold (M154)', () => {
    const s = seed(db)

    // ─── Step 2: Import camt.053 ────────────────────────────────────────
    const xml = buildCamt053(s.invoiceTotalOre, s.expenseTotalOre)
    const importRes = importBankStatement(db, {
      company_id: s.companyId,
      fiscal_year_id: s.fyId,
      xml_content: xml,
    })
    expect(importRes.success).toBe(true)
    if (!importRes.success) return
    expect(importRes.data.transaction_count).toBe(2)

    const txs = db
      .prepare(
        `SELECT id, amount_ore, value_date FROM bank_transactions
         WHERE bank_statement_id = ? ORDER BY value_date`,
      )
      .all(importRes.data.statement_id) as {
      id: number
      amount_ore: number
      value_date: string
    }[]
    expect(txs).toHaveLength(2)

    // M152: incoming = positive, outgoing = negative
    const txIn = txs.find((t) => t.amount_ore > 0)!
    const txOut = txs.find((t) => t.amount_ore < 0)!
    expect(txIn).toBeDefined()
    expect(txOut).toBeDefined()
    expect(txIn.amount_ore).toBe(s.invoiceTotalOre)
    expect(txOut.amount_ore).toBe(-s.expenseTotalOre)

    // ─── Step 3: Suggester (deterministic; M153) ────────────────────────
    const sugRes1 = suggestMatchesForStatement(db, importRes.data.statement_id)
    const sugRes2 = suggestMatchesForStatement(db, importRes.data.statement_id)
    expect(sugRes1.success).toBe(true)
    expect(sugRes2.success).toBe(true)
    if (!sugRes1.success || !sugRes2.success) return
    // Determinism: identical structure between calls (M153)
    expect(JSON.stringify(sugRes1.data)).toBe(JSON.stringify(sugRes2.data))

    const suggestionByTx = new Map(sugRes1.data.map((s) => [s.bank_transaction_id, s]))
    const inSug = suggestionByTx.get(txIn.id)
    const outSug = suggestionByTx.get(txOut.id)
    expect(inSug).toBeDefined()
    expect(outSug).toBeDefined()
    if (!inSug || !outSug) return

    // Side correctness: positive TX → invoice candidate, negative TX → expense candidate
    const inEntityCandidates = inSug.candidates.filter(
      (c): c is typeof c & { entity_type: 'invoice' | 'expense' } =>
        'entity_type' in c,
    )
    expect(inEntityCandidates.length).toBeGreaterThan(0)
    expect(inEntityCandidates[0].entity_type).toBe('invoice')
    expect(inEntityCandidates[0].entity_id).toBe(s.invoiceId)
    // Integer score (M153)
    expect(Number.isInteger(inEntityCandidates[0].score)).toBe(true)

    const outEntityCandidates = outSug.candidates.filter(
      (c): c is typeof c & { entity_type: 'invoice' | 'expense' } =>
        'entity_type' in c,
    )
    expect(outEntityCandidates.length).toBeGreaterThan(0)
    expect(outEntityCandidates[0].entity_type).toBe('expense')
    expect(outEntityCandidates[0].entity_id).toBe(s.expenseId)
    expect(Number.isInteger(outEntityCandidates[0].score)).toBe(true)

    // ─── Step 4: Apply matches ──────────────────────────────────────────
    const matchIn = matchBankTransaction(db, {
      bank_transaction_id: txIn.id,
      matched_entity_type: 'invoice',
      matched_entity_id: s.invoiceId,
      payment_account: '1930',
    })
    expect(matchIn.success).toBe(true)
    if (!matchIn.success) return

    const matchOut = matchBankTransaction(db, {
      bank_transaction_id: txOut.id,
      matched_entity_type: 'expense',
      matched_entity_id: s.expenseId,
      payment_account: '1930',
    })
    expect(matchOut.success).toBe(true)
    if (!matchOut.success) return

    // (a) paid_amount updated
    const invAfter = db
      .prepare('SELECT paid_amount_ore, status FROM invoices WHERE id=?')
      .get(s.invoiceId) as { paid_amount_ore: number; status: string }
    expect(invAfter.paid_amount_ore).toBe(s.invoiceTotalOre)
    expect(invAfter.status).toBe('paid')

    const expAfter = db
      .prepare('SELECT paid_amount_ore, status FROM expenses WHERE id=?')
      .get(s.expenseId) as { paid_amount_ore: number; status: string }
    expect(expAfter.paid_amount_ore).toBe(s.expenseTotalOre)
    expect(expAfter.status).toBe('paid')

    // (b) reconciliation_status='matched'
    const txInPost = db
      .prepare('SELECT reconciliation_status FROM bank_transactions WHERE id=?')
      .get(txIn.id) as { reconciliation_status: string }
    expect(txInPost.reconciliation_status).toBe('matched')

    // (c) journal entries exist (one per side)
    const jeIn = db
      .prepare('SELECT verification_series FROM journal_entries WHERE id=?')
      .get(matchIn.data.journal_entry_id) as { verification_series: string }
    expect(jeIn.verification_series).toBe('A')
    const jeOut = db
      .prepare('SELECT verification_series FROM journal_entries WHERE id=?')
      .get(matchOut.data.journal_entry_id) as { verification_series: string }
    expect(jeOut.verification_series).toBe('B')

    // ─── Step 5: Unmatch invoice side (M154) ────────────────────────────
    const unmatch = unmatchBankTransaction(db, { bank_transaction_id: txIn.id })
    expect(unmatch.success).toBe(true)
    if (!unmatch.success) return

    // (a) correction JE in C-series
    const corrJe = db
      .prepare('SELECT verification_series FROM journal_entries WHERE id=?')
      .get(unmatch.data.correction_journal_entry_id) as {
      verification_series: string
    }
    expect(corrJe.verification_series).toBe('C')

    // (b) reconciliation row deleted
    const recRow = db
      .prepare(
        'SELECT 1 FROM bank_reconciliation_matches WHERE bank_transaction_id=?',
      )
      .get(txIn.id)
    expect(recRow).toBeUndefined()

    // (c) payment row deleted
    const payRow = db
      .prepare('SELECT 1 FROM invoice_payments WHERE id=?')
      .get(matchIn.data.payment_id)
    expect(payRow).toBeUndefined()

    // (d) paid_amount recalculated
    const invUnmatched = db
      .prepare('SELECT paid_amount_ore, status FROM invoices WHERE id=?')
      .get(s.invoiceId) as { paid_amount_ore: number; status: string }
    expect(invUnmatched.paid_amount_ore).toBe(0)
    expect(invUnmatched.status).toBe('unpaid')

    // (e) reconciliation_status='unmatched'
    const txInUnmatched = db
      .prepare('SELECT reconciliation_status FROM bank_transactions WHERE id=?')
      .get(txIn.id) as { reconciliation_status: string }
    expect(txInUnmatched.reconciliation_status).toBe('unmatched')

    // ─── Step 6: Re-match same TX (M154 — per-JE lock, not per-TX) ──────
    const rematch = matchBankTransaction(db, {
      bank_transaction_id: txIn.id,
      matched_entity_type: 'invoice',
      matched_entity_id: s.invoiceId,
      payment_account: '1930',
    })
    expect(rematch.success).toBe(true)
    if (!rematch.success) return
    // New payment + new JE (different IDs from the first match)
    expect(rematch.data.payment_id).not.toBe(matchIn.data.payment_id)
    expect(rematch.data.journal_entry_id).not.toBe(matchIn.data.journal_entry_id)

    const invReMatched = db
      .prepare('SELECT paid_amount_ore, status FROM invoices WHERE id=?')
      .get(s.invoiceId) as { paid_amount_ore: number; status: string }
    expect(invReMatched.paid_amount_ore).toBe(s.invoiceTotalOre)
    expect(invReMatched.status).toBe('paid')

    // ─── Step 7: Second unmatch on same TX (new payment-JE) ─────────────
    // M154: per-payment-JE one-time lock. The first JE is gone (deleted
    // during unmatch's correction flow created a corrected_by chain on it,
    // but the payment row was deleted; the new match created a fresh JE).
    // Therefore unmatching the new match must succeed.
    const unmatch2 = unmatchBankTransaction(db, { bank_transaction_id: txIn.id })
    expect(unmatch2.success).toBe(true)
    if (!unmatch2.success) return
    expect(unmatch2.data.correction_journal_entry_id).toBeGreaterThan(0)
    // Different correction JE from the first unmatch
    expect(unmatch2.data.correction_journal_entry_id).not.toBe(
      unmatch.data.correction_journal_entry_id,
    )

    const invFinal = db
      .prepare('SELECT paid_amount_ore, status FROM invoices WHERE id=?')
      .get(s.invoiceId) as { paid_amount_ore: number; status: string }
    expect(invFinal.paid_amount_ore).toBe(0)
    expect(invFinal.status).toBe('unpaid')
  })
})
