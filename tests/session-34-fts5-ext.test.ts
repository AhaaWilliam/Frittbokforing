/**
 * Session 34 — FTS5 invoice/expense-utvidgning (B9)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import {
  rebuildSearchIndex,
  globalSearch,
} from '../src/main/services/search-service'
import { createCompany } from '../src/main/services/company-service'
import {
  createCounterparty,
  updateCounterparty,
} from '../src/main/services/counterparty-service'
import {
  saveDraft,
  finalizeDraft,
  payInvoice,
} from '../src/main/services/invoice-service'
import {
  saveExpenseDraft,
  finalizeExpense,
} from '../src/main/services/expense-service'
import type { IpcResult } from '../src/shared/types'
import type { GlobalSearchResponse } from '../src/shared/search-types'

function getData(
  result: IpcResult<GlobalSearchResponse>,
): GlobalSearchResponse {
  if (!result.success) throw new Error('Expected success: ' + result.error)
  return result.data
}

let db: Database.Database
let fyId: number
let vatCodeId: number
let inVatCodeId: number

function seedBase() {
  createCompany(db, {
    name: 'Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 2_500_000,
    registration_date: '2026-01-15',
    fiscal_year_start: '2026-01-01',
    fiscal_year_end: '2026-12-31',
  })
  fyId = (
    db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  ).id
  vatCodeId = (
    db.prepare("SELECT id FROM vat_codes WHERE code = 'MP1' LIMIT 1").get() as {
      id: number
    }
  ).id
  inVatCodeId = (
    db.prepare("SELECT id FROM vat_codes WHERE code = 'IP1' LIMIT 1").get() as {
      id: number
    }
  ).id
}

function createCustomer(name: string): number {
  const r = createCounterparty(db, { name, type: 'customer' })
  if (!r.success) throw new Error(r.error)
  return r.data.id
}

function createSupplier(name: string): number {
  const r = createCounterparty(db, { name, type: 'supplier' })
  if (!r.success) throw new Error(r.error)
  return r.data.id
}

function createAndFinalizeInvoice(customerId: number, date: string) {
  const draft = saveDraft(db, {
    counterparty_id: customerId,
    fiscal_year_id: fyId,
    invoice_date: date,
    due_date: '2026-04-30',
    lines: [
      {
        product_id: null,
        description: 'Tjänst',
        quantity: 1,
        unit_price_ore: 10000,
        vat_code_id: vatCodeId,
        sort_order: 0,
        account_number: '3002',
      },
    ],
  })
  if (!draft.success) throw new Error('saveDraft: ' + draft.error)
  const fin = finalizeDraft(db, draft.data.id)
  if (!fin.success) throw new Error('finalizeDraft: ' + fin.error)
  return draft.data.id
}

function createAndFinalizeExpense(supplierId: number, date: string) {
  const draft = saveExpenseDraft(db, {
    fiscal_year_id: fyId,
    counterparty_id: supplierId,
    expense_date: date,
    due_date: '2026-04-30',
    description: 'Testkostnad',
    lines: [
      {
        description: 'Material',
        account_number: '6110',
        quantity: 1,
        unit_price_ore: 10000,
        vat_code_id: inVatCodeId,
      },
    ],
  })
  if (!draft.success) throw new Error('saveExpenseDraft: ' + draft.error)
  const fin = finalizeExpense(db, draft.data.id)
  if (!fin.success) throw new Error('finalizeExpense: ' + fin.error)
  return draft.data.id
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-15T10:00:00'))
  db = createTestDb()
  seedBase()
})

afterEach(() => {
  db.close()
  vi.useRealTimers()
})

describe('FTS5: invoice-sökning', () => {
  it('faktura sökbar via invoice_number efter finalize', () => {
    const custId = createCustomer('Kund FTS InvNum')
    // Create enough invoices to get a 2+ digit number
    for (let i = 0; i < 10; i++) {
      createAndFinalizeInvoice(custId, '2026-03-15')
    }

    const inv = db
      .prepare(
        "SELECT invoice_number FROM invoices WHERE status != 'draft' ORDER BY id DESC LIMIT 1",
      )
      .get() as { invoice_number: string }
    // invoice_number should be "10" (2 chars, passes min-length check)
    expect(inv.invoice_number.length).toBeGreaterThanOrEqual(2)

    const data = getData(
      globalSearch(db, { query: inv.invoice_number, fiscal_year_id: fyId }),
    )
    expect(
      data.results.filter((r) => r.type === 'invoice').length,
    ).toBeGreaterThan(0)
  })

  it('faktura sökbar via counterparty-namn', () => {
    const custId = createCustomer('UniqueSearchCo')
    createAndFinalizeInvoice(custId, '2026-03-15')

    const data = getData(
      globalSearch(db, { query: 'UniqueSearchCo', fiscal_year_id: fyId }),
    )
    expect(
      data.results.filter((r) => r.type === 'invoice').length,
    ).toBeGreaterThan(0)
  })

  it('draft-fakturor exkluderade från FTS5-index', () => {
    const custId = createCustomer('DraftExclCo')
    saveDraft(db, {
      counterparty_id: custId,
      fiscal_year_id: fyId,
      invoice_date: '2026-03-15',
      due_date: '2026-04-14',
      lines: [
        {
          product_id: null,
          description: 'Draft test',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: vatCodeId,
          sort_order: 0,
          account_number: '3002',
        },
      ],
    })
    rebuildSearchIndex(db)

    const data = getData(
      globalSearch(db, { query: 'DraftExclCo', fiscal_year_id: fyId }),
    )
    expect(data.results.filter((r) => r.type === 'invoice')).toHaveLength(0)
  })

  it('ny finaliserad faktura sökbar direkt (rebuild efter finalize)', () => {
    const custId = createCustomer('PostFinalizeCo')
    createAndFinalizeInvoice(custId, '2026-03-15')

    const data = getData(
      globalSearch(db, { query: 'PostFinalizeCo', fiscal_year_id: fyId }),
    )
    expect(
      data.results.filter((r) => r.type === 'invoice').length,
    ).toBeGreaterThan(0)
  })
})

describe('FTS5: expense-sökning', () => {
  it('expense sökbar via description', () => {
    const suppId = createSupplier('Leverantör A')
    createAndFinalizeExpense(suppId, '2026-03-15')

    const data = getData(
      globalSearch(db, { query: 'Testkostnad', fiscal_year_id: fyId }),
    )
    expect(
      data.results.filter((r) => r.type === 'expense').length,
    ).toBeGreaterThan(0)
  })

  it('expense sökbar via counterparty-namn', () => {
    const suppId = createSupplier('UniqueSupplierCo')
    createAndFinalizeExpense(suppId, '2026-03-15')

    const data = getData(
      globalSearch(db, { query: 'UniqueSupplierCo', fiscal_year_id: fyId }),
    )
    expect(
      data.results.filter((r) => r.type === 'expense').length,
    ).toBeGreaterThan(0)
  })

  it('draft-expenses exkluderade', () => {
    const suppId = createSupplier('DraftExpenseCo')
    saveExpenseDraft(db, {
      fiscal_year_id: fyId,
      counterparty_id: suppId,
      expense_date: '2026-03-15',
      due_date: '2026-04-14',
      description: 'Draft expense',
      lines: [
        {
          description: 'Test',
          account_number: '6110',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: inVatCodeId,
        },
      ],
    })
    rebuildSearchIndex(db)

    const data = getData(
      globalSearch(db, { query: 'DraftExpenseCo', fiscal_year_id: fyId }),
    )
    expect(data.results.filter((r) => r.type === 'expense')).toHaveLength(0)
  })
})

describe('FTS5: betalning + namnändring', () => {
  it('betalning → fortfarande sökbar efter rebuild', () => {
    const custId = createCustomer('PayTestCo')
    const invoiceId = createAndFinalizeInvoice(custId, '2026-03-15')

    const inv = db
      .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
      .get(invoiceId) as { total_amount_ore: number }
    payInvoice(db, {
      invoice_id: invoiceId,
      amount_ore: inv.total_amount_ore,
      payment_date: '2026-03-20',
      payment_method: 'bank',
      account_number: '1930',
    })

    const data = getData(
      globalSearch(db, { query: 'PayTestCo', fiscal_year_id: fyId }),
    )
    expect(
      data.results.filter((r) => r.type === 'invoice').length,
    ).toBeGreaterThan(0)
  })

  it('counterparty-namnändring → faktura sökbar via nytt namn', () => {
    const custId = createCustomer('OldNameCo')
    createAndFinalizeInvoice(custId, '2026-03-15')

    updateCounterparty(db, { id: custId, name: 'NewNameCo' })
    // Ensure rebuild ran (updateCounterparty calls it, but verify)
    rebuildSearchIndex(db)

    const data = getData(
      globalSearch(db, { query: 'NewNameCo', fiscal_year_id: fyId }),
    )
    expect(
      data.results.filter((r) => r.type === 'invoice').length,
    ).toBeGreaterThan(0)
  })
})

describe('FTS5: LIKE fallback', () => {
  it('invoice-sök fungerar utan search_index-tabell', () => {
    const custId = createCustomer('FallbackCo')
    createAndFinalizeInvoice(custId, '2026-03-15')

    db.exec('DROP TABLE IF EXISTS search_index')

    const data = getData(
      globalSearch(db, { query: 'FallbackCo', fiscal_year_id: fyId }),
    )
    expect(
      data.results.filter((r) => r.type === 'invoice').length,
    ).toBeGreaterThan(0)
  })
})
