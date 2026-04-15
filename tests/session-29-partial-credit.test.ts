import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import {
  saveDraft,
  updateDraft,
  finalizeDraft,
  createCreditNoteDraft,
  getDraft,
  listInvoices,
} from '../src/main/services/invoice-service'

let db: Database.Database

const VALID_COMPANY = {
  name: 'Test AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2026-01-15',
  fiscal_year_start: '2026-01-01',
  fiscal_year_end: '2026-12-31',
}

function seedAll(testDb: Database.Database) {
  createCompany(testDb, VALID_COMPANY)
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  const cp = createCounterparty(testDb, { name: 'Kund AB', type: 'customer' })
  if (!cp.success) throw new Error('CP failed')

  // 25% VAT
  const vat25 = testDb.prepare("SELECT id FROM vat_codes WHERE code = 'MP1'").get() as { id: number }
  // 12% VAT
  const vat12 = testDb.prepare("SELECT id FROM vat_codes WHERE code = 'MP2'").get() as { id: number }

  return {
    fiscalYearId: fy.id,
    cpId: cp.data.id,
    vat25Id: vat25.id,
    vat12Id: vat12.id,
  }
}

function createTwoLineInvoice(
  testDb: Database.Database,
  seed: ReturnType<typeof seedAll>,
  opts?: { vat1Id?: number; vat2Id?: number },
) {
  const vat1 = opts?.vat1Id ?? seed.vat25Id
  const vat2 = opts?.vat2Id ?? seed.vat25Id

  const result = saveDraft(testDb, {
    counterparty_id: seed.cpId,
    fiscal_year_id: seed.fiscalYearId,
    invoice_date: '2026-03-15',
    due_date: '2026-04-14',
    lines: [
      {
        product_id: null,
        description: 'Konsult',
        account_number: '3001',
        quantity: 1,
        unit_price_ore: 10000, // 100 kr
        vat_code_id: vat1,
        sort_order: 0,
      },
      {
        product_id: null,
        description: 'Material',
        account_number: '3001',
        quantity: 1,
        unit_price_ore: 20000, // 200 kr
        vat_code_id: vat2,
        sort_order: 1,
      },
    ],
  })
  if (!result.success) throw new Error('Draft failed: ' + JSON.stringify(result))
  const fResult = finalizeDraft(testDb, result.data.id)
  if (!fResult.success) throw new Error('Finalize failed: ' + fResult.error)
  return fResult.data
}

beforeEach(() => { db = createTestDb() })
afterEach(() => { db.close() })

