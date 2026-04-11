import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import {
  listCounterparties,
  createCounterparty,
  updateCounterparty,
  deactivateCounterparty,
} from '../src/main/services/counterparty-service'
import {
  VatNumberSchema,
  UpdateCompanyInputSchema,
} from '../src/main/ipc-schemas'

let db: Database.Database

function createTestDb(): Database.Database {
  const testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.pragma('foreign_keys = ON')
  for (let i = 0; i < migrations.length; i++) {
    const migration = migrations[i]
    testDb.exec('BEGIN EXCLUSIVE')
    testDb.exec(migration.sql)
    if (migration.programmatic) {
      migration.programmatic(testDb)
    }
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
})

afterEach(() => {
  if (db) db.close()
})

// ═══════════════════════════════════════════════════════════
// Migration (2 tester)
// ═══════════════════════════════════════════════════════════
describe('Migration 005', () => {
  it('1. user_version = 5, nya tabeller och kolumner', () => {
    const v = db.pragma('user_version', { simple: true })
    expect(v).toBe(18) // S24: Uppdatera vid nya migrationer

    // Nya tabeller
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('products','price_lists','price_list_items') ORDER BY name",
      )
      .all() as { name: string }[]
    expect(tables.map((t) => t.name)).toEqual([
      'price_list_items',
      'price_lists',
      'products',
    ])

    // Counterparties nya kolumner
    const cpCols = (
      db.pragma('table_info(counterparties)') as { name: string }[]
    ).map((c) => c.name)
    expect(cpCols).toContain('vat_number')
    expect(cpCols).toContain('contact_person')
    expect(cpCols).toContain('updated_at')

    // Companies nya kolumner
    const coCols = (
      db.pragma('table_info(companies)') as { name: string }[]
    ).map((c) => c.name)
    expect(coCols).toContain('vat_number')
    expect(coCols).toContain('bankgiro')
    expect(coCols).toContain('plusgiro')
    expect(coCols).toContain('email')
    expect(coCols).toContain('website')
  })

  it('2. Migration är idempotent (kör en gång till utan fel)', () => {
    // Kör migration 005 igen — alla IF NOT EXISTS + columnExists ska hantera det
    const migration = migrations[4]
    expect(() => {
      db.exec(migration.sql)
      if (migration.programmatic) migration.programmatic(db)
    }).not.toThrow()
  })
})

