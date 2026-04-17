import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import {
  saveDraft,
  finalizeDraft,
  createCreditNoteDraft,
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
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  const cp = createCounterparty(testDb, { name: 'Kund AB', type: 'customer' })
  if (!cp.success) throw new Error('CP failed')
  const vatCode = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
    .get() as { id: number }
  const account = testDb
    .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
    .get() as { id: number }
  const product = createProduct(testDb, {
    name: 'Konsult',
    default_price_ore: 100000,
    vat_code_id: vatCode.id,
    account_id: account.id,
  })
  if (!product.success) throw new Error('Product failed')
  return {
    fiscalYearId: fy.id,
    cpId: cp.data.id,
    vatCodeId: vatCode.id,
    productId: product.data.id,
  }
}

function createFinalizedInvoice(
  testDb: Database.Database,
  seed: ReturnType<typeof seedAll>,
) {
  const result = saveDraft(testDb, {
    counterparty_id: seed.cpId,
    fiscal_year_id: seed.fiscalYearId,
    invoice_date: '2026-03-15',
    due_date: '2026-04-14',
    lines: [
      {
        product_id: seed.productId,
        description: 'Konsult',
        quantity: 10,
        unit_price_ore: 100000,
        vat_code_id: seed.vatCodeId,
        sort_order: 0,
      },
    ],
  })
  if (!result.success) throw new Error('Draft failed: ' + result.error)
  const fResult = finalizeDraft(testDb, result.data.id)
  if (!fResult.success) throw new Error('Finalize failed: ' + fResult.error)
  return fResult.data
}

beforeEach(() => {
  db = createTestDb()
})
afterEach(() => {
  db.close()
})

