import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { listAccounts } from '../src/main/services/account-service'
import { getAccountBalances } from '../src/main/services/report/balance-queries'

function createTestDb(): Database.Database {
  const testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.pragma('foreign_keys = ON')
  for (let i = 0; i < migrations.length; i++) {
    const m = migrations[i]
    const needsFkOff = i === 21 || i === 22
    if (needsFkOff) testDb.pragma('foreign_keys = OFF')
    testDb.exec('BEGIN EXCLUSIVE')
    testDb.exec(m.sql)
    if (m.programmatic) m.programmatic(testDb)
    testDb.pragma(`user_version = ${i + 1}`)
    testDb.exec('COMMIT')
    if (needsFkOff) {
      testDb.pragma('foreign_keys = ON')
      const fkCheck = testDb.pragma('foreign_key_check') as unknown[]
      if (fkCheck.length > 0) {
        throw new Error(`Migration ${i + 1} FK check failed: ${JSON.stringify(fkCheck)}`)
      }
    }
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

let db: Database.Database
let companyId: number
let fyId: number

function ensureAccountExists(accountNumber: string, name: string) {
  const existing = db
    .prepare('SELECT 1 FROM accounts WHERE account_number = ?')
    .get(accountNumber)
  if (!existing) {
    db.prepare(
      "INSERT INTO accounts (account_number, name, account_type, is_active, is_system_account) VALUES (?, ?, 'expense', 1, 0)",
    ).run(accountNumber, name)
  }
}

function bookEntry(
  date: string,
  lines: { account: string; debit: number; credit: number }[],
) {
  const je = db
    .prepare(
      `INSERT INTO journal_entries (company_id, fiscal_year_id, verification_series, verification_number, journal_date, description, status, source_type)
       VALUES (?, ?, 'A', (SELECT COALESCE(MAX(verification_number),0)+1 FROM journal_entries WHERE fiscal_year_id = ? AND verification_series = 'A'), ?, 'Test', 'draft', 'manual')`,
    )
    .run(companyId, fyId, fyId, date)

  const jeId = je.lastInsertRowid as number
  let lineNum = 1
  for (const l of lines) {
    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore, description)
       VALUES (?, ?, ?, ?, ?, '')`,
    ).run(jeId, lineNum++, l.account, l.debit, l.credit)
  }

  db.prepare("UPDATE journal_entries SET status = 'booked' WHERE id = ?").run(
    jeId,
  )
  return jeId
}

beforeEach(() => {
  db = createTestDb()
  createCompany(db, VALID_COMPANY)
  const co = db.prepare('SELECT id FROM companies LIMIT 1').get() as {
    id: number
  }
  companyId = co.id
  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  fyId = fy.id
})

afterEach(() => {
  db.close()
})

describe('F4 sortering — numerisk ordning', () => {
  it('getAccountBalances sorterar numeriskt med 5-siffrigt konto', () => {
    ensureAccountExists('30000', 'Underkonto test')
    bookEntry('2025-03-15', [
      { account: '30000', debit: 100_000, credit: 0 },
      { account: '3002', debit: 0, credit: 100_000 },
    ])

    const balances = getAccountBalances(db, fyId)
    const numbers = balances
      .filter((b) => b.account_number.startsWith('3'))
      .map((b) => b.account_number)
    const idx3002 = numbers.indexOf('3002')
    const idx30000 = numbers.indexOf('30000')
    expect(idx3002).toBeGreaterThanOrEqual(0)
    expect(idx30000).toBeGreaterThanOrEqual(0)
    expect(idx3002).toBeLessThan(idx30000) // 3002 < 30000 numeriskt
  })

  it('listAccounts sorterar numeriskt med befintlig seed-data', () => {
    const accounts = listAccounts(db, { fiscal_rule: 'K2', class: 3 })
    const numbers = accounts.map((a) => a.account_number)
    const sortedNumerically = [...numbers].sort(
      (a, b) => parseInt(a, 10) - parseInt(b, 10),
    )
    expect(numbers).toEqual(sortedNumerically)
  })
})
