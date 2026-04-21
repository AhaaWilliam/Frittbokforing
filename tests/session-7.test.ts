import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import {
  saveDraft,
  getDraft,
  finalizeDraft,
  updateSentInvoice,
} from '../src/main/services/invoice-service'

let db: Database.Database

const VALID_COMPANY = {
  name: 'Test AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2025-01-15',
  fiscal_year_start: '2025-01-01',
  fiscal_year_end: '2025-12-31',
}

function seedAll(testDb: Database.Database) {
  const company = createCompany(testDb, VALID_COMPANY)
  if (!company.success) throw new Error('Company seed failed')
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  const cp = createCounterparty(testDb, {
    company_id: 1,
    name: 'Kund AB',
    type: 'customer',
  })
  if (!cp.success) throw new Error('Counterparty seed failed')
  const vatCode25 = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
    .get() as { id: number }
  const vatCode12 = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP2'")
    .get() as { id: number }
  const account = testDb
    .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
    .get() as { id: number }
  const product = createProduct(testDb, {
    company_id: 1,
    name: 'Konsulttjänst',
    unit: 'timme',
    default_price_ore: 95000,
    vat_code_id: vatCode25.id,
    account_id: account.id,
    article_type: 'service',
  })
  if (!product.success) throw new Error('Product seed failed')
  return {
    companyId: company.data.id,
    fiscalYearId: fy.id,
    counterpartyId: cp.data.id,
    productId: product.data.id,
    vatCode25Id: vatCode25.id,
    vatCode12Id: vatCode12.id,
    accountId: account.id,
  }
}

function createTestDraft(
  testDb: Database.Database,
  seed: ReturnType<typeof seedAll>,
  opts?: { date?: string; quantity?: number; unitPrice?: number },
) {
  const result = saveDraft(testDb, {
    counterparty_id: seed.counterpartyId,
    fiscal_year_id: seed.fiscalYearId,
    invoice_date: opts?.date ?? '2025-03-15',
    due_date: '2025-04-15',
    lines: [
      {
        product_id: seed.productId,
        description: 'Konsulttjänst',
        quantity: opts?.quantity ?? 40,
        unit_price_ore: opts?.unitPrice ?? 95000,
        vat_code_id: seed.vatCode25Id,
        sort_order: 0,
      },
    ],
  })
  if (!result.success) throw new Error('Draft creation failed: ' + result.error)
  return result.data
}

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  if (db) db.close()
})

// ═══════════════════════════════════════════════════════════
// Migration 007 (2 tester)
// ═══════════════════════════════════════════════════════════
describe('Migration 007', () => {
  it('1. user_version = 14, invoice_lines.account_number exists', () => {
    const v = db.pragma('user_version', { simple: true })
    expect(v).toBe(52) // S58: Uppdatera vid nya migrationer

    const cols = (
      db.pragma('table_info(invoice_lines)') as { name: string }[]
    ).map((c) => c.name)
    expect(cols).toContain('account_number')
  })

  it('2. UNIQUE indexes exist', () => {
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'",
      )
      .all() as { name: string }[]
    const names = indexes.map((i) => i.name)
    // Migration 009 replaced idx_journal_entries_year_vernum with verify_series_unique
    expect(
      names.includes('idx_journal_entries_year_vernum') ||
        names.includes('idx_journal_entries_verify_series_unique'),
    ).toBe(true)
    expect(names).toContain('idx_invoices_year_invnum')
  })
})

