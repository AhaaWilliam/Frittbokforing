/**
 * S25 — Backend processLines VAT tests via saveDraft→getDraft.
 *
 * Tests VAT calculation in invoice-service processLines() through
 * the public API (saveDraft + getDraft) since processLines is private.
 * Uses shared VAT_SCENARIOS fixture for parity with renderer tests.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { saveDraft, getDraft } from '../src/main/services/invoice-service'
import { VAT_SCENARIOS } from './fixtures/vat-scenarios'

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
let fyId: number
let cpId: number
const vatCodeMap = new Map<string, number>()

beforeEach(() => {
  db = createTestDb()
  createCompany(db, VALID_COMPANY)
  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  fyId = fy.id
  const cpResult = createCounterparty(db, { name: 'Kund AB', type: 'customer' })
  if (!cpResult.success) throw new Error('createCounterparty failed')
  cpId = cpResult.data.id

  // Build vat_code lookup
  const codes = db
    .prepare('SELECT id, code FROM vat_codes')
    .all() as Array<{ id: number; code: string }>
  for (const c of codes) {
    vatCodeMap.set(c.code, c.id)
  }
})

afterEach(() => {
  db.close()
})

describe('Backend processLines VAT via saveDraft+getDraft (F40)', () => {
  for (const scenario of VAT_SCENARIOS) {
    it(`V: ${scenario.label}`, () => {
      const vatCodeId = vatCodeMap.get(scenario.vatCode)
      expect(vatCodeId).toBeDefined()

      const result = saveDraft(db, {
        counterparty_id: cpId,
        fiscal_year_id: fyId,
        invoice_date: '2025-03-15',
        due_date: '2025-04-14',
        lines: [
          {
            product_id: null,
            description: `Test: ${scenario.label}`,
            quantity: scenario.quantity,
            unit_price_ore: Math.round(scenario.unitPriceKr * 100),
            vat_code_id: vatCodeId!,
            sort_order: 0,
            account_number: '3002',
          },
        ],
      })
      expect(result.success).toBe(true)
      if (!result.success) return

      const draft = getDraft(db, result.data.id)
      expect(draft).not.toBeNull()
      if (!draft) return

      expect(draft.lines).toHaveLength(1)
      const line = draft.lines[0]
      expect(line.line_total_ore).toBe(scenario.expectedNettoOre)
      expect(line.vat_amount_ore).toBe(scenario.expectedVatOre)
    })
  }
})
