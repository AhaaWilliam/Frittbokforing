import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deactivateProduct,
  setCustomerPrice,
  removeCustomerPrice,
  getPriceForCustomer,
} from '../src/main/services/product-service'
import { listVatCodes } from '../src/main/services/vat-service'
import { listAccounts } from '../src/main/services/account-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createCompany } from '../src/main/services/company-service'
import { createTestDb } from './helpers/create-test-db'

let db: Database.Database
let cpyId: number

// Helper: get first outgoing vat_code and a revenue account
function getTestIds(testDb: Database.Database) {
  const vatCode = testDb
    .prepare("SELECT id FROM vat_codes WHERE vat_type = 'outgoing' LIMIT 1")
    .get() as { id: number }
  const account = testDb
    .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
    .get() as { id: number }
  return { vatCodeId: vatCode.id, accountId: account.id }
}

function createTestProduct(
  testDb: Database.Database,
  overrides?: Record<string, unknown>,
) {
  const { vatCodeId, accountId } = getTestIds(testDb)
  return createProduct(testDb, {
    company_id: cpyId,
    name: 'Webbutveckling',
    unit: 'timme',
    default_price_ore: 95000, // 950 kr
    vat_code_id: vatCodeId,
    account_id: accountId,
    article_type: 'service',
    ...overrides,
  })
}

beforeEach(() => {
  db = createTestDb()
  const cmp = createCompany(db, {
    name: 'Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 2_500_000,
    registration_date: '2025-01-15',
    fiscal_year_start: '2025-01-01',
    fiscal_year_end: '2025-12-31',
  })
  if (!cmp.success) throw new Error('seedCompany failed: ' + cmp.error)
  cpyId = cmp.data.id
})

afterEach(() => {
  if (db) db.close()
})