describe('Kreditfakturor', () => {
  describe('createCreditNoteDraft', () => {
    it('skapar kreditfaktura-utkast med kopierade rader', () => {
      const seed = seedAll(db)
      const invoice = createFinalizedInvoice(db, seed)

      const result = createCreditNoteDraft(db, {
        original_invoice_id: invoice.id,
        fiscal_year_id: seed.fiscalYearId,
      })

      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.invoice_type).toBe('credit_note')
      expect(result.data.credits_invoice_id).toBe(invoice.id)
      expect(result.data.status).toBe('draft')
      expect(result.data.lines.length).toBe(1)
      expect(result.data.lines[0].quantity).toBe(10)
      expect(result.data.lines[0].unit_price_ore).toBe(100000)
    })

    it('nekar kreditering av utkast', () => {
      const seed = seedAll(db)
      // Skapa bara ett utkast, finalisera INTE
      const draft = saveDraft(db, {
        counterparty_id: seed.cpId,
        fiscal_year_id: seed.fiscalYearId,
        invoice_date: '2025-03-15',
        due_date: '2025-04-14',
        lines: [
          {
            product_id: seed.productId,
            description: 'Konsult',
            quantity: 1,
            unit_price_ore: 100000,
            vat_code_id: seed.vatCodeId,
            sort_order: 0,
          },
        ],
      })
      if (!draft.success) throw new Error('Draft failed')

      const result = createCreditNoteDraft(db, {
        original_invoice_id: draft.data.id,
        fiscal_year_id: seed.fiscalYearId,
      })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('CREDIT_NOTE_ORIGINAL_NOT_FOUND')
    })

    it('nekar kreditering av kreditfaktura', () => {
      const seed = seedAll(db)
      const invoice = createFinalizedInvoice(db, seed)

      // Skapa kreditfaktura
      const cn = createCreditNoteDraft(db, {
        original_invoice_id: invoice.id,
        fiscal_year_id: seed.fiscalYearId,
      })
      if (!cn.success) throw new Error('CN draft failed')

      // Finalisera kreditfakturan
      const fnResult = finalizeDraft(db, cn.data.id)
      if (!fnResult.success)
        throw new Error('CN finalize failed: ' + fnResult.error)

      // Försök kreditera kreditfakturan
      const result = createCreditNoteDraft(db, {
        original_invoice_id: fnResult.data.id,
        fiscal_year_id: seed.fiscalYearId,
      })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.error).toContain('kreditfaktura')
    })

    it('nekar dubbelkreditering', () => {
      const seed = seedAll(db)
      const invoice = createFinalizedInvoice(db, seed)

      // Första kreditfakturan OK
      const cn1 = createCreditNoteDraft(db, {
        original_invoice_id: invoice.id,
        fiscal_year_id: seed.fiscalYearId,
      })
      expect(cn1.success).toBe(true)

      // Andra kreditfakturan NEKAS
      const cn2 = createCreditNoteDraft(db, {
        original_invoice_id: invoice.id,
        fiscal_year_id: seed.fiscalYearId,
      })
      expect(cn2.success).toBe(false)
      if (cn2.success) return
      expect(cn2.error).toContain('redan')
    })

    it('returnerar NOT_FOUND för obefintlig faktura', () => {
      const seed = seedAll(db)

      const result = createCreditNoteDraft(db, {
        original_invoice_id: 99999,
        fiscal_year_id: seed.fiscalYearId,
      })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.code).toBe('CREDIT_NOTE_ORIGINAL_NOT_FOUND')
    })
  })

  describe('Omvänd bokföring', () => {
    it('kreditfaktura bokförs med omvända journal lines (K 1510, D intäkt, D moms)', () => {
      const seed = seedAll(db)
      const invoice = createFinalizedInvoice(db, seed)

      const cn = createCreditNoteDraft(db, {
        original_invoice_id: invoice.id,
        fiscal_year_id: seed.fiscalYearId,
      })
      if (!cn.success) throw new Error('CN draft failed')

      const fnResult = finalizeDraft(db, cn.data.id)
      if (!fnResult.success)
        throw new Error('CN finalize failed: ' + fnResult.error)

      // Hämta journal entry lines
      const lines = db
        .prepare(
          `
        SELECT jel.account_number, jel.debit_ore, jel.credit_ore
        FROM journal_entry_lines jel
        WHERE jel.journal_entry_id = ?
        ORDER BY jel.line_number
      `,
        )
        .all(fnResult.data.journal_entry_id) as {
        account_number: string
        debit_ore: number
        credit_ore: number
      }[]

      // 1510 ska vara KREDIT (inte DEBET som vanlig faktura)
      const receivable = lines.find((l) => l.account_number === '1510')!
      expect(receivable.debit_ore).toBe(0)
      expect(receivable.credit_ore).toBeGreaterThan(0)

      // Intäktskonto ska vara DEBET (inte KREDIT)
      const revenue = lines.find((l) => l.account_number === '3002')!
      expect(revenue.debit_ore).toBeGreaterThan(0)
      expect(revenue.credit_ore).toBe(0)

      // Momskonto ska vara DEBET (inte KREDIT)
      const vat = lines.find((l) => l.account_number === '2610')!
      expect(vat.debit_ore).toBeGreaterThan(0)
      expect(vat.credit_ore).toBe(0)

      // Verifikat ska balansera
      const totalDebit = lines.reduce((sum, l) => sum + l.debit_ore, 0)
      const totalCredit = lines.reduce((sum, l) => sum + l.credit_ore, 0)
      expect(totalDebit).toBe(totalCredit)
    })

    it('verifikationstext innehåller referens till originalfaktura', () => {
      const seed = seedAll(db)
      const invoice = createFinalizedInvoice(db, seed)

      const cn = createCreditNoteDraft(db, {
        original_invoice_id: invoice.id,
        fiscal_year_id: seed.fiscalYearId,
      })
      if (!cn.success) throw new Error('CN draft failed')

      const fnResult = finalizeDraft(db, cn.data.id)
      if (!fnResult.success)
        throw new Error('CN finalize failed: ' + fnResult.error)

      const entry = db
        .prepare('SELECT description FROM journal_entries WHERE id = ?')
        .get(fnResult.data.journal_entry_id) as { description: string }

      expect(entry.description).toContain('Kreditfaktura')
      expect(entry.description).toContain(
        `avser faktura #${invoice.invoice_number}`,
      )
    })
  })

  describe('listInvoices', () => {
    it('visar has_credit_note för krediterad faktura', () => {
      const seed = seedAll(db)
      const invoice = createFinalizedInvoice(db, seed)

      // Skapa kreditfaktura-utkast (räcker för att trigga has_credit_note)
      const cn = createCreditNoteDraft(db, {
        original_invoice_id: invoice.id,
        fiscal_year_id: seed.fiscalYearId,
      })
      if (!cn.success) throw new Error('CN draft failed')

      const list = listInvoices(db, { fiscal_year_id: seed.fiscalYearId })
      const original = list.items.find((i) => i.id === invoice.id)!
      expect(original.has_credit_note).toBeTruthy()

      const creditNote = list.items.find((i) => i.id === cn.data.id)!
      expect(creditNote.invoice_type).toBe('credit_note')
      expect(creditNote.credits_invoice_id).toBe(invoice.id)
    })
  })
})
