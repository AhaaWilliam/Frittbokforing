/**
 * S68c — F48 IPC decimal-precision-gate
 *
 * Sprint 20 Steg 0.6b identifierade att IPC-lagret saknar decimal-
 * precisions-test. Form-schema-testerna fångar invarianten på
 * renderer-sidan, men DRY-drift mellan form-schema och IPC-schema
 * skulle inte fångas idag.
 *
 * Minimum-täckning: invoice:save-draft + invoice:update-draft.
 * Dessa channels introducerar line-data med quantity-fält.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import {
  saveDraft,
  updateDraft,
} from '../src/main/services/invoice-service'

let db: Database.Database

const VALID_COMPANY = {
  name: 'Precision AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2025-01-15',
  fiscal_year_start: '2025-01-01',
  fiscal_year_end: '2025-12-31',
}

let fiscalYearId: number
let counterpartyId: number
let vatCodeId: number
let productId: number

beforeEach(() => {
  db = createTestDb()
  createCompany(db, VALID_COMPANY)

  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  fiscalYearId = fy.id

  const cp = createCounterparty(db, { name: 'Kund AB', type: 'customer' })
  if (!cp.success) throw new Error('CP failed')
  counterpartyId = cp.data.id

  const vc = db.prepare("SELECT id FROM vat_codes WHERE code = 'MP1'").get() as { id: number }
  vatCodeId = vc.id

  const acc = db.prepare("SELECT id FROM accounts WHERE account_number = '3002'").get() as { id: number }
  const prod = createProduct(db, {
    name: 'Konsult',
    default_price_ore: 100000,
    vat_code_id: vc.id,
    account_id: acc.id,
  })
  if (!prod.success) throw new Error('Product failed')
  productId = prod.data.id
})

afterEach(() => {
  db.close()
})

function makeBaseLine(qtyOverride: number) {
  return {
    product_id: productId,
    description: 'Konsult',
    quantity: qtyOverride,
    unit_price_ore: 100000,
    vat_code_id: vatCodeId,
    sort_order: 0,
  }
}

function makeBasePayload(lines: ReturnType<typeof makeBaseLine>[]) {
  return {
    counterparty_id: counterpartyId,
    fiscal_year_id: fiscalYearId,
    invoice_date: '2025-03-15',
    due_date: '2025-04-15',
    lines,
  }
}

describe('IPC invoice channels — F48 precision-gate', () => {
  it('invoice:save-draft förkastar line med qty=1.333 (>2 decimaler)', () => {
    const result = saveDraft(db, makeBasePayload([makeBaseLine(1.333)]))

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.error).toMatch(/högst 2 decimaler/i)
    }
  })

  it('invoice:update-draft förkastar line med qty=1.333 (>2 decimaler)', () => {
    // Skapa ett giltigt utkast först
    const draft = saveDraft(db, makeBasePayload([makeBaseLine(1)]))
    expect(draft.success).toBe(true)
    if (!draft.success) throw new Error('Setup failed')

    const result = updateDraft(db, {
      id: draft.data.id,
      counterparty_id: counterpartyId,
      invoice_date: '2025-03-15',
      due_date: '2025-04-15',
      lines: [makeBaseLine(1.333)],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.error).toMatch(/högst 2 decimaler/i)
    }
  })

  it('invoice:save-draft accepterar qty=1.33 och sparar värdet korrekt (read-back)', () => {
    const result = saveDraft(db, makeBasePayload([makeBaseLine(1.33)]))

    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Expected success')

    // Read-back: verifiera att qty persisterats korrekt
    const line = db
      .prepare('SELECT quantity FROM invoice_lines WHERE invoice_id = ?')
      .get(result.data.id) as { quantity: number }
    expect(line.quantity).toBe(1.33)
  })
})
