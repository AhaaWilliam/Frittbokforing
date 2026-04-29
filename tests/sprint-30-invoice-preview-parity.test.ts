/**
 * Sprint 30 — Invoice preview ↔ finalize paritetstest (M135).
 *
 * Förhindrar drift mellan `previewJournalLines` (preview-service, source='invoice')
 * och faktiska journal_entry_lines som skrivs av `finalizeDraft` (invoice-service)
 * för både customer_invoice och credit_note. Sprint 21 lämnade invoice-paritet
 * som backlog eftersom invoice är mest komplex (sign-flip + product-uppslag +
 * VAT-aggregering per vat_account).
 *
 * Strategi: kör samma input genom båda paths och jämför resulterande
 * journal-lines aggregerat per (account_number, debit_ore, credit_ore).
 * Beskrivning och raden ordning ingår inte i jämförelsen — bara
 * bokföringsmässig effekt.
 *
 * Notera att finalize kan introducera 3740-öresutjämning som preview inte gör
 * (preview signalerar via warning). Testen väljer belopp som inte triggar
 * öresutjämning så preview/finalize matchar exakt.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { previewJournalLines } from '../src/main/services/preview-service'
import {
  saveDraft,
  finalizeDraft,
} from '../src/main/services/invoice-service'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'

interface NormLine {
  account_number: string
  debit_ore: number
  credit_ore: number
}

function normalizePreview(lines: ReadonlyArray<NormLine>): NormLine[] {
  return lines
    .map((l) => ({
      account_number: l.account_number,
      debit_ore: l.debit_ore,
      credit_ore: l.credit_ore,
    }))
    .sort((a, b) => {
      const byAcc = a.account_number.localeCompare(b.account_number)
      if (byAcc !== 0) return byAcc
      const byDeb = a.debit_ore - b.debit_ore
      if (byDeb !== 0) return byDeb
      return a.credit_ore - b.credit_ore
    })
}

function readJournalLines(
  db: Database.Database,
  journalEntryId: number,
): NormLine[] {
  const rows = db
    .prepare(
      'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
    )
    .all(journalEntryId) as NormLine[]
  return normalizePreview(rows)
}

function setupCompany(db: Database.Database): {
  fiscalYearId: number
  companyId: number
  customerId: number
  mp1Id: number
} {
  const result = createCompany(db, {
    name: 'Invoice Parity AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 2_500_000,
    registration_date: '2026-01-01',
    fiscal_year_start: '2026-01-01',
    fiscal_year_end: '2026-12-31',
  })
  if (!result.success) throw new Error('createCompany failed: ' + result.error)
  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  const company = db.prepare('SELECT id FROM companies LIMIT 1').get() as {
    id: number
  }
  const customer = createCounterparty(db, {
    company_id: company.id,
    name: 'Test Kund',
    type: 'customer',
    default_payment_terms: 30,
  })
  if (!customer.success)
    throw new Error('Customer-creation failed: ' + customer.error)
  const mp1 = db.prepare(`SELECT id FROM vat_codes WHERE code = 'MP1'`).get() as
    | { id: number }
    | undefined
  if (!mp1) throw new Error('MP1 vat code missing')
  return {
    fiscalYearId: fy.id,
    companyId: company.id,
    customerId: customer.data.id,
    mp1Id: mp1.id,
  }
}

describe('Sprint 30 — preview/finalize parity (invoice, customer_invoice)', () => {
  let db: Database.Database
  let fiscalYearId: number
  let customerId: number
  let mp1Id: number

  beforeEach(() => {
    db = createTestDb()
    const setup = setupCompany(db)
    fiscalYearId = setup.fiscalYearId
    customerId = setup.customerId
    mp1Id = setup.mp1Id
  })

  it('freeform-rad 25%-moms: preview === finalize', () => {
    const lines = [
      {
        product_id: null,
        description: 'Konsulttjänst',
        quantity: 10,
        unit_price_ore: 80000, // 800 kr × 10 = 8000 kr revenue, 2000 kr VAT
        vat_code_id: mp1Id,
        sort_order: 0,
        account_number: '3001',
      },
    ]

    const preview = previewJournalLines(db, {
      source: 'invoice',
      fiscal_year_id: fiscalYearId,
      invoice_date: '2026-04-29',
      invoice_type: 'customer_invoice',
      lines: lines.map((l) => ({
        product_id: l.product_id,
        account_number: l.account_number,
        description: l.description,
        quantity: l.quantity,
        unit_price_ore: l.unit_price_ore,
        vat_code_id: l.vat_code_id,
      })),
    })
    expect(preview.success).toBe(true)
    if (!preview.success) return

    const saveResult = saveDraft(db, {
      counterparty_id: customerId,
      fiscal_year_id: fiscalYearId,
      invoice_type: 'customer_invoice',
      invoice_date: '2026-04-29',
      due_date: '2026-05-29',
      payment_terms: 30,
      lines,
    })
    expect(saveResult.success).toBe(true)
    if (!saveResult.success) return

    const finalize = finalizeDraft(db, saveResult.data.id)
    expect(finalize.success).toBe(true)
    if (!finalize.success) return

    const inv = db
      .prepare('SELECT journal_entry_id FROM invoices WHERE id = ?')
      .get(saveResult.data.id) as { journal_entry_id: number }
    expect(inv.journal_entry_id).not.toBeNull()

    expect(normalizePreview(preview.data.lines)).toEqual(
      readJournalLines(db, inv.journal_entry_id),
    )
  })

  it('product-baserad rad: preview resolverar account via products.account_id === finalize', () => {
    const companyId = (
      db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: number }
    ).id
    const acc3001 = db
      .prepare(`SELECT id FROM accounts WHERE account_number = '3001'`)
      .get() as { id: number }
    const product = createProduct(db, {
      company_id: companyId,
      name: 'Konsulttimme',
      unit: 'timme',
      default_price_ore: 100000,
      vat_code_id: mp1Id,
      account_id: acc3001.id,
      article_type: 'service',
    })
    expect(product.success).toBe(true)
    if (!product.success) return

    const lines = [
      {
        product_id: product.data.id,
        description: 'Konsulttimme',
        quantity: 5,
        unit_price_ore: 100000,
        vat_code_id: mp1Id,
        sort_order: 0,
        account_number: null,
      },
    ]

    const preview = previewJournalLines(db, {
      source: 'invoice',
      fiscal_year_id: fiscalYearId,
      invoice_date: '2026-04-29',
      invoice_type: 'customer_invoice',
      lines: lines.map((l) => ({
        product_id: l.product_id,
        account_number: l.account_number,
        description: l.description,
        quantity: l.quantity,
        unit_price_ore: l.unit_price_ore,
        vat_code_id: l.vat_code_id,
      })),
    })
    expect(preview.success).toBe(true)
    if (!preview.success) return

    const saveResult = saveDraft(db, {
      counterparty_id: customerId,
      fiscal_year_id: fiscalYearId,
      invoice_type: 'customer_invoice',
      invoice_date: '2026-04-29',
      due_date: '2026-05-29',
      payment_terms: 30,
      lines,
    })
    expect(saveResult.success).toBe(true)
    if (!saveResult.success) return

    const finalize = finalizeDraft(db, saveResult.data.id)
    expect(finalize.success).toBe(true)
    if (!finalize.success) return

    const inv = db
      .prepare('SELECT journal_entry_id FROM invoices WHERE id = ?')
      .get(saveResult.data.id) as { journal_entry_id: number }

    expect(normalizePreview(preview.data.lines)).toEqual(
      readJournalLines(db, inv.journal_entry_id),
    )
  })

  it('multi-rad olika intäktskonton: VAT-aggregering matchar', () => {
    const lines = [
      {
        product_id: null,
        description: 'Konsult A',
        quantity: 4,
        unit_price_ore: 50000,
        vat_code_id: mp1Id,
        sort_order: 0,
        account_number: '3001',
      },
      {
        product_id: null,
        description: 'Konsult B',
        quantity: 2,
        unit_price_ore: 60000,
        vat_code_id: mp1Id,
        sort_order: 1,
        account_number: '3001',
      },
      {
        product_id: null,
        description: 'Vara',
        quantity: 1,
        unit_price_ore: 200000,
        vat_code_id: mp1Id,
        sort_order: 2,
        account_number: '3002',
      },
    ]

    const preview = previewJournalLines(db, {
      source: 'invoice',
      fiscal_year_id: fiscalYearId,
      invoice_date: '2026-04-29',
      invoice_type: 'customer_invoice',
      lines: lines.map((l) => ({
        product_id: l.product_id,
        account_number: l.account_number,
        description: l.description,
        quantity: l.quantity,
        unit_price_ore: l.unit_price_ore,
        vat_code_id: l.vat_code_id,
      })),
    })
    expect(preview.success).toBe(true)
    if (!preview.success) return

    const saveResult = saveDraft(db, {
      counterparty_id: customerId,
      fiscal_year_id: fiscalYearId,
      invoice_type: 'customer_invoice',
      invoice_date: '2026-04-29',
      due_date: '2026-05-29',
      payment_terms: 30,
      lines,
    })
    expect(saveResult.success).toBe(true)
    if (!saveResult.success) return

    const finalize = finalizeDraft(db, saveResult.data.id)
    expect(finalize.success).toBe(true)
    if (!finalize.success) return

    const inv = db
      .prepare('SELECT journal_entry_id FROM invoices WHERE id = ?')
      .get(saveResult.data.id) as { journal_entry_id: number }

    expect(normalizePreview(preview.data.lines)).toEqual(
      readJournalLines(db, inv.journal_entry_id),
    )
  })

  it('totalsummor matchar: preview.total_debit/credit === finalize-summa', () => {
    const lines = [
      {
        product_id: null,
        description: 'X',
        quantity: 3,
        unit_price_ore: 100000,
        vat_code_id: mp1Id,
        sort_order: 0,
        account_number: '3001',
      },
    ]

    const preview = previewJournalLines(db, {
      source: 'invoice',
      fiscal_year_id: fiscalYearId,
      invoice_date: '2026-04-29',
      invoice_type: 'customer_invoice',
      lines: lines.map((l) => ({
        product_id: l.product_id,
        account_number: l.account_number,
        description: l.description,
        quantity: l.quantity,
        unit_price_ore: l.unit_price_ore,
        vat_code_id: l.vat_code_id,
      })),
    })
    expect(preview.success).toBe(true)
    if (!preview.success) return
    expect(preview.data.balanced).toBe(true)

    const saveResult = saveDraft(db, {
      counterparty_id: customerId,
      fiscal_year_id: fiscalYearId,
      invoice_type: 'customer_invoice',
      invoice_date: '2026-04-29',
      due_date: '2026-05-29',
      payment_terms: 30,
      lines,
    })
    expect(saveResult.success).toBe(true)
    if (!saveResult.success) return

    finalizeDraft(db, saveResult.data.id)
    const inv = db
      .prepare('SELECT journal_entry_id FROM invoices WHERE id = ?')
      .get(saveResult.data.id) as { journal_entry_id: number }

    const journalLines = readJournalLines(db, inv.journal_entry_id)
    const totalDebit = journalLines.reduce((s, l) => s + l.debit_ore, 0)
    const totalCredit = journalLines.reduce((s, l) => s + l.credit_ore, 0)
    expect(totalDebit).toBe(preview.data.total_debit_ore)
    expect(totalCredit).toBe(preview.data.total_credit_ore)
  })
})

describe('Sprint 30 — preview/finalize parity (invoice, credit_note sign-flip)', () => {
  let db: Database.Database
  let fiscalYearId: number
  let customerId: number
  let mp1Id: number

  beforeEach(() => {
    db = createTestDb()
    const setup = setupCompany(db)
    fiscalYearId = setup.fiscalYearId
    customerId = setup.customerId
    mp1Id = setup.mp1Id
  })

  it('credit_note: K 1510 + D intäkt + D moms — preview === finalize', () => {
    const lines = [
      {
        product_id: null,
        description: 'Kreditering konsult',
        quantity: 2,
        unit_price_ore: 100000, // 1000 kr × 2 = 2000 kr revenue, 500 kr VAT
        vat_code_id: mp1Id,
        sort_order: 0,
        account_number: '3001',
      },
    ]

    // För kreditfaktura krävs en originalfaktura — skapa och boka först
    const original = saveDraft(db, {
      counterparty_id: customerId,
      fiscal_year_id: fiscalYearId,
      invoice_type: 'customer_invoice',
      invoice_date: '2026-04-29',
      due_date: '2026-05-29',
      payment_terms: 30,
      lines,
    })
    expect(original.success).toBe(true)
    if (!original.success) return
    const originalFinalize = finalizeDraft(db, original.data.id)
    expect(originalFinalize.success).toBe(true)
    if (!originalFinalize.success) return

    const preview = previewJournalLines(db, {
      source: 'invoice',
      fiscal_year_id: fiscalYearId,
      invoice_date: '2026-04-30',
      invoice_type: 'credit_note',
      lines: lines.map((l) => ({
        product_id: l.product_id,
        account_number: l.account_number,
        description: l.description,
        quantity: l.quantity,
        unit_price_ore: l.unit_price_ore,
        vat_code_id: l.vat_code_id,
      })),
    })
    expect(preview.success).toBe(true)
    if (!preview.success) return

    // Verifiera sign-flip i preview
    const previewFordran = preview.data.lines.find(
      (l) => l.account_number === '1510',
    )!
    expect(previewFordran.credit_ore).toBeGreaterThan(0)
    expect(previewFordran.debit_ore).toBe(0)

    const creditDraft = saveDraft(db, {
      counterparty_id: customerId,
      fiscal_year_id: fiscalYearId,
      invoice_type: 'credit_note',
      credits_invoice_id: original.data.id,
      invoice_date: '2026-04-30',
      due_date: '2026-05-30',
      payment_terms: 30,
      lines,
    })
    expect(creditDraft.success).toBe(true)
    if (!creditDraft.success) return

    const creditFinalize = finalizeDraft(db, creditDraft.data.id)
    expect(creditFinalize.success).toBe(true)
    if (!creditFinalize.success) return

    const creditInv = db
      .prepare('SELECT journal_entry_id FROM invoices WHERE id = ?')
      .get(creditDraft.data.id) as { journal_entry_id: number }

    expect(normalizePreview(preview.data.lines)).toEqual(
      readJournalLines(db, creditInv.journal_entry_id),
    )
  })
})
