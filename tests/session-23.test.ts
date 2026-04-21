import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import {
  listAllAccounts,
  createAccount,
  updateAccount,
  toggleAccountActive,
  validateAccountsActive,
} from '../src/main/services/account-service'
import { finalizeExpense } from '../src/main/services/expense-service'
import { finalizeManualEntry } from '../src/main/services/manual-entry-service'

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

function seedCompany(testDb: Database.Database) {
  createCompany(testDb, VALID_COMPANY)
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  return { fiscalYearId: fy.id }
}

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  db.close()
})

// === Migration 013 ===

describe('Migration 013: system accounts', () => {
  it('is_active column exists and defaults to 1', () => {
    const account = db
      .prepare("SELECT is_active FROM accounts WHERE account_number = '1510'")
      .get() as { is_active: number }
    expect(account.is_active).toBe(1)
  })

  it('is_system_account column exists and defaults to 0 for non-system', () => {
    const account = db
      .prepare(
        "SELECT is_system_account FROM accounts WHERE account_number = '1510'",
      )
      .get() as { is_system_account: number }
    expect(account.is_system_account).toBe(0)
  })

  it('system accounts have is_system_account = 1 (2099, 8999, 2610)', () => {
    const accounts = db
      .prepare(
        "SELECT account_number, is_system_account FROM accounts WHERE account_number IN ('2099', '8999', '2610')",
      )
      .all() as { account_number: string; is_system_account: number }[]
    expect(accounts.length).toBe(3)
    for (const a of accounts) {
      expect(a.is_system_account).toBe(1)
    }
  })

  it('PRAGMA user_version is 14', () => {
    const version = db.pragma('user_version', { simple: true }) as number
    expect(version).toBe(51)
  })
})

// === account:create ===