// ═══════════════════════════════════════════════════════════
// Produkt-CRUD (5 tester)
// ═══════════════════════════════════════════════════════════
describe('Produkt-CRUD', () => {
  it('1. Skapa artikel med alla fält → success', () => {
    const result = createTestProduct(db)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('Webbutveckling')
      expect(result.data.unit).toBe('timme')
      expect(result.data.default_price_ore).toBe(95000)
      expect(result.data.article_type).toBe('service')
      expect(result.data.is_active).toBe(1)
      expect(result.data.created_at).toBeTruthy()
    }
  })

  it('2. Lista artiklar med sök → filtrerar på namn', () => {
    createTestProduct(db, { name: 'Webbutveckling' })
    createTestProduct(db, { name: 'Hosting' })
    createTestProduct(db, { name: 'Webb-design' })

    const all = listProducts(db, { company_id: cpyId })
    expect(all.length).toBe(3)

    const webb = listProducts(db, { company_id: cpyId, search: 'Webb' })
    expect(webb.length).toBe(2)
  })

  it('3. Lista artiklar med typfilter → bara service', () => {
    const { vatCodeId, accountId } = getTestIds(db)
    createTestProduct(db, { name: 'Tjänst', article_type: 'service' })
    createProduct(db, {
      company_id: cpyId,
      name: 'Vara',
      unit: 'styck',
      default_price_ore: 10000,
      vat_code_id: vatCodeId,
      account_id: accountId,
      article_type: 'goods',
    })

    const services = listProducts(db, { company_id: cpyId, type: 'service' })
    expect(services.length).toBe(1)
    expect(services[0].name).toBe('Tjänst')
  })

  it('4. Uppdatera artikel → success', () => {
    const created = createTestProduct(db)
    expect(created.success).toBe(true)
    if (!created.success) return

    const updated = updateProduct(db, {
      company_id: cpyId,
      id: created.data.id,
      name: 'Nytt namn',
      default_price_ore: 100000,
    })
    expect(updated.success).toBe(true)
    if (updated.success) {
      expect(updated.data.name).toBe('Nytt namn')
      expect(updated.data.default_price_ore).toBe(100000)
    }
  })

  it('5. Inaktivera artikel → is_active = 0', () => {
    const created = createTestProduct(db)
    expect(created.success).toBe(true)
    if (!created.success) return

    deactivateProduct(db, created.data.id, cpyId)

    const activeOnly = listProducts(db, {
      company_id: cpyId,
      active_only: true,
    })
    expect(activeOnly.length).toBe(0)

    const all = listProducts(db, { company_id: cpyId, active_only: false })
    expect(all.length).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════
// Prislogik (4 tester)
// ═══════════════════════════════════════════════════════════
describe('Prislogik', () => {
  it('6. Sätt kundspecifikt pris → visas i getProduct', () => {
    const product = createTestProduct(db)
    expect(product.success).toBe(true)
    if (!product.success) return

    const cp = createCounterparty(db, { company_id: cpyId, name: 'Acme AB' })
    expect(cp.success).toBe(true)
    if (!cp.success) return

    const result = setCustomerPrice(db, {
      company_id: cpyId,
      product_id: product.data.id,
      counterparty_id: cp.data.id,
      price_ore: 85000,
    })
    expect(result.success).toBe(true)

    const detail = getProduct(db, product.data.id, cpyId)
    expect(detail).not.toBeNull()
    expect(detail!.customer_prices.length).toBe(1)
    expect(detail!.customer_prices[0].price_ore).toBe(85000)
    expect(detail!.customer_prices[0].counterparty_name).toBe('Acme AB')
  })

  it('7. getPriceForCustomer med kundpris → source=customer', () => {
    const product = createTestProduct(db)
    if (!product.success) return
    const cp = createCounterparty(db, { company_id: cpyId, name: 'Acme AB' })
    if (!cp.success) return

    setCustomerPrice(db, {
      company_id: cpyId,
      product_id: product.data.id,
      counterparty_id: cp.data.id,
      price_ore: 85000,
    })

    const result = getPriceForCustomer(db, {
      company_id: cpyId,
      product_id: product.data.id,
      counterparty_id: cp.data.id,
    })
    expect(result.price_ore).toBe(85000)
    expect(result.source).toBe('customer')
  })

  it('8. getPriceForCustomer utan kundpris → source=default', () => {
    const product = createTestProduct(db)
    if (!product.success) return
    const cp = createCounterparty(db, { company_id: cpyId, name: 'Annan AB' })
    if (!cp.success) return

    const result = getPriceForCustomer(db, {
      company_id: cpyId,
      product_id: product.data.id,
      counterparty_id: cp.data.id,
    })
    expect(result.price_ore).toBe(95000) // default_price_ore
    expect(result.source).toBe('default')
  })

  it('9. Ta bort kundpris → fallback till default', () => {
    const product = createTestProduct(db)
    if (!product.success) return
    const cp = createCounterparty(db, { company_id: cpyId, name: 'Acme AB' })
    if (!cp.success) return

    setCustomerPrice(db, {
      company_id: cpyId,
      product_id: product.data.id,
      counterparty_id: cp.data.id,
      price_ore: 85000,
    })
    removeCustomerPrice(db, {
      company_id: cpyId,
      product_id: product.data.id,
      counterparty_id: cp.data.id,
    })

    const result = getPriceForCustomer(db, {
      company_id: cpyId,
      product_id: product.data.id,
      counterparty_id: cp.data.id,
    })
    expect(result.price_ore).toBe(95000)
    expect(result.source).toBe('default')
  })
})

// ═══════════════════════════════════════════════════════════
// Stödjande (3 tester)
// ═══════════════════════════════════════════════════════════
describe('Stödjande IPC', () => {
  it('10. vat-code:list(outgoing) → returnerar utgående koder', () => {
    const outgoing = listVatCodes(db, 'outgoing')
    expect(outgoing.length).toBeGreaterThanOrEqual(3)
    // Alla ska vara outgoing
    for (const vc of outgoing) {
      expect(vc.vat_type).toBe('outgoing')
    }
    // Verifiera att inga incoming inkluderas
    const codes = outgoing.map((vc) => vc.code)
    expect(codes.some((c) => c.startsWith('IP'))).toBe(false)
  })

  it('11. account:list(K2) → filtrerar bort k3_only', () => {
    const accounts = listAccounts(db, { fiscal_rule: 'K2' })
    for (const acc of accounts) {
      expect(acc.k3_only).toBe(0)
    }
    expect(accounts.length).toBeGreaterThan(0)
  })

  it('12. account:list class=3 → bara intäktskonton 3xxx', () => {
    const accounts = listAccounts(db, { fiscal_rule: 'K2', class: 3 })
    expect(accounts.length).toBeGreaterThan(0)
    for (const acc of accounts) {
      const num = parseInt(acc.account_number, 10)
      expect(num).toBeGreaterThanOrEqual(3000)
      expect(num).toBeLessThan(4000)
    }
  })
})
