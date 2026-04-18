/**
 * Sprint 15 S46: M100-normalisering + dublettdetektion
 *
 * Testar:
 * - Strukturerade felkoder (code, error, field?) från alla services
 * - UNIQUE constraint-mappning via error-helpers.ts
 * - Nya ErrorCodes: UNBALANCED_ENTRY, STALE_DATA, DUPLICATE_FISCAL_YEAR
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import {
  saveManualEntryDraft,
  updateManualEntryDraft,
  finalizeManualEntry,
} from '../src/main/services/manual-entry-service'
import { createNewFiscalYear } from '../src/main/services/fiscal-service'
import { createAccount } from '../src/main/services/account-service'
import {
  mapUniqueConstraintError,
  COUNTERPARTY_UNIQUE_MAPPINGS,
  COMPANY_UNIQUE_MAPPINGS,
  ACCOUNT_UNIQUE_MAPPINGS,
  EXPENSE_UNIQUE_MAPPINGS,
} from '../src/main/services/error-helpers'

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

function seedCompanyAndFY() {
  createCompany(db, VALID_COMPANY)
  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  const company = db.prepare('SELECT id FROM companies LIMIT 1').get() as {
    id: number
  }
  return { fiscalYearId: fy.id, companyId: company.id }
}

beforeEach(() => {
  db = createTestDb()
})
afterEach(() => {
  db.close()
})

// ═══════════════════════════════════════════════════════════
// error-helpers.ts — mapUniqueConstraintError
// ═══════════════════════════════════════════════════════════

describe('mapUniqueConstraintError', () => {
  it('maps SQLITE_CONSTRAINT_UNIQUE with matching message', () => {
    const err = {
      code: 'SQLITE_CONSTRAINT_UNIQUE',
      message: 'UNIQUE constraint failed: counterparties.org_number',
    }
    const result = mapUniqueConstraintError(err, COUNTERPARTY_UNIQUE_MAPPINGS)
    expect(result).toEqual({
      code: 'DUPLICATE_ORG_NUMBER',
      field: 'org_number',
      error: 'En motpart med detta organisationsnummer finns redan.',
    })
  })

  it('maps SQLITE_CONSTRAINT_PRIMARYKEY', () => {
    const err = {
      code: 'SQLITE_CONSTRAINT_PRIMARYKEY',
      message: 'UNIQUE constraint failed: accounts.account_number',
    }
    const result = mapUniqueConstraintError(err, ACCOUNT_UNIQUE_MAPPINGS)
    expect(result).toEqual({
      code: 'DUPLICATE_ACCOUNT',
      field: 'account_number',
      error: 'Ett konto med detta kontonummer finns redan.',
    })
  })

  it('returns null for non-matching message', () => {
    const err = {
      code: 'SQLITE_CONSTRAINT_UNIQUE',
      message: 'UNIQUE constraint failed: some_other_table.some_column',
    }
    const result = mapUniqueConstraintError(err, COUNTERPARTY_UNIQUE_MAPPINGS)
    expect(result).toBeNull()
  })

  it('returns null for non-UNIQUE errors', () => {
    const err = { code: 'SQLITE_CONSTRAINT_FOREIGNKEY', message: 'FK failed' }
    const result = mapUniqueConstraintError(err, COUNTERPARTY_UNIQUE_MAPPINGS)
    expect(result).toBeNull()
  })

  it('returns null for non-object errors', () => {
    expect(
      mapUniqueConstraintError(null, COUNTERPARTY_UNIQUE_MAPPINGS),
    ).toBeNull()
    expect(
      mapUniqueConstraintError('string error', COUNTERPARTY_UNIQUE_MAPPINGS),
    ).toBeNull()
    expect(
      mapUniqueConstraintError(undefined, COUNTERPARTY_UNIQUE_MAPPINGS),
    ).toBeNull()
  })

  it('maps compound constraint (expense supplier_invoice_number)', () => {
    const err = {
      code: 'SQLITE_CONSTRAINT_UNIQUE',
      message:
        'UNIQUE constraint failed: expenses.counterparty_id, expenses.supplier_invoice_number',
    }
    const result = mapUniqueConstraintError(err, EXPENSE_UNIQUE_MAPPINGS)
    expect(result).toEqual({
      code: 'DUPLICATE_SUPPLIER_INVOICE',
      field: 'supplier_invoice_number',
      error: expect.stringContaining('leverantörsfakturanummer'),
    })
  })

  it('maps company org_number constraint', () => {
    const err = {
      code: 'SQLITE_CONSTRAINT_UNIQUE',
      message: 'UNIQUE constraint failed: companies.org_number',
    }
    const result = mapUniqueConstraintError(err, COMPANY_UNIQUE_MAPPINGS)
    expect(result).toEqual({
      code: 'DUPLICATE_ORG_NUMBER',
      field: 'org_number',
      error: expect.stringContaining('organisationsnummer'),
    })
  })
})

// ═══════════════════════════════════════════════════════════
// manual-entry-service — structured errors
// ═══════════════════════════════════════════════════════════

describe('manual-entry-service structured errors', () => {
  let fiscalYearId: number

  beforeEach(() => {
    const ctx = seedCompanyAndFY()
    fiscalYearId = ctx.fiscalYearId
  })

  it('updateManualEntryDraft returns MANUAL_ENTRY_NOT_FOUND for missing entry', () => {
    const result = updateManualEntryDraft(db, {
      id: 99999,
      lines: [{ account_number: '1930', debit_ore: 100, credit_ore: 0 }],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('MANUAL_ENTRY_NOT_FOUND')
    }
  })

  it('updateManualEntryDraft returns ALREADY_FINALIZED for finalized entry', () => {
    // Create and finalize
    const draft = saveManualEntryDraft(db, {
      fiscal_year_id: fiscalYearId,
      entry_date: '2025-06-15',
      description: 'Test',
      lines: [
        { account_number: '1930', debit_ore: 10000, credit_ore: 0 },
        { account_number: '2081', debit_ore: 0, credit_ore: 10000 },
      ],
    })
    expect(draft.success).toBe(true)
    if (!draft.success) return
    const finalized = finalizeManualEntry(db, draft.data.id, fiscalYearId)
    expect(finalized.success).toBe(true)

    // Try to update finalized entry
    const result = updateManualEntryDraft(db, {
      id: draft.data.id,
      lines: [{ account_number: '1930', debit_ore: 200, credit_ore: 0 }],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('ALREADY_FINALIZED')
    }
  })

  it('finalizeManualEntry returns VALIDATION_ERROR for missing date', () => {
    const draft = saveManualEntryDraft(db, {
      fiscal_year_id: fiscalYearId,
      // No entry_date
      lines: [
        { account_number: '1930', debit_ore: 10000, credit_ore: 0 },
        { account_number: '2081', debit_ore: 0, credit_ore: 10000 },
      ],
    })
    expect(draft.success).toBe(true)
    if (!draft.success) return

    const result = finalizeManualEntry(db, draft.data.id, fiscalYearId)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.field).toBe('entry_date')
    }
  })

  it('finalizeManualEntry returns UNBALANCED_ENTRY for unbalanced lines', () => {
    const draft = saveManualEntryDraft(db, {
      fiscal_year_id: fiscalYearId,
      entry_date: '2025-06-15',
      lines: [
        { account_number: '1930', debit_ore: 10000, credit_ore: 0 },
        { account_number: '2081', debit_ore: 0, credit_ore: 5000 }, // Unbalanced!
      ],
    })
    expect(draft.success).toBe(true)
    if (!draft.success) return

    const result = finalizeManualEntry(db, draft.data.id, fiscalYearId)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('UNBALANCED_ENTRY')
    }
  })

  it('finalizeManualEntry returns YEAR_IS_CLOSED for closed fiscal year', () => {
    // Close the fiscal year
    db.prepare('UPDATE fiscal_years SET is_closed = 1 WHERE id = ?').run(
      fiscalYearId,
    )

    const draft = saveManualEntryDraft(db, {
      fiscal_year_id: fiscalYearId,
      entry_date: '2025-06-15',
      lines: [
        { account_number: '1930', debit_ore: 10000, credit_ore: 0 },
        { account_number: '2081', debit_ore: 0, credit_ore: 10000 },
      ],
    })
    expect(draft.success).toBe(true)
    if (!draft.success) return

    const result = finalizeManualEntry(db, draft.data.id, fiscalYearId)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('YEAR_IS_CLOSED')
    }
  })

  // ACCOUNT_NOT_FOUND code path in finalizeManualEntry is defense-in-depth:
  // FK on manual_entry_lines.account_number (M23/migration 023) prevents storing
  // invalid account numbers at the DB level, making this unreachable via normal flow.
})

// ═══════════════════════════════════════════════════════════
// fiscal-service — structured errors (new codes)
// ═══════════════════════════════════════════════════════════

describe('fiscal-service structured errors', () => {
  it('DUPLICATE_FISCAL_YEAR when creating duplicate', () => {
    const ctx = seedCompanyAndFY()
    // Pre-create conflicting FY
    db.prepare(
      `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
       VALUES (?, '2026', '2026-01-01', '2026-12-31')`,
    ).run(ctx.companyId)

    let thrown: unknown = null
    try {
      createNewFiscalYear(db, ctx.companyId, ctx.fiscalYearId)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeTruthy()
    expect((thrown as { code: string }).code).toBe('DUPLICATE_FISCAL_YEAR')
  })

  it('STALE_DATA when netResultOre does not match actual', () => {
    const ctx = seedCompanyAndFY()
    // Seed a booked entry to create a non-zero result using manual entry flow
    const draft = saveManualEntryDraft(db, {
      fiscal_year_id: ctx.fiscalYearId,
      entry_date: '2025-06-15',
      description: 'Revenue test',
      lines: [
        { account_number: '1510', debit_ore: 1000000, credit_ore: 0 },
        { account_number: '3001', debit_ore: 0, credit_ore: 1000000 },
      ],
    })
    expect(draft.success).toBe(true)
    if (!draft.success) return
    const finalized = finalizeManualEntry(db, draft.data.id, ctx.fiscalYearId)
    expect(finalized.success).toBe(true)

    let thrown: unknown = null
    try {
      createNewFiscalYear(db, ctx.companyId, ctx.fiscalYearId, {
        confirmBookResult: true,
        netResultOre: 99999, // Wrong!
      })
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeTruthy()
    expect((thrown as { code: string }).code).toBe('STALE_DATA')
  })
})

// ═══════════════════════════════════════════════════════════
// counterparty-service — UNIQUE constraint mapping
// ═══════════════════════════════════════════════════════════

describe('counterparty-service DUPLICATE_ORG_NUMBER', () => {
  it('returns DUPLICATE_ORG_NUMBER on duplicate org_number', () => {
    seedCompanyAndFY()
    const r1 = createCounterparty(db, {
      name: 'Kund A',
      type: 'customer',
      org_number: '556036-0793',
    })
    expect(r1.success).toBe(true)

    const r2 = createCounterparty(db, {
      name: 'Kund B',
      type: 'customer',
      org_number: '556036-0793',
    })
    expect(r2.success).toBe(false)
    if (!r2.success) {
      expect(r2.code).toBe('DUPLICATE_ORG_NUMBER')
      expect(r2.field).toBe('org_number')
    }
  })
})

// ═══════════════════════════════════════════════════════════
// account-service — UNIQUE constraint mapping
// ═══════════════════════════════════════════════════════════

describe('account-service DUPLICATE_ACCOUNT', () => {
  it('returns DUPLICATE_ACCOUNT on duplicate account_number', () => {
    seedCompanyAndFY()
    const r1 = createAccount(db, {
      account_number: '9990',
      name: 'Test 1',
      k2_allowed: true,
      k3_only: false,
    })
    expect(r1.success).toBe(true)

    const r2 = createAccount(db, {
      account_number: '9990',
      name: 'Test 2',
      k2_allowed: true,
      k3_only: false,
    })
    expect(r2.success).toBe(false)
    if (!r2.success) {
      expect(r2.code).toBe('DUPLICATE_ACCOUNT')
    }
  })
})

// ═══════════════════════════════════════════════════════════
// company-service — UNIQUE constraint mapping
// ═══════════════════════════════════════════════════════════

describe('company-service DUPLICATE_ORG_NUMBER', () => {
  it('returns DUPLICATE_ORG_NUMBER on duplicate company org_number', () => {
    createCompany(db, VALID_COMPANY)
    const r2 = createCompany(db, {
      ...VALID_COMPANY,
      name: 'Annat AB',
      fiscal_year_start: '2026-01-01',
      fiscal_year_end: '2026-12-31',
    })
    expect(r2.success).toBe(false)
    if (!r2.success) {
      expect(r2.code).toBe('DUPLICATE_ORG_NUMBER')
      expect(r2.field).toBe('org_number')
    }
  })
})
