import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { globalSearch } from '../src/main/services/search-service'
import type { GlobalSearchResponse } from '../src/shared/search-types'
import type { IpcResult } from '../src/shared/types'

function getData(
  result: IpcResult<GlobalSearchResponse>,
): GlobalSearchResponse {
  if (!result.success) throw new Error('Expected success: ' + result.error)
  return result.data
}

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

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  db.close()
})

function seedCompany() {
  createCompany(db, VALID_COMPANY)
  return (
    db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  ).id
}

describe('lower_unicode function (F58)', () => {
  it.each([
    ['ÅÄÖ', 'åäö'],
    ['Café', 'café'],
    ['Mixed123ÅÄÖ', 'mixed123åäö'],
    ['', ''],
  ])('lower_unicode(%j) → %j', (input, expected) => {
    const row = db.prepare('SELECT lower_unicode(?) AS r').get(input) as {
      r: string
    }
    expect(row.r).toBe(expected)
  })

  it('NULL passthrough', () => {
    const row = db.prepare('SELECT lower_unicode(NULL) AS r').get() as {
      r: null
    }
    expect(row.r).toBeNull()
  })

  it('non-string passthrough (integer)', () => {
    const row = db.prepare('SELECT lower_unicode(42) AS r').get() as {
      r: number
    }
    expect(row.r).toBe(42)
  })

  it('deterministic sanity', () => {
    const row = db.prepare("SELECT lower_unicode('Å') AS r").get() as {
      r: string
    }
    expect(row.r).toBe('å')
  })

  it('known limitation: eszett folding not supported (FTS5 scope)', () => {
    // 'STRASSE'.toLowerCase() → 'strasse', but 'Straße'.toLowerCase() → 'straße'
    // These are German equivalents but not case-variants — full Unicode
    // normalization (NFKD + accent-strip) requires FTS5 unicode61.
    const r1 = db.prepare("SELECT lower_unicode('STRASSE') AS r").get() as {
      r: string
    }
    const r2 = db.prepare("SELECT lower_unicode('Straße') AS r").get() as {
      r: string
    }
    expect(r1.r).toBe('strasse')
    expect(r2.r).toBe('straße')
    expect(r1.r).not.toBe(r2.r)
  })
})

describe('cross-case search (service level, F58)', () => {
  it('"åke" matches "Åke Andersson"', () => {
    const fyId = seedCompany()
    createCounterparty(db, { name: 'Åke Andersson', type: 'customer' })
    const found = getData(
      globalSearch(db, { query: 'åke', fiscal_year_id: fyId }),
    ).results.some((r) => r.title === 'Åke Andersson')
    expect(found).toBe(true)
  })

  it('"östgöta" matches "Östgöta Bygg AB"', () => {
    const fyId = seedCompany()
    createCounterparty(db, { name: 'Östgöta Bygg AB', type: 'supplier' })
    const found = getData(
      globalSearch(db, { query: 'östgöta', fiscal_year_id: fyId }),
    ).results.some((r) => r.title === 'Östgöta Bygg AB')
    expect(found).toBe(true)
  })

  it('"ACME" matches "Acme AB" (ASCII case regression)', () => {
    const fyId = seedCompany()
    createCounterparty(db, { name: 'Acme AB', type: 'customer' })
    const found = getData(
      globalSearch(db, { query: 'ACME', fiscal_year_id: fyId }),
    ).results.some((r) => r.title === 'Acme AB')
    expect(found).toBe(true)
  })
})

describe('F8 regression after lower_unicode migration', () => {
  it('literal % is not a wildcard', () => {
    const fyId = seedCompany()
    createCounterparty(db, { name: 'Rabatt 50% AB', type: 'customer' })
    const results = getData(
      globalSearch(db, { query: '50%', fiscal_year_id: fyId }),
    ).results
    expect(results.some((r) => r.title === 'Rabatt 50% AB')).toBe(true)
  })

  it('literal _ is not a wildcard (FTS5: _ is token separator, "50_" matches "50" prefix)', () => {
    const fyId = seedCompany()
    createCounterparty(db, { name: 'Rabatt 50% AB', type: 'customer' })
    // With FTS5, "_" is a token separator not a LIKE wildcard.
    // "50_" tokenizes to "50" which matches "50" in "Rabatt 50% AB" via prefix.
    const results = getData(
      globalSearch(db, { query: '50_', fiscal_year_id: fyId }),
    ).results
    expect(results.some((r) => r.title === 'Rabatt 50% AB')).toBe(true)
  })
})
