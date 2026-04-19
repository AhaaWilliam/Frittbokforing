/**
 * Sprint 33 B6 — FTS5 indexed search.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import {
  rebuildSearchIndex,
  globalSearch,
} from '../src/main/services/search-service'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import { escapeFtsQuery } from '../src/shared/escape-fts'
import type { GlobalSearchResponse } from '../src/shared/search-types'
import type { IpcResult } from '../src/shared/types'

function getData(
  result: IpcResult<GlobalSearchResponse>,
): GlobalSearchResponse {
  if (!result.success) throw new Error('Expected success: ' + result.error)
  return result.data
}

let db: Database.Database
let fyId: number

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
  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  fyId = fy.id
}

beforeEach(() => {
  db = createTestDb()
  seedBase()
})
afterEach(() => {
  db.close()
})

describe('FTS5 migration', () => {
  it('search_index table exists', () => {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='search_index'",
      )
      .get() as { name: string } | undefined
    expect(row).toBeDefined()
    expect(row?.name).toBe('search_index')
  })
})

describe('rebuildSearchIndex', () => {
  it('counterparty searchable after rebuild', () => {
    createCounterparty(db, {
      company_id: 1,
      name: 'Östgöta Bygg AB',
      type: 'customer',
    })
    rebuildSearchIndex(db)
    const count = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM search_index WHERE entity_type = 'counterparty'",
      )
      .get() as { cnt: number }
    expect(count.cnt).toBeGreaterThanOrEqual(1)
  })

  it('product searchable after rebuild', () => {
    createProduct(db, {
      company_id: 1,
      name: 'Konsulttimme',
      unit: 'timme',
      default_price_ore: 100000,
      vat_code_id: 1,
      account_id: 1,
      article_type: 'service',
    })
    rebuildSearchIndex(db)
    const count = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM search_index WHERE entity_type = 'product'",
      )
      .get() as { cnt: number }
    expect(count.cnt).toBeGreaterThanOrEqual(1)
  })

  it('account searchable after rebuild', () => {
    rebuildSearchIndex(db)
    const count = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM search_index WHERE entity_type = 'account'",
      )
      .get() as { cnt: number }
    expect(count.cnt).toBeGreaterThan(0)
  })

  it('inactive counterparties excluded', () => {
    const cp = createCounterparty(db, {
      company_id: 1,
      name: 'Inaktiv AB',
      type: 'customer',
    })
    if (!cp.success) throw new Error('CP failed')
    db.prepare('UPDATE counterparties SET is_active = 0 WHERE id = ?').run(
      cp.data.id,
    )
    rebuildSearchIndex(db)
    const match = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM search_index WHERE search_text LIKE '%Inaktiv AB%'",
      )
      .get() as { cnt: number }
    expect(match.cnt).toBe(0)
  })
})

describe('FTS5 accent-stripping', () => {
  it('"ostgota" matches "Östgöta Bygg AB"', () => {
    createCounterparty(db, {
      company_id: 1,
      name: 'Östgöta Bygg AB',
      type: 'customer',
    })
    const result = globalSearch(db, { query: 'ostgota', fiscal_year_id: fyId })
    const customers = getData(result).results.filter(
      (r) => r.type === 'customer',
    )
    expect(customers.some((c) => c.title === 'Östgöta Bygg AB')).toBe(true)
  })

  it('"ake" matches "Åke Andersson"', () => {
    createCounterparty(db, {
      company_id: 1,
      name: 'Åke Andersson',
      type: 'supplier',
    })
    const result = globalSearch(db, { query: 'ake', fiscal_year_id: fyId })
    const suppliers = getData(result).results.filter(
      (r) => r.type === 'supplier',
    )
    expect(suppliers.some((s) => s.title === 'Åke Andersson')).toBe(true)
  })
})

describe('FTS5 case-insensitive', () => {
  it('"acme" matches "ACME AB"', () => {
    createCounterparty(db, { company_id: 1, name: 'ACME AB', type: 'customer' })
    const result = globalSearch(db, { query: 'acme', fiscal_year_id: fyId })
    const customers = getData(result).results.filter(
      (r) => r.type === 'customer',
    )
    expect(customers.some((c) => c.title === 'ACME AB')).toBe(true)
  })
})

describe('FTS5 prefix search', () => {
  it('"östg" matches "Östgöta Bygg AB"', () => {
    createCounterparty(db, {
      company_id: 1,
      name: 'Östgöta Bygg AB',
      type: 'customer',
    })
    const result = globalSearch(db, { query: 'östg', fiscal_year_id: fyId })
    const customers = getData(result).results.filter(
      (r) => r.type === 'customer',
    )
    expect(customers.some((c) => c.title === 'Östgöta Bygg AB')).toBe(true)
  })
})

describe('FTS5 fallback', () => {
  it('globalSearch works without search_index table (LIKE fallback)', () => {
    createCounterparty(db, {
      company_id: 1,
      name: 'FallbackTest AB',
      type: 'customer',
    })
    db.exec('DROP TABLE search_index')
    const result = globalSearch(db, {
      query: 'FallbackTest',
      fiscal_year_id: fyId,
    })
    const customers = getData(result).results.filter(
      (r) => r.type === 'customer',
    )
    expect(customers.some((c) => c.title === 'FallbackTest AB')).toBe(true)
  })
})

describe('FTS5 incremental', () => {
  it('new counterparty searchable immediately after create', () => {
    createCounterparty(db, {
      company_id: 1,
      name: 'Nykund AB',
      type: 'customer',
    })
    // createCounterparty calls rebuildSearchIndex internally
    const result = globalSearch(db, { query: 'Nykund', fiscal_year_id: fyId })
    const customers = getData(result).results.filter(
      (r) => r.type === 'customer',
    )
    expect(customers.some((c) => c.title === 'Nykund AB')).toBe(true)
  })

  it('updated counterparty name reflected in search', () => {
    const cp = createCounterparty(db, {
      company_id: 1,
      name: 'Old Name AB',
      type: 'customer',
    })
    if (!cp.success) throw new Error('CP failed')
    db.prepare('UPDATE counterparties SET name = ? WHERE id = ?').run(
      'New Name AB',
      cp.data.id,
    )
    rebuildSearchIndex(db)
    const result = globalSearch(db, { query: 'New Name', fiscal_year_id: fyId })
    const customers = getData(result).results.filter(
      (r) => r.type === 'customer',
    )
    expect(customers.some((c) => c.title === 'New Name AB')).toBe(true)
  })
})

describe('escapeFtsQuery', () => {
  it('double-quotes escaped', () => {
    expect(escapeFtsQuery('test "hello" world')).toBe('test ""hello"" world')
  })
})

describe('FTS5 MATCH regression', () => {
  it('literal % is not a wildcard (F8)', () => {
    createCounterparty(db, {
      company_id: 1,
      name: 'Rabatt 50% AB',
      type: 'customer',
    })
    createCounterparty(db, {
      company_id: 1,
      name: 'Rabatt 60x AB',
      type: 'customer',
    })
    const result = globalSearch(db, { query: '50%', fiscal_year_id: fyId })
    const customers = getData(result).results.filter(
      (r) => r.type === 'customer',
    )
    // Should find "Rabatt 50% AB" (has "50") but not "Rabatt 60x AB"
    expect(customers.some((c) => c.title === 'Rabatt 50% AB')).toBe(true)
    expect(customers.some((c) => c.title === 'Rabatt 60x AB')).toBe(false)
  })
})