describe('B1: Partiell kreditering', () => {
  it('1: justerad qty → verifikat har korrekt netto + moms', () => {
    const seed = seedAll(db)
    const invoice = createTwoLineInvoice(db, seed)

    // Skapa kreditfaktura-utkast
    const cn = createCreditNoteDraft(db, {
      original_invoice_id: invoice.id,
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(cn.success).toBe(true)
    if (!cn.success) return

    // Justera rad 1 qty till 0.5 (partiell)
    const cnDraft = getDraft(db, cn.data.id)
    expect(cnDraft).not.toBeNull()
    const updatedLines = cnDraft!.lines.map((l, i) => ({
      description: l.description,
      account_number: l.account_number,
      quantity: i === 0 ? 0.5 : l.quantity, // Halva för rad 1
      unit_price_ore: l.unit_price_ore,
      vat_code_id: l.vat_code_id,
      sort_order: l.sort_order,
      product_id: l.product_id,
    }))

    const upd = updateDraft(db, {
      id: cn.data.id,
      counterparty_id: cnDraft!.counterparty_id,
      invoice_date: cnDraft!.invoice_date,
      due_date: cnDraft!.due_date,
      lines: updatedLines,
    })
    expect(upd.success).toBe(true)

    // Bokför kreditfakturan
    const fnResult = finalizeDraft(db, cn.data.id)
    expect(fnResult.success).toBe(true)
    if (!fnResult.success) return

    // Hämta verifikatraderna
    const jeId = fnResult.data.journal_entry_id
    const lines = db
      .prepare(
        'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
      )
      .all(jeId) as { account_number: string; debit_ore: number; credit_ore: number }[]

    // Rad 1: 0.5 × 100kr = 50kr netto. Rad 2: 1 × 200kr = 200kr netto. Total: 250kr
    // Moms (25%): 50kr × 0.25 = 12.50kr → 1250 öre. 200kr × 0.25 = 50kr → 5000 öre.
    // Total inkl moms: 250kr + 62.50kr = 312.50kr → 31250 öre

    // Kundfordringar (1510) — kredit vid kreditfaktura
    const custRow = lines.find((l) => l.account_number === '1510')
    expect(custRow).toBeDefined()
    expect(custRow!.credit_ore).toBe(31250)
    expect(custRow!.debit_ore).toBe(0)
  })

  it('2: alla rader justerade → total matchar summan av justerade rader', () => {
    const seed = seedAll(db)
    const invoice = createTwoLineInvoice(db, seed)

    const cn = createCreditNoteDraft(db, {
      original_invoice_id: invoice.id,
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(cn.success).toBe(true)
    if (!cn.success) return

    // Justera BÅDA raderna
    const cnDraft = getDraft(db, cn.data.id)!
    const updatedLines = cnDraft.lines.map((l, i) => ({
      description: l.description,
      account_number: l.account_number,
      quantity: i === 0 ? 0.5 : 0.5, // Halva på båda
      unit_price_ore: l.unit_price_ore,
      vat_code_id: l.vat_code_id,
      sort_order: l.sort_order,
      product_id: l.product_id,
    }))

    const upd2 = updateDraft(db, {
      id: cn.data.id,
      counterparty_id: cnDraft.counterparty_id,
      invoice_date: cnDraft.invoice_date,
      due_date: cnDraft.due_date,
      lines: updatedLines,
    })
    expect(upd2.success).toBe(true)

    const fnResult = finalizeDraft(db, cn.data.id)
    expect(fnResult.success).toBe(true)
    if (!fnResult.success) return

    // Total netto: 0.5×100 + 0.5×200 = 50 + 100 = 150kr
    // NOT original total (100 + 200 = 300kr)
    const jeId = fnResult.data.journal_entry_id
    const custRow = db
      .prepare(
        "SELECT credit_ore FROM journal_entry_lines WHERE journal_entry_id = ? AND account_number = '1510'",
      )
      .get(jeId) as { credit_ore: number }

    // 150kr netto + moms (37.50kr) = 187.50kr = 18750 öre
    expect(custRow.credit_ore).toBe(18750)
  })

  it('3: kreditfaktura med justerade rader balanserar', () => {
    const seed = seedAll(db)
    const invoice = createTwoLineInvoice(db, seed)

    const cn = createCreditNoteDraft(db, {
      original_invoice_id: invoice.id,
      fiscal_year_id: seed.fiscalYearId,
    })
    if (!cn.success) throw new Error('CN draft failed')

    const cnDraft = getDraft(db, cn.data.id)!
    const updatedLines = cnDraft.lines.map((l) => ({
      description: l.description,
      account_number: l.account_number,
      quantity: 0.75,
      unit_price_ore: l.unit_price_ore,
      vat_code_id: l.vat_code_id,
      sort_order: l.sort_order,
      product_id: l.product_id,
    }))

    updateDraft(db, {
      id: cn.data.id,
      counterparty_id: cnDraft.counterparty_id,
      invoice_date: cnDraft.invoice_date,
      due_date: cnDraft.due_date,
      lines: updatedLines,
    })

    const fnResult = finalizeDraft(db, cn.data.id)
    expect(fnResult.success).toBe(true)
    if (!fnResult.success) return

    // Balance: sum(debit) === sum(credit)
    const balance = db
      .prepare(
        'SELECT SUM(debit_ore) as d, SUM(credit_ore) as c FROM journal_entry_lines WHERE journal_entry_id = ?',
      )
      .get(fnResult.data.journal_entry_id) as { d: number; c: number }
    expect(balance.d).toBe(balance.c)
  })

  it('4: original flaggas som krediterad', () => {
    const seed = seedAll(db)
    const invoice = createTwoLineInvoice(db, seed)

    const cn = createCreditNoteDraft(db, {
      original_invoice_id: invoice.id,
      fiscal_year_id: seed.fiscalYearId,
    })
    if (!cn.success) throw new Error('CN draft failed')

    finalizeDraft(db, cn.data.id)

    // Check has_credit_note via raw query (listInvoices returns non-IpcResult)
    const row = db
      .prepare(
        `SELECT (SELECT 1 FROM invoices cn WHERE cn.credits_invoice_id = i.id LIMIT 1) as has_credit_note
         FROM invoices i WHERE i.id = ?`,
      )
      .get(invoice.id) as { has_credit_note: number | null }
    expect(row.has_credit_note).toBe(1)
  })

  it('5: moms korrekt vid partiell kreditering med 25%', () => {
    const seed = seedAll(db)
    const invoice = createTwoLineInvoice(db, seed)

    const cn = createCreditNoteDraft(db, {
      original_invoice_id: invoice.id,
      fiscal_year_id: seed.fiscalYearId,
    })
    if (!cn.success) throw new Error('CN draft failed')

    // Justera bara rad 1 till qty=0.5
    const cnDraft = getDraft(db, cn.data.id)!
    const updatedLines = cnDraft.lines.map((l, i) => ({
      description: l.description,
      account_number: l.account_number,
      quantity: i === 0 ? 0.5 : l.quantity,
      unit_price_ore: l.unit_price_ore,
      vat_code_id: l.vat_code_id,
      sort_order: l.sort_order,
      product_id: l.product_id,
    }))

    updateDraft(db, {
      id: cn.data.id,
      counterparty_id: cnDraft.counterparty_id,
      invoice_date: cnDraft.invoice_date,
      due_date: cnDraft.due_date,
      lines: updatedLines,
    })

    const fnResult = finalizeDraft(db, cn.data.id)
    if (!fnResult.success) throw new Error('Finalize failed: ' + fnResult.error)

    const jeId = fnResult.data.journal_entry_id
    const lines = db
      .prepare(
        'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
      )
      .all(jeId) as { account_number: string; debit_ore: number; credit_ore: number }[]

    // Momskonto 2611 — debet vid kreditfaktura
    const vatRow = lines.find((l) => l.account_number === '2610')
    expect(vatRow).toBeDefined()
    // Moms: (0.5×100 + 1×200) × 0.25 = 250 × 0.25 = 62.50kr = 6250 öre
    expect(vatRow!.debit_ore).toBe(6250)
    expect(vatRow!.credit_ore).toBe(0)
  })

  it('6: blandade momssatser 25% + 12%', () => {
    const seed = seedAll(db)
    const invoice = createTwoLineInvoice(db, seed, {
      vat1Id: seed.vat25Id, // rad 1: 25%
      vat2Id: seed.vat12Id, // rad 2: 12%
    })

    const cn = createCreditNoteDraft(db, {
      original_invoice_id: invoice.id,
      fiscal_year_id: seed.fiscalYearId,
    })
    if (!cn.success) throw new Error('CN draft failed')

    // Justera bara rad 1 (25%-raden) till qty=0.5
    const cnDraft = getDraft(db, cn.data.id)!
    const updatedLines = cnDraft.lines.map((l, i) => ({
      description: l.description,
      account_number: l.account_number,
      quantity: i === 0 ? 0.5 : l.quantity,
      unit_price_ore: l.unit_price_ore,
      vat_code_id: l.vat_code_id,
      sort_order: l.sort_order,
      product_id: l.product_id,
    }))

    updateDraft(db, {
      id: cn.data.id,
      counterparty_id: cnDraft.counterparty_id,
      invoice_date: cnDraft.invoice_date,
      due_date: cnDraft.due_date,
      lines: updatedLines,
    })

    const fnResult = finalizeDraft(db, cn.data.id)
    if (!fnResult.success) throw new Error('Finalize failed: ' + fnResult.error)

    const jeId = fnResult.data.journal_entry_id
    const lines = db
      .prepare(
        'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
      )
      .all(jeId) as { account_number: string; debit_ore: number; credit_ore: number }[]

    // 25% moms: 0.5 × 100kr = 50kr → moms 12.50kr = 1250 öre
    const vat25Row = lines.find((l) => l.account_number === '2610')
    expect(vat25Row).toBeDefined()
    expect(vat25Row!.debit_ore).toBe(1250)

    // 12% moms: 1 × 200kr = 200kr → moms 24kr = 2400 öre
    const vat12Row = lines.find((l) => l.account_number === '2620')
    expect(vat12Row).toBeDefined()
    expect(vat12Row!.debit_ore).toBe(2400)

    // Balance check
    const balance = db
      .prepare(
        'SELECT SUM(debit_ore) as d, SUM(credit_ore) as c FROM journal_entry_lines WHERE journal_entry_id = ?',
      )
      .get(jeId) as { d: number; c: number }
    expect(balance.d).toBe(balance.c)
  })
})
