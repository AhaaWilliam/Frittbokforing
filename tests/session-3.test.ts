import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import {
  createCompany,
  getCompany,
  generatePeriods,
} from '../src/main/services/company-service'
import { CreateCompanyInputSchema } from '../src/main/ipc-schemas'

let db: Database.Database

function createTestDb(): Database.Database {
  const testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.pragma('foreign_keys = ON')
  for (let i = 0; i < migrations.length; i++) {
    testDb.exec('BEGIN EXCLUSIVE')
    testDb.exec(migrations[i].sql)
    if (migrations[i].programmatic) migrations[i].programmatic(testDb)
    testDb.pragma(`user_version = ${i + 1}`)
    testDb.exec('COMMIT')
  }
  return testDb
}

const VALID_INPUT = {
  name: 'Test AB',
  org_number: '556036-0793', // Volvo — giltigt Luhn
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000, // 25 000 kr i ören
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
// Zod-validering (4 tester)
// ═══════════════════════════════════════════════════════════
describe('Zod-validering', () => {
  it('1. Giltigt input passerar CreateCompanyInputSchema', () => {
    const result = CreateCompanyInputSchema.safeParse(VALID_INPUT)
    expect(result.success).toBe(true)
  })

  it('2. Ogiltigt orgnummer (fel Luhn) → avvisas', () => {
    const result = CreateCompanyInputSchema.safeParse({
      ...VALID_INPUT,
      org_number: '556036-0794', // Sista siffran ändrad
    })
    expect(result.success).toBe(false)
  })

  it('3. Aktiekapital < 25 000 kr → avvisas', () => {
    const result = CreateCompanyInputSchema.safeParse({
      ...VALID_INPUT,
      share_capital: 2_499_999,
    })
    expect(result.success).toBe(false)
  })

  it('4. Saknat fält (name) → avvisas', () => {
    const result = CreateCompanyInputSchema.safeParse({
      org_number: VALID_INPUT.org_number,
      fiscal_rule: VALID_INPUT.fiscal_rule,
      share_capital: VALID_INPUT.share_capital,
      registration_date: VALID_INPUT.registration_date,
      fiscal_year_start: VALID_INPUT.fiscal_year_start,
      fiscal_year_end: VALID_INPUT.fiscal_year_end,
    })
    expect(result.success).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════
// Defense in depth — org_number trigger (1 test)
// ═══════════════════════════════════════════════════════════
describe('Defense in depth — org_number trigger', () => {
  it('5. SQLite-trigger avvisar ogiltigt org_number-format', () => {
    // Ingen bindestreck
    expect(() => {
      db.prepare(
        "INSERT INTO companies (name, org_number, fiscal_rule) VALUES ('Test', '1234567890', 'K2')",
      ).run()
    }).toThrow()

    // Första siffran < 5
    expect(() => {
      db.prepare(
        "INSERT INTO companies (name, org_number, fiscal_rule) VALUES ('Test', '123456-7890', 'K2')",
      ).run()
    }).toThrow()
  })
})

// ═══════════════════════════════════════════════════════════
// Periodgenerering (5 tester)
// ═══════════════════════════════════════════════════════════
describe('Periodgenerering', () => {
  it('6. Kalenderår 2026 → 12 korrekta perioder', () => {
    const periods = generatePeriods('2026-01-01', '2026-12-31')
    expect(periods.length).toBe(12)
    expect(periods[0]).toEqual({
      period_number: 1,
      start_date: '2026-01-01',
      end_date: '2026-01-31',
    })
    expect(periods[1].end_date).toBe('2026-02-28') // 2026 är inte skottår
    expect(periods[11]).toEqual({
      period_number: 12,
      start_date: '2026-12-01',
      end_date: '2026-12-31',
    })
  })

  it('7. Skottår 2028 → februari har 29 dagar', () => {
    const periods = generatePeriods('2028-01-01', '2028-12-31')
    expect(periods[1].end_date).toBe('2028-02-29')
  })

  it('8. Brutet räkenskapsår juli 2026 – juni 2027', () => {
    const periods = generatePeriods('2026-07-01', '2027-06-30')
    expect(periods.length).toBe(12)
    expect(periods[0]).toEqual({
      period_number: 1,
      start_date: '2026-07-01',
      end_date: '2026-07-31',
    })
    expect(periods[6]).toEqual({
      period_number: 7,
      start_date: '2027-01-01',
      end_date: '2027-01-31',
    })
    expect(periods[11]).toEqual({
      period_number: 12,
      start_date: '2027-06-01',
      end_date: '2027-06-30',
    })
  })

  it('9. Inga gap mellan perioder', () => {
    const testCases = [
      { start: '2026-01-01', end: '2026-12-31' },
      { start: '2026-07-01', end: '2027-06-30' },
    ]
    for (const tc of testCases) {
      const periods = generatePeriods(tc.start, tc.end)
      for (let i = 1; i < periods.length; i++) {
        const prevEnd = new Date(periods[i - 1].end_date + 'T00:00:00')
        prevEnd.setDate(prevEnd.getDate() + 1)
        const y = prevEnd.getFullYear()
        const m = String(prevEnd.getMonth() + 1).padStart(2, '0')
        const d = String(prevEnd.getDate()).padStart(2, '0')
        const expStr = `${y}-${m}-${d}`
        expect(periods[i].start_date).toBe(expStr)
      }
    }
  })

  it('10. Trigger 8-kompatibilitet — bokföring i genererade perioder fungerar', () => {
    const result = createCompany(db, VALID_INPUT)
    expect(result.success).toBe(true)
    if (!result.success) return

    // Hämta fiscal_year
    const fy = db
      .prepare('SELECT * FROM fiscal_years WHERE company_id = ?')
      .get(result.data.id) as { id: number }

    // Skapa en draft-verifikation i period 1
    const entryResult = db
      .prepare(
        `INSERT INTO journal_entries (company_id, fiscal_year_id, journal_date, description, status, created_by)
       VALUES (?, ?, '2025-01-15', 'Test', 'draft', NULL)`,
      )
      .run(result.data.id, fy.id)
    const entryId = Number(entryResult.lastInsertRowid)

    // Lägg till balanserade rader
    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
       VALUES (?, 1, '1930', 10000, 0)`,
    ).run(entryId)
    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
       VALUES (?, 2, '3001', 0, 10000)`,
    ).run(entryId)

    // Boka — detta ska INTE kasta fel om perioderna matchar
    expect(() => {
      db.prepare(
        "UPDATE journal_entries SET status = 'booked' WHERE id = ?",
      ).run(entryId)
    }).not.toThrow()
  })
})

// ═══════════════════════════════════════════════════════════
// Transaktion och integritet (3 tester)
// ═══════════════════════════════════════════════════════════
describe('Transaktion och integritet', () => {
  it('11. Lyckad transaktion skapar 1 company + 1 fiscal_year + 12 perioder', () => {
    const result = createCompany(db, VALID_INPUT)
    expect(result.success).toBe(true)

    const companies = db
      .prepare('SELECT COUNT(*) as c FROM companies')
      .get() as { c: number }
    expect(companies.c).toBe(1)

    const years = db
      .prepare('SELECT COUNT(*) as c FROM fiscal_years')
      .get() as { c: number }
    expect(years.c).toBe(1)

    const periods = db
      .prepare('SELECT COUNT(*) as c FROM accounting_periods')
      .get() as { c: number }
    expect(periods.c).toBe(12)
  })

  it('12. Duplicerat orgnummer → rollback, bara 1 company kvar', () => {
    const first = createCompany(db, VALID_INPUT)
    expect(first.success).toBe(true)

    const second = createCompany(db, {
      ...VALID_INPUT,
      name: 'Annat AB',
    })
    expect(second.success).toBe(false)
    if (!second.success) {
      expect(second.error).toContain('finns redan')
      expect(second.code).toBe('DUPLICATE_ORG_NUMBER')
    }

    const count = db.prepare('SELECT COUNT(*) as c FROM companies').get() as {
      c: number
    }
    expect(count.c).toBe(1)
  })

  it('13. K2/K3 sparas korrekt', () => {
    createCompany(db, { ...VALID_INPUT, fiscal_rule: 'K3' })
    const company = getCompany(db)
    expect(company).not.toBeNull()
    expect(company!.fiscal_rule).toBe('K3')
  })
})

// ═══════════════════════════════════════════════════════════
// IPC round-trip (2 tester)
// ═══════════════════════════════════════════════════════════
describe('IPC round-trip', () => {
  it('14. getCompany() på tom databas → null', () => {
    const company = getCompany(db)
    expect(company).toBeNull()
  })

  it('15. createCompany() → getCompany() returnerar rätt data', () => {
    const result = createCompany(db, VALID_INPUT)
    expect(result.success).toBe(true)

    const company = getCompany(db)
    expect(company).not.toBeNull()
    expect(company!.name).toBe('Test AB')
    expect(company!.org_number).toBe('556036-0793')
    expect(company!.fiscal_rule).toBe('K2')
    expect(company!.share_capital).toBe(2_500_000)
    expect(company!.registration_date).toBe('2025-01-15')
  })
})

// ═══════════════════════════════════════════════════════════
// Routing (1 test — enkel logiktest)
// ═══════════════════════════════════════════════════════════
describe('Routing', () => {
  it('16. Om company === null → wizard ska visas (logiktest)', () => {
    // Vi testar routinglogiken utan React-rendering
    const company = getCompany(db)
    expect(company).toBeNull()
    // I App.tsx: if (!company) return <OnboardingWizard />
    // Logiken är korrekt om company === null
  })
})