// ═══════════════════════════════════════════════════════════
// Counterparty CRUD (6 tester)
// ═══════════════════════════════════════════════════════════
describe('Counterparty CRUD', () => {
  it('3. Skapa kund med alla fält inkl. VAT → success', () => {
    const result = createCounterparty(db, {
      name: 'Acme AB',
      type: 'customer',
      org_number: '556036-0793',
      vat_number: 'SE556036079301',
      address_line1: 'Storgatan 1',
      postal_code: '111 22',
      city: 'Stockholm',
      country: 'Sverige',
      contact_person: 'Anna',
      email: 'anna@acme.se',
      phone: '08-12345',
      default_payment_terms: 30,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('Acme AB')
      expect(result.data.vat_number).toBe('SE556036079301')
      expect(result.data.type).toBe('customer')
      expect(result.data.default_payment_terms).toBe(30)
      expect(result.data.country).toBe('Sverige')
    }
  })

  it('4. Ogiltigt VAT-nummer → VALIDATION_ERROR', () => {
    // Bara 1 bokstav i landskod → ogiltigt
    const result = createCounterparty(db, {
      name: 'Bad VAT AB',
      vat_number: 'X1234',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
    }

    // Tomt/null ska vara ok
    const ok = createCounterparty(db, {
      name: 'No VAT AB',
      vat_number: null,
    })
    expect(ok.success).toBe(true)
  })

  it('5. Lista kunder med sök → filtrerar på namn', () => {
    createCounterparty(db, { name: 'Acme AB' })
    createCounterparty(db, { name: 'Beta AB' })
    createCounterparty(db, { name: 'Acme Konsult' })

    const all = listCounterparties(db, {})
    expect(all.length).toBe(3)

    const acme = listCounterparties(db, { search: 'Acme' })
    expect(acme.length).toBe(2)
  })

  it('6. Uppdatera kund → success', () => {
    const created = createCounterparty(db, { name: 'Original AB' })
    expect(created.success).toBe(true)
    if (!created.success) return

    const updated = updateCounterparty(db, {
      id: created.data.id,
      name: 'Nytt Namn AB',
      vat_number: 'SE556036079301',
    })
    expect(updated.success).toBe(true)
    if (updated.success) {
      expect(updated.data.name).toBe('Nytt Namn AB')
      expect(updated.data.vat_number).toBe('SE556036079301')
    }
  })

  it('7. Inaktivera kund → is_active = 0', () => {
    const created = createCounterparty(db, { name: 'Inactive AB' })
    expect(created.success).toBe(true)
    if (!created.success) return

    deactivateCounterparty(db, created.data.id)

    const activeOnly = listCounterparties(db, { active_only: true })
    expect(activeOnly.find((c) => c.name === 'Inactive AB')).toBeUndefined()

    const all = listCounterparties(db, { active_only: false })
    expect(all.find((c) => c.name === 'Inactive AB')).toBeDefined()
  })

  it('8. Lista kunder filtrerar typ korrekt', () => {
    createCounterparty(db, { name: 'Kund AB', type: 'customer' })
    createCounterparty(db, { name: 'Lev AB', type: 'supplier' })
    createCounterparty(db, { name: 'Båda AB', type: 'both' })

    const customers = listCounterparties(db, { type: 'customer' })
    expect(customers.length).toBe(2) // customer + both

    const suppliers = listCounterparties(db, { type: 'supplier' })
    expect(suppliers.length).toBe(2) // supplier + both
  })
})

// ═══════════════════════════════════════════════════════════
// VAT-validering (2 tester)
// ═══════════════════════════════════════════════════════════
describe('VAT-validering', () => {
  it('9. Svenskt VAT-nr accepteras, ogiltigt avvisas', () => {
    expect(VatNumberSchema.safeParse('SE556036079301').success).toBe(true)
    expect(VatNumberSchema.safeParse('SE55').success).toBe(true) // min 2+2
    // Bara 1 bokstav i landskod → avvisas
    expect(VatNumberSchema.safeParse('S556036079301').success).toBe(false)
    // Gemener i landskod → avvisas
    expect(VatNumberSchema.safeParse('se556036079301').success).toBe(false)
  })

  it('10. EU VAT-nr accepteras', () => {
    expect(VatNumberSchema.safeParse('DE123456789').success).toBe(true)
    expect(VatNumberSchema.safeParse('IE1234567WA').success).toBe(true)
    expect(VatNumberSchema.safeParse('X1234').success).toBe(false) // bara 1 bokstav
  })
})

// ═══════════════════════════════════════════════════════════
// Company update + sidebar (2 tester)
// ═══════════════════════════════════════════════════════════
describe('Company update', () => {
  it('11. company:update sparar VAT-nummer och adress', () => {
    createCompany(db, VALID_COMPANY)

    const input = {
      vat_number: 'SE556036079301',
      address_line1: 'Storgatan 1',
      bankgiro: '123-4567',
    }
    const parsed = UpdateCompanyInputSchema.safeParse(input)
    expect(parsed.success).toBe(true)

    // Direct DB update (simulating the service)
    if (parsed.success) {
      db.prepare(
        'UPDATE companies SET vat_number = ?, address_line1 = ?, bankgiro = ? WHERE id = 1',
      ).run(
        parsed.data.vat_number,
        parsed.data.address_line1,
        parsed.data.bankgiro,
      )
    }

    const company = db
      .prepare('SELECT * FROM companies WHERE id = 1')
      .get() as Record<string, unknown>
    expect(company.vat_number).toBe('SE556036079301')
    expect(company.address_line1).toBe('Storgatan 1')
    expect(company.bankgiro).toBe('123-4567')
  })

  it('12. Konton 3040 och 3050 finns efter migration 005', () => {
    const rows = db
      .prepare(
        "SELECT account_number FROM accounts WHERE account_number IN ('3040', '3050') ORDER BY account_number",
      )
      .all() as { account_number: string }[]
    expect(rows.map((r) => r.account_number)).toEqual(['3040', '3050'])
  })
})
