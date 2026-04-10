import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import {
  createCompany,
  updateCompany,
} from '../src/main/services/company-service'
import {
  createCounterparty,
  updateCounterparty,
} from '../src/main/services/counterparty-service'
import { createAccount } from '../src/main/services/account-service'

let db: Database.Database

function createTestDb(): Database.Database {
  const testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.pragma('foreign_keys = ON')
  for (let i = 0; i < migrations.length; i++) {
    const m = migrations[i]
    testDb.exec('BEGIN EXCLUSIVE')
    testDb.exec(m.sql)
    if (m.programmatic) m.programmatic(testDb)
    testDb.pragma(`user_version = ${i + 1}`)
    testDb.exec('COMMIT')
  }
  return testDb
}

const VALID_COMPANY = {
  name: 'Test AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2025-01-15',
  fiscal_year_start: '2025-01-01',
  fiscal_year_end: '2025-12-31',
}

beforeEach(() => {
  db = createTestDb()
  createCompany(db, VALID_COMPANY)
})

afterEach(() => {
  db.close()
})

// ═══════════════════════════════════════════
// M1 — Klass 8 kontotypmappning
// ═══════════════════════════════════════════
describe('M1: Klass 8 account type mapping', () => {
  it('8050 → revenue (andelar)', () => {
    const result = createAccount(db, {
      account_number: '8050',
      name: 'Andelar',
      k2_allowed: true,
      k3_only: false,
    })
    expect(result.success).toBe(true)
    const row = db
      .prepare('SELECT account_type FROM accounts WHERE account_number = ?')
      .get('8050') as { account_type: string }
    expect(row.account_type).toBe('revenue')
  })

  it('8110 → revenue (ränteintäkter)', () => {
    createAccount(db, {
      account_number: '8110',
      name: 'Ränteintäkter',
      k2_allowed: true,
      k3_only: false,
    })
    const row = db
      .prepare('SELECT account_type FROM accounts WHERE account_number = ?')
      .get('8110') as { account_type: string }
    expect(row.account_type).toBe('revenue')
  })

  it('8310 → revenue (övr. fin. intäkter)', () => {
    createAccount(db, {
      account_number: '8310',
      name: 'Övriga fin intäkter',
      k2_allowed: true,
      k3_only: false,
    })
    const row = db
      .prepare('SELECT account_type FROM accounts WHERE account_number = ?')
      .get('8310') as { account_type: string }
    expect(row.account_type).toBe('revenue')
  })

  it('8410 → expense (fin. kostnader)', () => {
    createAccount(db, {
      account_number: '8410',
      name: 'Räntekostnader',
      k2_allowed: true,
      k3_only: false,
    })
    const row = db
      .prepare('SELECT account_type FROM accounts WHERE account_number = ?')
      .get('8410') as { account_type: string }
    expect(row.account_type).toBe('expense')
  })
})

// ═══════════════════════════════════════════
// M2 — SQL allowlist
// ═══════════════════════════════════════════
describe('M2: SQL allowlist', () => {
  it('updateCompany updates valid field', () => {
    const result = updateCompany(db, {
      email: 'test@example.com',
    })
    expect(result.success).toBe(true)
  })

  it('updateCompany rejects unknown keys via Zod strict', () => {
    const result = updateCompany(db, {
      email: 'test@example.com',
      evil_field: 'hack',
    } as Record<string, unknown>)
    // Zod .strict() rejects unrecognized keys
    expect(result.success).toBe(false)
  })

  it('updateCounterparty updates valid field', () => {
    const cpResult = createCounterparty(db, {
      name: 'Supplier AB',
      type: 'supplier',
      country: 'SE',
      default_payment_terms: 30,
    })
    expect(cpResult.success).toBe(true)
    const cpId = cpResult.data!.id

    const result = updateCounterparty(db, {
      id: cpId,
      name: 'Updated Supplier',
    })
    expect(result.success).toBe(true)
    expect(result.data!.name).toBe('Updated Supplier')
  })
})

// ═══════════════════════════════════════════
// M5 — toOre
// ═══════════════════════════════════════════
describe('M5: toOre without EPSILON', () => {
  // Import dynamically to test the renderer function
  it('toOre(1.005) → 100 (IEEE 754: 1.005*100=100.499...)', async () => {
    const { toOre } = await import('../src/renderer/lib/format')
    // 1.005 cannot be represented exactly in IEEE 754 — it's 1.00499999...
    // Math.round(1.005 * 100) = Math.round(100.4999...) = 100
    expect(toOre(1.005)).toBe(100)
  })

  it('toOre(0.01) → 1', async () => {
    const { toOre } = await import('../src/renderer/lib/format')
    expect(toOre(0.01)).toBe(1)
  })

  it('toOre(-50.5) → -5050', async () => {
    const { toOre } = await import('../src/renderer/lib/format')
    expect(toOre(-50.5)).toBe(-5050)
  })
})