// ═══════════════════════════════════════════════════════════
// Finalize / Bokföring (5 tester)
// ═══════════════════════════════════════════════════════════
describe('Finalize (bokför)', () => {
  it('3. Bokför draft → status=unpaid, nummer allokeras, journal_entry skapas', () => {
    const seed = seedAll(db)
    const draft = createTestDraft(db, seed)

    const result = finalizeDraft(db, draft.id)
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.status).toBe('unpaid')
    expect(result.data.invoice_number).toBe('1')

    // Journal entry exists
    const entry = db
      .prepare('SELECT * FROM journal_entries WHERE fiscal_year_id = ?')
      .get(seed.fiscalYearId) as { status: string; verification_number: number }
    expect(entry.status).toBe('booked')
    expect(entry.verification_number).toBe(1)

    // Journal entry lines balance
    const lines = db
      .prepare(
        'SELECT SUM(debit_ore) as d, SUM(credit_ore) as c FROM journal_entry_lines WHERE journal_entry_id = (SELECT id FROM journal_entries LIMIT 1)',
      )
      .get() as { d: number; c: number }
    expect(lines.d).toBe(lines.c)
  })

  it('4. Gaplös numrering: 3 drafts → fakturanummer 1, 2, 3', () => {
    const seed = seedAll(db)
    const d1 = createTestDraft(db, seed, { date: '2025-03-15' })
    const d2 = createTestDraft(db, seed, { date: '2025-03-16' })
    const d3 = createTestDraft(db, seed, { date: '2025-03-17' })

    finalizeDraft(db, d1.id)
    finalizeDraft(db, d2.id)
    finalizeDraft(db, d3.id)

    const invoices = db
      .prepare(
        "SELECT invoice_number FROM invoices WHERE invoice_number != '' ORDER BY CAST(invoice_number AS INTEGER)",
      )
      .all() as { invoice_number: string }[]
    expect(invoices.map((i) => i.invoice_number)).toEqual(['1', '2', '3'])
  })

  it('5. Kan inte bokföra icke-draft → INVOICE_NOT_DRAFT', () => {
    const seed = seedAll(db)
    const draft = createTestDraft(db, seed)
    finalizeDraft(db, draft.id)

    const result = finalizeDraft(db, draft.id)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.code).toBe('INVOICE_NOT_DRAFT')
  })

  it('6. Kan inte bokföra i stängd period → error', () => {
    const seed = seedAll(db)
    const draft = createTestDraft(db, seed, { date: '2025-03-15' })

    // Stäng period 3 (mars)
    db.prepare(
      'UPDATE accounting_periods SET is_closed = 1 WHERE fiscal_year_id = ? AND period_number = 3',
    ).run(seed.fiscalYearId)

    const result = finalizeDraft(db, draft.id)
    expect(result.success).toBe(false)
  })

  it('7. Verifikationsnummer sekventiella', () => {
    const seed = seedAll(db)
    const d1 = createTestDraft(db, seed, { date: '2025-03-15' })
    const d2 = createTestDraft(db, seed, { date: '2025-03-16' })

    finalizeDraft(db, d1.id)
    finalizeDraft(db, d2.id)

    const entries = db
      .prepare(
        'SELECT verification_number FROM journal_entries WHERE fiscal_year_id = ? ORDER BY verification_number',
      )
      .all(seed.fiscalYearId) as { verification_number: number }[]
    expect(entries.map((e) => e.verification_number)).toEqual([1, 2])
  })
})