describe('createAccount', () => {
  it('creates account with valid 4-digit number', () => {
    const result = createAccount(db, {
      account_number: '1234',
      name: 'Testkonto',
      k2_allowed: true,
      k3_only: false,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.account_number).toBe('1234')
    }
  })

  it('creates account with 5–6-digit number', () => {
    const r5 = createAccount(db, {
      account_number: '12345',
      name: 'Test 5',
      k2_allowed: true,
      k3_only: false,
    })
    expect(r5.success).toBe(true)

    const r6 = createAccount(db, {
      account_number: '123456',
      name: 'Test 6',
      k2_allowed: true,
      k3_only: false,
    })
    expect(r6.success).toBe(true)
  })

  it('rejects duplicate account number', () => {
    createAccount(db, {
      account_number: '9001',
      name: 'First',
      k2_allowed: true,
      k3_only: false,
    })
    const result = createAccount(db, {
      account_number: '9001',
      name: 'Duplicate',
      k2_allowed: true,
      k3_only: false,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('DUPLICATE_ACCOUNT')
    }
  })

  it('rejects invalid numbers (3 digits, 7 digits, letters)', () => {
    const r3 = createAccount(db, {
      account_number: '123',
      name: 'Too short',
      k2_allowed: true,
      k3_only: false,
    })
    expect(r3.success).toBe(false)

    const r7 = createAccount(db, {
      account_number: '1234567',
      name: 'Too long',
      k2_allowed: true,
      k3_only: false,
    })
    expect(r7.success).toBe(false)

    const rLetters = createAccount(db, {
      account_number: 'abcd',
      name: 'Letters',
      k2_allowed: true,
      k3_only: false,
    })
    expect(rLetters.success).toBe(false)
  })

  it('derives account class correctly from first digit', () => {
    createAccount(db, {
      account_number: '9001',
      name: 'Klass 9',
      k2_allowed: true,
      k3_only: false,
    })
    const acct = db
      .prepare(
        "SELECT account_type FROM accounts WHERE account_number = '9001'",
      )
      .get() as { account_type: string }
    expect(acct.account_type).toBe('expense')
  })
})

// === account:update ===

describe('updateAccount', () => {
  it('updates name', () => {
    createAccount(db, {
      account_number: '9002',
      name: 'Original',
      k2_allowed: true,
      k3_only: false,
    })
    const result = updateAccount(db, {
      account_number: '9002',
      name: 'Updated',
      k2_allowed: true,
      k3_only: false,
    })
    expect(result.success).toBe(true)
    const acct = db
      .prepare("SELECT name FROM accounts WHERE account_number = '9002'")
      .get() as { name: string }
    expect(acct.name).toBe('Updated')
  })

  it('updates K2/K3 flags', () => {
    createAccount(db, {
      account_number: '9003',
      name: 'Test',
      k2_allowed: true,
      k3_only: false,
    })
    const result = updateAccount(db, {
      account_number: '9003',
      name: 'Test',
      k2_allowed: false,
      k3_only: true,
    })
    expect(result.success).toBe(true)
    const acct = db
      .prepare(
        "SELECT k2_allowed, k3_only FROM accounts WHERE account_number = '9003'",
      )
      .get() as { k2_allowed: number; k3_only: number }
    expect(acct.k2_allowed).toBe(0)
    expect(acct.k3_only).toBe(1)
  })

  it('returns error for non-existent account', () => {
    const result = updateAccount(db, {
      account_number: '9999',
      name: 'Ghost',
      k2_allowed: true,
      k3_only: false,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('ACCOUNT_NOT_FOUND')
    }
  })
})

// === account:toggle-active ===

describe('toggleAccountActive', () => {
  it('deactivates account without JE rows', () => {
    createAccount(db, {
      account_number: '9010',
      name: 'NoEntries',
      k2_allowed: true,
      k3_only: false,
    })
    const result = toggleAccountActive(db, {
      account_number: '9010',
      is_active: false,
    })
    expect(result.success).toBe(true)
    const acct = db
      .prepare("SELECT is_active FROM accounts WHERE account_number = '9010'")
      .get() as { is_active: number }
    expect(acct.is_active).toBe(0)
  })

  it('rejects deactivation of account with JE rows', () => {
    seedCompany(db)
    // Insert JE as draft first so trigger allows adding lines
    const jeResult = db
      .prepare(
        `INSERT INTO journal_entries (company_id, fiscal_year_id, verification_series, journal_date, description, status, source_type)
         VALUES (1, 1, 'C', '2025-06-15', 'Test', 'draft', 'manual')`,
      )
      .run()
    const jeId = Number(jeResult.lastInsertRowid)
    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
       VALUES (?, 1, '1510', 10000, 0, 'Debet')`,
    ).run(jeId)
    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
       VALUES (?, 2, '1930', 0, 10000, 'Kredit')`,
    ).run(jeId)
    // Book it
    db.prepare("UPDATE journal_entries SET status = 'booked' WHERE id = ?").run(
      jeId,
    )

    const result = toggleAccountActive(db, {
      account_number: '1510',
      is_active: false,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('ACCOUNT_HAS_ENTRIES')
    }
  })

  it('rejects deactivation of system account', () => {
    const result = toggleAccountActive(db, {
      account_number: '2099',
      is_active: false,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('SYSTEM_ACCOUNT')
    }
  })

  it('activates inactive account', () => {
    createAccount(db, {
      account_number: '9011',
      name: 'Deactivated',
      k2_allowed: true,
      k3_only: false,
    })
    toggleAccountActive(db, { account_number: '9011', is_active: false })
    const result = toggleAccountActive(db, {
      account_number: '9011',
      is_active: true,
    })
    expect(result.success).toBe(true)
    const acct = db
      .prepare("SELECT is_active FROM accounts WHERE account_number = '9011'")
      .get() as { is_active: number }
    expect(acct.is_active).toBe(1)
  })
})

// === account:list filter ===

describe('listAccounts filter', () => {
  beforeEach(() => {
    createAccount(db, {
      account_number: '9020',
      name: 'Active',
      k2_allowed: true,
      k3_only: false,
    })
    createAccount(db, {
      account_number: '9021',
      name: 'Inactive',
      k2_allowed: true,
      k3_only: false,
    })
    toggleAccountActive(db, { account_number: '9021', is_active: false })
  })

  it('is_active: true returns only active', () => {
    const result = listAllAccounts(db, { is_active: true })
    const found = result.find((a) => a.account_number === '9021')
    expect(found).toBeUndefined()
    const active = result.find((a) => a.account_number === '9020')
    expect(active).toBeDefined()
  })

  it('is_active: false returns only inactive', () => {
    const result = listAllAccounts(db, { is_active: false })
    const found = result.find((a) => a.account_number === '9021')
    expect(found).toBeDefined()
    const active = result.find((a) => a.account_number === '9020')
    expect(active).toBeUndefined()
  })

  it('no filter returns all', () => {
    const result = listAllAccounts(db, {})
    const a9020 = result.find((a) => a.account_number === '9020')
    const a9021 = result.find((a) => a.account_number === '9021')
    expect(a9020).toBeDefined()
    expect(a9021).toBeDefined()
  })
})

// === Finaliserings-guards ===

describe('finaliserings-guards', () => {
  it('finalizeManualEntry with inactive account throws error', () => {
    const { fiscalYearId } = seedCompany(db)

    // Create a custom account and deactivate it
    createAccount(db, {
      account_number: '9030',
      name: 'Will deactivate',
      k2_allowed: true,
      k3_only: false,
    })
    toggleAccountActive(db, { account_number: '9030', is_active: false })

    // Create a manual entry draft using the inactive account
    const meResult = db
      .prepare(
        `INSERT INTO manual_entries (fiscal_year_id, entry_date, description, status)
         VALUES (?, '2025-06-15', 'Test inactive', 'draft')`,
      )
      .run(fiscalYearId)
    const meId = Number(meResult.lastInsertRowid)

    db.prepare(
      `INSERT INTO manual_entry_lines (manual_entry_id, line_number, account_number, debit_ore, credit_ore, description)
       VALUES (?, 1, '9030', 10000, 0, 'Debet')`,
    ).run(meId)
    db.prepare(
      `INSERT INTO manual_entry_lines (manual_entry_id, line_number, account_number, debit_ore, credit_ore, description)
       VALUES (?, 2, '1930', 0, 10000, 'Kredit')`,
    ).run(meId)

    const result = finalizeManualEntry(db, meId, fiscalYearId)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('9030')
      expect(result.error).toContain('inaktivt')
    }
  })

  it('finalizeExpense with inactive account throws error', () => {
    const { fiscalYearId } = seedCompany(db)

    // Create supplier
    const cpResult = createCounterparty(db, {
      company_id: 1,
      name: 'Test Supplier',
      type: 'supplier',
    })
    if (!cpResult.success) throw new Error('Counterparty failed')

    // Create account and deactivate it
    createAccount(db, {
      account_number: '9031',
      name: 'Will deactivate expense',
      k2_allowed: true,
      k3_only: false,
    })
    toggleAccountActive(db, { account_number: '9031', is_active: false })

    const vatCode = db
      .prepare("SELECT id FROM vat_codes WHERE vat_type = 'incoming' LIMIT 1")
      .get() as { id: number }

    // Create expense draft
    const expResult = db
      .prepare(
        `INSERT INTO expenses (fiscal_year_id, counterparty_id, expense_date, description, status, payment_terms, total_amount_ore, notes)
         VALUES (?, ?, '2025-06-15', 'Test inactive expense', 'draft', 30, 12500, '')`,
      )
      .run(fiscalYearId, cpResult.data.id)
    const expId = Number(expResult.lastInsertRowid)

    db.prepare(
      `INSERT INTO expense_lines (expense_id, description, account_number, quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore)
       VALUES (?, 'Test', '9031', 1, 10000, ?, 10000, 2500)`,
    ).run(expId, vatCode.id)

    const result = finalizeExpense(db, expId)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('9031')
      expect(result.error).toContain('inaktivt')
    }
  })
})

// === validateAccountsActive ===

describe('validateAccountsActive', () => {
  it('does not throw for empty array', () => {
    expect(() => validateAccountsActive(db, [])).not.toThrow()
  })

  it('does not throw for active accounts', () => {
    expect(() => validateAccountsActive(db, ['1510', '1930'])).not.toThrow()
  })

  // Sprint 11 Fas 4 (F9): validateAccountsActive kastar nu strukturerat objekt, inte plain Error
  it('throws structured INACTIVE_ACCOUNT for inactive account', () => {
    createAccount(db, {
      account_number: '9040',
      name: 'Inactive',
      k2_allowed: true,
      k3_only: false,
    })
    toggleAccountActive(db, { account_number: '9040', is_active: false })
    try {
      validateAccountsActive(db, ['9040'])
      expect.fail('Should have thrown')
    } catch (err) {
      const e = err as { code: string; error: string; field: string }
      expect(e.code).toBe('INACTIVE_ACCOUNT')
      expect(e.error).toContain('inaktivt')
      expect(e.error).toContain('9040')
      expect(e.field).toBe('account_number')
    }
  })
})
