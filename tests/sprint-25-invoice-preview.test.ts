/**
 * Sprint 25 — Invoice preview-service tests (ADR 006).
 *
 * Verifierar:
 * - customer_invoice: D 1510 + K intäkter + K moms
 * - credit_note: K 1510 + D intäkter + D moms (M137 sign-flip)
 * - product_id resolves via products.account_id → accounts.account_number
 * - account_number freeform fungerar (ingen produkt)
 * - VAT-aggregering per vat_account
 * - Read-only invariant
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { previewJournalLines } from '../src/main/services/preview-service'
import { createCompany } from '../src/main/services/company-service'
import { createProduct } from '../src/main/services/product-service'

function setupCompany(db: Database.Database): { fiscalYearId: number } {
  const r = createCompany(db, {
    name: 'Inv Preview AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 2_500_000,
    registration_date: '2026-01-01',
    fiscal_year_start: '2026-01-01',
    fiscal_year_end: '2026-12-31',
  })
  if (!r.success) throw new Error('createCompany failed: ' + r.error)
  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  return { fiscalYearId: fy.id }
}

describe('previewJournalLines (invoice)', () => {
  let db: Database.Database
  let fiscalYearId: number
  let mp1Id: number
  let companyId: number

  beforeEach(() => {
    db = createTestDb()
    const setup = setupCompany(db)
    fiscalYearId = setup.fiscalYearId
    companyId = (
      db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: number }
    ).id
    mp1Id = (
      db.prepare(`SELECT id FROM vat_codes WHERE code = 'MP1'`).get() as {
        id: number
      }
    ).id
  })

  it('customer_invoice freeform: D 1510 + K 3001 + K 2611', () => {
    const result = previewJournalLines(db, {
      source: 'invoice',
      fiscal_year_id: fiscalYearId,
      invoice_date: '2026-04-29',
      invoice_type: 'customer_invoice',
      lines: [
        {
          account_number: '3001',
          description: 'Konsulttjänst',
          quantity: 10,
          unit_price_ore: 80000, // 800 kr
          vat_code_id: mp1Id, // 25%
        },
      ],
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const accs = result.data.lines.map((l) => l.account_number)
    expect(accs).toContain('1510')
    expect(accs).toContain('3001')
    // MP1 har vat_account = 2610
    expect(accs).toContain('2610')

    const fordran = result.data.lines.find((l) => l.account_number === '1510')!
    expect(fordran.debit_ore).toBe(1000000) // 10 × 800 + 25% moms = 1000000 öre
    expect(fordran.credit_ore).toBe(0)

    const intakt = result.data.lines.find((l) => l.account_number === '3001')!
    expect(intakt.credit_ore).toBe(800000)
    expect(intakt.debit_ore).toBe(0)

    const moms = result.data.lines.find((l) => l.account_number === '2610')!
    expect(moms.credit_ore).toBe(200000)

    expect(result.data.balanced).toBe(true)
  })

  it('credit_note: sign-flippas (K 1510, D intäkter, D moms)', () => {
    const result = previewJournalLines(db, {
      source: 'invoice',
      fiscal_year_id: fiscalYearId,
      invoice_date: '2026-04-29',
      invoice_type: 'credit_note',
      lines: [
        {
          account_number: '3001',
          description: 'Kreditering',
          quantity: 1,
          unit_price_ore: 80000,
          vat_code_id: mp1Id,
        },
      ],
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const fordran = result.data.lines.find((l) => l.account_number === '1510')!
    expect(fordran.credit_ore).toBeGreaterThan(0)
    expect(fordran.debit_ore).toBe(0)

    const intakt = result.data.lines.find((l) => l.account_number === '3001')!
    expect(intakt.debit_ore).toBe(80000)
    expect(intakt.credit_ore).toBe(0)

    expect(result.data.balanced).toBe(true)
  })

  it('product_id resolves via products.account_id', () => {
    // Skapa produkt med konto 3001
    const account3001 = db
      .prepare(`SELECT id FROM accounts WHERE account_number = '3001'`)
      .get() as { id: number }
    const productResult = createProduct(db, {
      company_id: companyId,
      name: 'Test produkt',
      article_type: 'service',
      default_price_ore: 50000,
      unit: 'styck',
      vat_code_id: mp1Id,
      account_id: account3001.id,
    })
    expect(productResult.success).toBe(true)
    if (!productResult.success) return

    const result = previewJournalLines(db, {
      source: 'invoice',
      fiscal_year_id: fiscalYearId,
      invoice_date: '2026-04-29',
      invoice_type: 'customer_invoice',
      lines: [
        {
          product_id: productResult.data.id,
          description: 'Via produkt',
          quantity: 2,
          unit_price_ore: 50000,
          vat_code_id: mp1Id,
        },
      ],
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    // Intäktskonto ska vara 3001 (från produkt → konto-uppslag)
    expect(result.data.lines.some((l) => l.account_number === '3001')).toBe(
      true,
    )
  })

  it('aggregerar samma intäktskonto från flera rader', () => {
    const result = previewJournalLines(db, {
      source: 'invoice',
      fiscal_year_id: fiscalYearId,
      invoice_date: '2026-04-29',
      invoice_type: 'customer_invoice',
      lines: [
        {
          account_number: '3001',
          description: 'A',
          quantity: 1,
          unit_price_ore: 50000,
          vat_code_id: mp1Id,
        },
        {
          account_number: '3001',
          description: 'B',
          quantity: 1,
          unit_price_ore: 30000,
          vat_code_id: mp1Id,
        },
      ],
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const intaktRows = result.data.lines.filter(
      (l) => l.account_number === '3001',
    )
    expect(intaktRows).toHaveLength(1)
    expect(intaktRows[0].credit_ore).toBe(80000)
  })

  it('does NOT write to DB (read-only invariant)', () => {
    const before = db
      .prepare('SELECT COUNT(*) as c FROM journal_entries')
      .get() as { c: number }
    previewJournalLines(db, {
      source: 'invoice',
      fiscal_year_id: fiscalYearId,
      invoice_date: '2026-04-29',
      invoice_type: 'customer_invoice',
      lines: [
        {
          account_number: '3001',
          description: 'X',
          quantity: 1,
          unit_price_ore: 50000,
          vat_code_id: mp1Id,
        },
      ],
    })
    const after = db
      .prepare('SELECT COUNT(*) as c FROM journal_entries')
      .get() as { c: number }
    expect(after.c).toBe(before.c)
  })

  it('warning när product_id saknar kontokoppling', () => {
    // Använd hardkodat fiktivt product_id som inte existerar
    const result = previewJournalLines(db, {
      source: 'invoice',
      fiscal_year_id: fiscalYearId,
      invoice_date: '2026-04-29',
      invoice_type: 'customer_invoice',
      lines: [
        {
          product_id: 99999,
          description: 'Spöke-produkt',
          quantity: 1,
          unit_price_ore: 50000,
          vat_code_id: mp1Id,
        },
      ],
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    // Raden ignoreras → 1510 finns men endast med 0 belopp + warning
    expect(result.data.warnings.length).toBeGreaterThan(0)
  })
})