// ═══════════════════════════════════════════════════════════
// Kontering / Dubbel bokföring (4 tester)
// ═══════════════════════════════════════════════════════════
describe('Kontering', () => {
  it('8. Enkel faktura 25%: debet 1510 = kredit 3002 + kredit 2610', () => {
    const seed = seedAll(db)
    const draft = createTestDraft(db, seed, {
      quantity: 40,
      unitPrice: 95000,
    })
    finalizeDraft(db, draft.id)

    const jeId = db.prepare('SELECT id FROM journal_entries LIMIT 1').get() as {
      id: number
    }
    const lines = db
      .prepare(
        'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
      )
      .all(jeId.id) as {
      account_number: string
      debit_ore: number
      credit_ore: number
    }[]

    // Debet 1510: 40 * 95000 + 40 * 95000 * 0.25 = 3800000 + 950000 = 4750000
    const debet1510 = lines.find((l) => l.account_number === '1510')
    expect(debet1510).toBeDefined()
    expect(debet1510!.debit_ore).toBe(4750000)

    // Kredit 3002: 3800000
    const kredit3002 = lines.find((l) => l.account_number === '3002')
    expect(kredit3002).toBeDefined()
    expect(kredit3002!.credit_ore).toBe(3800000)

    // Kredit 2610: 950000
    const kredit2610 = lines.find((l) => l.account_number === '2610')
    expect(kredit2610).toBeDefined()
    expect(kredit2610!.credit_ore).toBe(950000)
  })

  it('9. Balanscheck: SUM(debit) = SUM(credit)', () => {
    const seed = seedAll(db)
    const d1 = createTestDraft(db, seed, { date: '2025-03-15' })
    const d2 = createTestDraft(db, seed, { date: '2025-03-16' })
    finalizeDraft(db, d1.id)
    finalizeDraft(db, d2.id)

    const balance = db
      .prepare(
        'SELECT SUM(debit_ore) as d, SUM(credit_ore) as c FROM journal_entry_lines',
      )
      .get() as { d: number; c: number }
    expect(balance.d).toBe(balance.c)
  })

  it('10. Mixad moms (25% + 12%): rätt antal lines och konton', () => {
    const seed = seedAll(db)
    const result = saveDraft(db, {
      counterparty_id: seed.counterpartyId,
      fiscal_year_id: seed.fiscalYearId,
      invoice_date: '2025-03-15',
      due_date: '2025-04-15',
      lines: [
        {
          product_id: seed.productId,
          description: 'Tjänst 25%',
          quantity: 10,
          unit_price_ore: 100000,
          vat_code_id: seed.vatCode25Id,
          sort_order: 0,
        },
        {
          product_id: null,
          description: 'Vara 12%',
          quantity: 5,
          unit_price_ore: 20000,
          vat_code_id: seed.vatCode12Id,
          sort_order: 1,
          account_number: '3040',
        },
      ],
    })
    if (!result.success) return

    finalizeDraft(db, result.data.id)

    const lines = db
      .prepare(
        'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = (SELECT MAX(id) FROM journal_entries)',
      )
      .all() as {
      account_number: string
      debit_ore: number
      credit_ore: number
    }[]

    // Should have: 1510 (debet), 3002 (kredit), 3040 (kredit), 2610 (kredit 25%), 2620 (kredit 12%)
    expect(lines.length).toBeGreaterThanOrEqual(4)
    const totalDebit = lines.reduce((s, l) => s + l.debit_ore, 0)
    const totalCredit = lines.reduce((s, l) => s + l.credit_ore, 0)
    expect(totalDebit).toBe(totalCredit)
  })

  it('11. Friform-rad med account_number → rätt konto i journal', () => {
    const seed = seedAll(db)
    const result = saveDraft(db, {
      counterparty_id: seed.counterpartyId,
      fiscal_year_id: seed.fiscalYearId,
      invoice_date: '2025-03-15',
      due_date: '2025-04-15',
      lines: [
        {
          product_id: null,
          description: 'Friform',
          quantity: 1,
          unit_price_ore: 50000,
          vat_code_id: seed.vatCode25Id,
          sort_order: 0,
          account_number: '3001',
        },
      ],
    })
    if (!result.success) return

    finalizeDraft(db, result.data.id)

    const kredit3001 = db
      .prepare(
        "SELECT credit_ore FROM journal_entry_lines WHERE journal_entry_id = (SELECT MAX(id) FROM journal_entries) AND account_number = '3001'",
      )
      .get() as { credit_ore: number } | undefined
    expect(kredit3001).toBeDefined()
    expect(kredit3001!.credit_ore).toBe(50000)
  })
})

// ═══════════════════════════════════════════════════════════
// Validering (2 tester)
// ═══════════════════════════════════════════════════════════
describe('Pre-flight validering', () => {
  it('12. Friform utan account_number → error', () => {
    const seed = seedAll(db)
    const result = saveDraft(db, {
      counterparty_id: seed.counterpartyId,
      fiscal_year_id: seed.fiscalYearId,
      invoice_date: '2025-03-15',
      due_date: '2025-04-15',
      lines: [
        {
          product_id: null,
          description: 'Friform utan konto',
          quantity: 1,
          unit_price_ore: 50000,
          vat_code_id: seed.vatCode25Id,
          sort_order: 0,
          // account_number intentionally missing
        },
      ],
    })
    if (!result.success) return

    const finalizeResult = finalizeDraft(db, result.data.id)
    expect(finalizeResult.success).toBe(false)
  })

  it('13. getDraft returnerar null för obefintlig faktura', () => {
    const result = getDraft(db, 99999)
    expect(result).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════
// Update-sent (2 tester)
// ═══════════════════════════════════════════════════════════
describe('Update sent invoice', () => {
  it('14. Uppdatera anteckningar på bokförd faktura → success', () => {
    const seed = seedAll(db)
    const draft = createTestDraft(db, seed)
    finalizeDraft(db, draft.id)

    const result = updateSentInvoice(db, {
      id: draft.id,
      notes: 'Teständring',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.notes).toBe('Teständring')
    }
  })

  it('15. Kan inte updateSent på draft → error', () => {
    const seed = seedAll(db)
    const draft = createTestDraft(db, seed)

    const result = updateSentInvoice(db, {
      id: draft.id,
      notes: 'Test',
    })
    expect(result.success).toBe(false)
  })
})
