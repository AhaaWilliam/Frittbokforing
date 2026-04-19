import { describe, it, expect } from 'vitest'
import { createTestDb } from '../helpers/create-test-db'
import { createCompany } from '../../src/main/services/company-service'
import { createCounterparty } from '../../src/main/services/counterparty-service'
import {
  saveDraft,
  finalizeDraft,
  createCreditNoteDraft,
} from '../../src/main/services/invoice-service'

/**
 * M138 — Defense-in-depth för irreversibla relationer (kreditfakturor).
 *
 * Lagren:
 *   1. DB-FK: invoices.credits_invoice_id REFERENCES invoices(id)
 *   2. Service-guard: existing credit note + type-check
 *   3. UI-döljning (denna test berör inte renderer)
 *   4. Visuell indikator via has_credit_note (list-query)
 *
 * Scanner kör lager 1 + 2 + 4.
 */

function ok<T>(
  r:
    | { success: true; data: T }
    | { success: false; error: string; code?: string },
): T {
  if (!r.success) throw new Error(`${r.code}: ${r.error}`)
  return r.data
}

function seed() {
  const db = createTestDb()
  ok(
    createCompany(db, {
      name: 'Test AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2',
      share_capital: 2_500_000,
      registration_date: '2025-01-15',
      fiscal_year_start: '2026-01-01',
      fiscal_year_end: '2026-12-31',
    }),
  )
  const companyId = (
    db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: number }
  ).id
  const fyId = (
    db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  ).id
  const cp = ok(
    createCounterparty(db, {
      company_id: companyId,
      name: 'Kund AB',
      type: 'customer',
    }),
  )
  const inv = ok(
    saveDraft(db, {
      fiscal_year_id: fyId,
      counterparty_id: cp.id,
      invoice_date: '2026-02-01',
      due_date: '2026-03-03',
      lines: [
        {
          product_id: null,
          description: 'Produkt',
          quantity: 1,
          unit_price_ore: 100000,
          vat_code_id: 5,
          sort_order: 0,
          account_number: '3001',
        },
      ],
    }),
  )
  ok(finalizeDraft(db, inv.id))
  return { db, fyId, invoiceId: inv.id }
}

describe('M138 — credit-note defense-in-depth', () => {
  it('Lager 1 (DB-FK): credits_invoice_id refererar invoices(id)', () => {
    const { db } = seed()
    const schema = (
      db
        .prepare(
          `SELECT sql FROM sqlite_master WHERE type='table' AND name='invoices'`,
        )
        .get() as { sql: string }
    ).sql
    expect(schema).toMatch(/credits_invoice_id.*REFERENCES\s+invoices/i)
  })

  it('Lager 2: kan inte kreditera en kreditfaktura', () => {
    const { db, fyId, invoiceId } = seed()
    const credit = ok(
      createCreditNoteDraft(db, {
        original_invoice_id: invoiceId,
        fiscal_year_id: fyId,
      }),
    )
    ok(finalizeDraft(db, credit.id))
    // Försök skapa en kreditfaktura AV kreditfakturan
    const r = createCreditNoteDraft(db, {
      original_invoice_id: credit.id,
      fiscal_year_id: fyId,
    })
    expect(r.success).toBe(false)
  })

  it('Lager 2: samma faktura kan inte krediteras två gånger', () => {
    const { db, fyId, invoiceId } = seed()
    ok(
      createCreditNoteDraft(db, {
        original_invoice_id: invoiceId,
        fiscal_year_id: fyId,
      }),
    )
    const second = createCreditNoteDraft(db, {
      original_invoice_id: invoiceId,
      fiscal_year_id: fyId,
    })
    expect(second.success).toBe(false)
  })

  it('Lager 4: has_credit_note-flag synlig efter kreditering', () => {
    const { db, fyId, invoiceId } = seed()
    ok(
      createCreditNoteDraft(db, {
        original_invoice_id: invoiceId,
        fiscal_year_id: fyId,
      }),
    )
    // Kör samma subquery som listInvoices använder
    const r = db
      .prepare(
        `SELECT (SELECT 1 FROM invoices cn WHERE cn.credits_invoice_id = i.id LIMIT 1) AS has_credit
         FROM invoices i WHERE i.id = ?`,
      )
      .get(invoiceId) as { has_credit: number | null }
    expect(r.has_credit).toBe(1)
  })

  it('original ska inte gå att kreditera om det är draft', () => {
    const { db, fyId } = seed()
    // Skapa en ny draft-faktura
    const companyId = (
      db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: number }
    ).id
    const cp = (
      db
        .prepare(`SELECT id FROM counterparties WHERE company_id = ? LIMIT 1`)
        .get(companyId) as { id: number }
    ).id
    const draft = ok(
      saveDraft(db, {
        fiscal_year_id: fyId,
        counterparty_id: cp,
        invoice_date: '2026-02-15',
        due_date: '2026-03-15',
        lines: [
          {
            product_id: null,
            description: 'X',
            quantity: 1,
            unit_price_ore: 10000,
            vat_code_id: 5,
            sort_order: 0,
            account_number: '3001',
          },
        ],
      }),
    )
    const r = createCreditNoteDraft(db, {
      original_invoice_id: draft.id,
      fiscal_year_id: fyId,
    })
    expect(r.success).toBe(false)
  })
})
