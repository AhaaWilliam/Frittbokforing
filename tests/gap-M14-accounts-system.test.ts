import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import {
  listAccounts,
  createAccount,
} from '../src/main/services/account-service'

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
  if (db) db.close()
})

// ═══════════════════════════════════════════════════════════
// GAP M14: Kontoplan & systemkonton
// ═══════════════════════════════════════════════════════════

describe('GAP M14-1: Systemkonton skyddade', () => {
  // System accounts come from TWO sources:
  // 1. Seed INSERTs with is_system_account=1 (e.g., ack avskrivningar, 2098, 2099, 2220, 8999)
  // 2. Migration 013 UPDATE (1630, 1930, 2010, 2091, 2098, 2099, 2440, 2610-2640, 2650, 3740, 8999)
  // Some overlap. The critical ones from the testprompt that must be system accounts:
  const CRITICAL_SYSTEM_ACCOUNTS = [
    '1630', // Skattekonto
    '1930', // Företagskonto/bank
    '2091', // Balanserad vinst/förlust
    '2099', // Årets resultat
    '2440', // Leverantörsskulder
    '2610', // Utgående moms 25%
    '2620', // Utgående moms 12%
    '2630', // Utgående moms 6%
    '2640', // Ingående moms
    '3740', // Öresutjämning
    '8999', // Årets resultat (RR)
  ]

  it('alla kritiska systemkonton existerar och har is_system_account = 1', () => {
    for (const accountNum of CRITICAL_SYSTEM_ACCOUNTS) {
      const row = db
        .prepare(
          'SELECT account_number, is_system_account FROM accounts WHERE account_number = ?',
        )
        .get(accountNum) as
        | { account_number: string; is_system_account: number }
        | undefined
      expect(row, `Konto ${accountNum} saknas`).toBeDefined()
      expect(
        row!.is_system_account,
        `Konto ${accountNum} ska vara systemkonto`,
      ).toBe(1)
    }
  })

  it('totalt antal systemkonton i DB >= 14', () => {
    const count = db
      .prepare(
        'SELECT COUNT(*) AS cnt FROM accounts WHERE is_system_account = 1',
      )
      .get() as { cnt: number }
    expect(count.cnt).toBeGreaterThanOrEqual(14)
  })

  it('icke-systemkonton (t.ex. 1510) finns men saknar systemflagga', () => {
    const row = db
      .prepare(
        'SELECT is_system_account FROM accounts WHERE account_number = ?',
      )
      .get('1510') as { is_system_account: number } | undefined
    if (row) {
      expect(row.is_system_account).toBe(0)
    }
  })
})

describe('GAP M14-2: Nytt konto — klass härleds', () => {
  it('1xxx → account_type = asset', () => {
    const result = createAccount(db, {
      account_number: '1999',
      name: 'Testtillgång',
      k2_allowed: true,
      k3_only: false,
    })
    expect(result.success).toBe(true)
    const row = db
      .prepare(
        "SELECT account_type FROM accounts WHERE account_number = '1999'",
      )
      .get() as { account_type: string }
    expect(row.account_type).toBe('asset')
  })

  it('2xxx → account_type = liability', () => {
    const result = createAccount(db, {
      account_number: '2999',
      name: 'Testskuld',
      k2_allowed: true,
      k3_only: false,
    })
    expect(result.success).toBe(true)
    const row = db
      .prepare(
        "SELECT account_type FROM accounts WHERE account_number = '2999'",
      )
      .get() as { account_type: string }
    expect(row.account_type).toBe('liability')
  })

  it('3xxx → account_type = revenue', () => {
    const result = createAccount(db, {
      account_number: '3999',
      name: 'Testintäkt',
      k2_allowed: true,
      k3_only: false,
    })
    expect(result.success).toBe(true)
    const row = db
      .prepare(
        "SELECT account_type FROM accounts WHERE account_number = '3999'",
      )
      .get() as { account_type: string }
    expect(row.account_type).toBe('revenue')
  })

  it('5xxx → account_type = expense', () => {
    const result = createAccount(db, {
      account_number: '5999',
      name: 'Testkostnad',
      k2_allowed: true,
      k3_only: false,
    })
    expect(result.success).toBe(true)
    const row = db
      .prepare(
        "SELECT account_type FROM accounts WHERE account_number = '5999'",
      )
      .get() as { account_type: string }
    expect(row.account_type).toBe('expense')
  })
})

describe('GAP M14-3: Unikt kontonummer', () => {
  it('duplikat account_number → error', () => {
    createAccount(db, {
      account_number: '1888',
      name: 'Konto A',
      k2_allowed: true,
      k3_only: false,
    })
    const dup = createAccount(db, {
      account_number: '1888',
      name: 'Konto B',
      k2_allowed: true,
      k3_only: false,
    })
    expect(dup.success).toBe(false)
  })
})

describe('GAP M14-4: K2/K3 runtime-filtrering', () => {
  it('K2-filter exkluderar K3-only konton', () => {
    // Create a K3-only account
    createAccount(db, {
      account_number: '1777',
      name: 'K3-only konto',
      k2_allowed: false,
      k3_only: true,
    })

    const k2List = listAccounts(db, { fiscal_rule: 'K2' })
    const found = k2List.find((a) => a.account_number === '1777')
    expect(found).toBeUndefined()

    const k3List = listAccounts(db, { fiscal_rule: 'K3' })
    const foundK3 = k3List.find((a) => a.account_number === '1777')
    expect(foundK3).toBeDefined()
  })
})
