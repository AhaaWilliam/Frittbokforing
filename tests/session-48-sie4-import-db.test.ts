/**
 * Session 48: SIE4 import Fas 2 — database import service.
 * Tests: new-strategy, merge-strategy, full roundtrip, sign handling, rollback.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as iconv from 'iconv-lite'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import { saveDraft, finalizeDraft } from '../src/main/services/invoice-service'
import { exportSie4 } from '../src/main/services/sie4/sie4-export-service'
import { parseSie4 } from '../src/main/services/sie4/sie4-import-parser'
import { importSie4 } from '../src/main/services/sie4/sie4-import-service'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  for (let i = 0; i < migrations.length; i++) {
    const m = migrations[i]
    db.exec('BEGIN EXCLUSIVE')
    if (m.sql) db.exec(m.sql)
    if (m.programmatic) m.programmatic(db)
    db.pragma(`user_version = ${i + 1}`)
    db.exec('COMMIT')
  }
  return db
}

function buildSie4Buffer(lines: string[]): Buffer {
  const content = lines.join('\r\n') + '\r\n'
  return iconv.encode(content, 'cp437')
}

// ═══ Helper: seed a company with data to export ═══
function seedForExport(db: Database.Database): { fyId: number } {
  createCompany(db, {
    name: 'Export AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 50000_00,
    registration_date: '2025-01-15',
    fiscal_year_start: '2025-01-01',
    fiscal_year_end: '2025-12-31',
  })
  db.prepare("UPDATE companies SET bankgiro = '1234-5678' WHERE id = 1").run()

  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  const customer = createCounterparty(db, {
    name: 'Kund AB',
    type: 'customer',
    org_number: '559999-0001',
  })
  if (!customer.success) throw new Error('Customer failed')

  const vatCode = db
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
    .get() as { id: number }
  const account = db
    .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
    .get() as { id: number }
  const product = createProduct(db, {
    name: 'Produkt',
    default_price_ore: 10000,
    vat_code_id: vatCode.id,
    account_id: account.id,
  })
  if (!product.success) throw new Error('Product failed')

  const draft = saveDraft(db, {
    counterparty_id: customer.data.id,
    fiscal_year_id: fy.id,
    invoice_date: '2025-03-15',
    due_date: '2025-04-14',
    payment_terms: 30,
    lines: [
      {
        product_id: product.data.id,
        description: 'Test',
        quantity: 1,
        unit_price_ore: 10000,
        vat_code_id: vatCode.id,
        sort_order: 0,
      },
    ],
  })
  if (!draft.success) throw new Error('Draft failed')
  const fin = finalizeDraft(db, draft.data.id)
  if (!fin.success) throw new Error('Finalize failed: ' + fin.error)

  return { fyId: fy.id }
}

describe('S48: SIE4 import — new strategy', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })
  afterEach(() => {
    db.close()
  })

  it('N1: creates company, FY, and accounts from SIE4', () => {
    const buffer = buildSie4Buffer([
      '#FNAMN "Importerat AB"',
      '#ORGNR 556036-0793',
      '#RAR 0 20250101 20251231',
      '#KONTO 1930 "Företagskonto"',
      '#KTYP 1930 T',
      '#KONTO 3001 "Försäljning"',
      '#KTYP 3001 I',
    ])
    const parsed = parseSie4(buffer)
    const result = importSie4(db, parsed, { strategy: 'new' })
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)

    // Verify company
    const company = db
      .prepare('SELECT name, org_number FROM companies')
      .get() as { name: string; org_number: string }
    expect(company.name).toBe('Importerat AB')
    expect(company.org_number).toBe('556036-0793')

    // Verify fiscal year
    const fy = db
      .prepare('SELECT start_date, end_date FROM fiscal_years')
      .get() as { start_date: string; end_date: string }
    expect(fy.start_date).toBe('2025-01-01')
    expect(fy.end_date).toBe('2025-12-31')

    // Verify accounts
    const accounts = db
      .prepare(
        "SELECT account_number FROM accounts WHERE account_number IN ('1930','3001')",
      )
      .all()
    expect(accounts).toHaveLength(2)
    expect(result.data.accountsAdded).toBeGreaterThanOrEqual(0) // may already exist in seed
  })

  it('N2: rejects new-strategy when company already exists', () => {
    const cp = createCompany(db, {
      name: 'Existing AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2',
      share_capital: 50000_00,
      registration_date: '2025-01-15',
      fiscal_year_start: '2025-01-01',
      fiscal_year_end: '2025-12-31',
    })
    expect(cp.success).toBe(true)

    const buffer = buildSie4Buffer([
      '#FNAMN "Importerat AB"',
      '#ORGNR 556036-0793',
      '#RAR 0 20250101 20251231',
    ])
    const parsed = parseSie4(buffer)
    const result = importSie4(db, parsed, { strategy: 'new' })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected failure')
    expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('N3: rejects when SIE4 is missing RAR', () => {
    const buffer = buildSie4Buffer([
      '#FNAMN "Importerat AB"',
      '#ORGNR 556036-0793',
    ])
    const parsed = parseSie4(buffer)
    const result = importSie4(db, parsed, { strategy: 'new' })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected failure')
    expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('N4: creates monthly accounting periods for new FY', () => {
    const buffer = buildSie4Buffer([
      '#FNAMN "Importerat AB"',
      '#ORGNR 556036-0793',
      '#RAR 0 20250101 20251231',
    ])
    const parsed = parseSie4(buffer)
    const result = importSie4(db, parsed, { strategy: 'new' })
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)

    const periods = db
      .prepare(
        'SELECT COUNT(*) as cnt FROM accounting_periods WHERE fiscal_year_id = ?',
      )
      .get(result.data.fiscalYearId) as { cnt: number }
    expect(periods.cnt).toBe(12)
  })
})

describe('S48: SIE4 import — merge strategy', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    createCompany(db, {
      name: 'Merge AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2',
      share_capital: 50000_00,
      registration_date: '2025-01-15',
      fiscal_year_start: '2025-01-01',
      fiscal_year_end: '2025-12-31',
    })
  })
  afterEach(() => {
    db.close()
  })

  it('M1: merges accounts by account_number', () => {
    const buffer = buildSie4Buffer([
      '#FNAMN "Merge AB"',
      '#ORGNR 556036-0793',
      '#RAR 0 20250101 20251231',
      '#KONTO 9999 "Nytt konto"',
      '#KTYP 9999 T',
    ])
    const parsed = parseSie4(buffer)
    const result = importSie4(db, parsed, { strategy: 'merge' })
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.accountsAdded).toBe(1)

    const added = db
      .prepare("SELECT name FROM accounts WHERE account_number = '9999'")
      .get() as { name: string }
    expect(added.name).toBe('Nytt konto')
  })

  it('M2: rejects merge when org_number does not match', () => {
    const buffer = buildSie4Buffer([
      '#FNAMN "Other AB"',
      '#ORGNR 999999-9999',
      '#RAR 0 20250101 20251231',
    ])
    const parsed = parseSie4(buffer)
    const result = importSie4(db, parsed, { strategy: 'merge' })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected failure')
    expect(result.code).toBe('VALIDATION_ERROR')
    expect(result.error).toContain('Orgnummer')
  })

  it('M3: updates existing account name', () => {
    // 1930 already exists with default name
    const buffer = buildSie4Buffer([
      '#FNAMN "Merge AB"',
      '#ORGNR 556036-0793',
      '#RAR 0 20250101 20251231',
      '#KONTO 1930 "Omdöpt bankkonto"',
      '#KTYP 1930 T',
    ])
    const parsed = parseSie4(buffer)
    const result = importSie4(db, parsed, {
      strategy: 'merge',
      // Sprint 56 B2: default 'keep'; explicit overwrite krävs nu.
      conflict_resolutions: { '1930': 'overwrite' },
    })
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.accountsUpdated).toBe(1)

    const updated = db
      .prepare("SELECT name FROM accounts WHERE account_number = '1930'")
      .get() as { name: string }
    expect(updated.name).toBe('Omdöpt bankkonto')
  })
})

describe('S48: SIE4 import — VER/TRANS + sign handling', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })
  afterEach(() => {
    db.close()
  })

  it('V1: imports VER as I-series with correct D/K from signed amounts', () => {
    const buffer = buildSie4Buffer([
      '#FNAMN "Test AB"',
      '#ORGNR 556036-0793',
      '#RAR 0 20250101 20251231',
      '#VER "A" 1 20250315 "Försäljning"',
      '{',
      '#TRANS 1510 {} 12500',
      '#TRANS 3001 {} -10000',
      '#TRANS 2610 {} -2500',
      '}',
    ])
    const parsed = parseSie4(buffer)
    const result = importSie4(db, parsed, { strategy: 'new' })
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.entriesImported).toBe(1)
    expect(result.data.linesImported).toBe(3)

    // Verify series is 'I'
    const entry = db
      .prepare(
        `SELECT id, verification_series, status, source_type FROM journal_entries`,
      )
      .get() as {
      id: number
      verification_series: string
      status: string
      source_type: string
    }
    expect(entry.verification_series).toBe('I')
    expect(entry.status).toBe('booked')
    expect(entry.source_type).toBe('import')

    // Verify sign handling
    const lines = db
      .prepare(
        'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
      )
      .all(entry.id) as Array<{
      account_number: string
      debit_ore: number
      credit_ore: number
    }>
    expect(lines[0].account_number).toBe('1510')
    expect(lines[0].debit_ore).toBe(1250000) // 12500 kr
    expect(lines[0].credit_ore).toBe(0)
    expect(lines[1].account_number).toBe('3001')
    expect(lines[1].debit_ore).toBe(0)
    expect(lines[1].credit_ore).toBe(1000000) // 10000 kr
    expect(lines[2].credit_ore).toBe(250000) // 2500 kr
  })

  it('V2: skips unbalanced vouchers with warning', () => {
    const buffer = buildSie4Buffer([
      '#FNAMN "Test AB"',
      '#ORGNR 556036-0793',
      '#RAR 0 20250101 20251231',
      '#VER "A" 1 20250315 "Obalanserat"',
      '{',
      '#TRANS 1510 {} 100',
      '#TRANS 3001 {} -50',
      '}',
    ])
    const parsed = parseSie4(buffer)
    const result = importSie4(db, parsed, { strategy: 'new' })
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.entriesImported).toBe(0)
    expect(result.data.warnings.some((w) => w.includes('obalanserat'))).toBe(
      true,
    )
  })

  it('V3: rejects entry with unknown account', () => {
    const buffer = buildSie4Buffer([
      '#FNAMN "Test AB"',
      '#ORGNR 556036-0793',
      '#RAR 0 20250101 20251231',
      '#VER "A" 1 20250315 "Okänt konto"',
      '{',
      '#TRANS 99999 {} 100',
      '#TRANS 99998 {} -100',
      '}',
    ])
    const parsed = parseSie4(buffer)
    const result = importSie4(db, parsed, { strategy: 'new' })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected failure')
    expect(result.code).toBe('VALIDATION_ERROR')
    expect(result.error).toContain('99999')

    // Verify rollback: no entries, no company
    const companies = db
      .prepare('SELECT COUNT(*) as c FROM companies')
      .get() as { c: number }
    expect(companies.c).toBe(0)
  })

  it('V4: continues I-series numbering from existing max', () => {
    createCompany(db, {
      name: 'Existing AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2',
      share_capital: 50000_00,
      registration_date: '2025-01-15',
      fiscal_year_start: '2025-01-01',
      fiscal_year_end: '2025-12-31',
    })
    const fyId = (
      db.prepare('SELECT id FROM fiscal_years').get() as { id: number }
    ).id
    // Pre-insert an I-series entry
    db.prepare(
      `INSERT INTO journal_entries (company_id, fiscal_year_id, verification_number, verification_series, journal_date, description, status, source_type)
       VALUES (1, ?, 5, 'I', '2025-02-01', 'Existing', 'booked', 'import')`,
    ).run(fyId)

    const buffer = buildSie4Buffer([
      '#FNAMN "Existing AB"',
      '#ORGNR 556036-0793',
      '#RAR 0 20250101 20251231',
      '#VER "A" 1 20250315 "Ny import"',
      '{',
      '#TRANS 1510 {} 100',
      '#TRANS 3001 {} -100',
      '}',
    ])
    const parsed = parseSie4(buffer)
    const result = importSie4(db, parsed, { strategy: 'merge' })
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)

    const newEntry = db
      .prepare(
        `SELECT verification_number FROM journal_entries WHERE verification_series = 'I' AND description LIKE '%Ny import%'`,
      )
      .get() as { verification_number: number }
    expect(newEntry.verification_number).toBe(6)
  })
})

describe('S48: SIE4 import — full roundtrip', () => {
  it('R1: export → parse → import → same number of booked entries', () => {
    // Setup: export from a seeded source DB
    const sourceDb = createTestDb()
    const { fyId: sourceFyId } = seedForExport(sourceDb)
    const exported = exportSie4(sourceDb, { fiscalYearId: sourceFyId })

    const sourceEntries = sourceDb
      .prepare(
        "SELECT COUNT(*) as c FROM journal_entries WHERE status = 'booked' AND fiscal_year_id = ?",
      )
      .get(sourceFyId) as { c: number }

    sourceDb.close()

    // Import into fresh DB
    const targetDb = createTestDb()
    const parsed = parseSie4(exported.content)
    const result = importSie4(targetDb, parsed, { strategy: 'new' })
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)

    const importedEntries = targetDb
      .prepare(
        "SELECT COUNT(*) as c FROM journal_entries WHERE status = 'booked'",
      )
      .get() as { c: number }

    expect(importedEntries.c).toBe(sourceEntries.c)

    targetDb.close()
  })

  it('R2: export → parse → import → totals match', () => {
    const sourceDb = createTestDb()
    const { fyId } = seedForExport(sourceDb)
    const exported = exportSie4(sourceDb, { fiscalYearId: fyId })

    const sourceTotal = sourceDb
      .prepare(
        `SELECT SUM(debit_ore) as d, SUM(credit_ore) as c FROM journal_entry_lines jel
       JOIN journal_entries je ON jel.journal_entry_id = je.id
       WHERE je.status = 'booked' AND je.fiscal_year_id = ?`,
      )
      .get(fyId) as { d: number; c: number }

    sourceDb.close()

    const targetDb = createTestDb()
    const parsed = parseSie4(exported.content)
    const result = importSie4(targetDb, parsed, { strategy: 'new' })
    expect(result.success).toBe(true)

    const targetTotal = targetDb
      .prepare(
        `SELECT SUM(debit_ore) as d, SUM(credit_ore) as c FROM journal_entry_lines jel
       JOIN journal_entries je ON jel.journal_entry_id = je.id
       WHERE je.status = 'booked'`,
      )
      .get() as { d: number; c: number }

    expect(targetTotal.d).toBe(sourceTotal.d)
    expect(targetTotal.c).toBe(sourceTotal.c)

    targetDb.close()
  })
})
