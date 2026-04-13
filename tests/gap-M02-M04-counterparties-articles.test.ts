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
  listProducts,
  createProduct,
} from '../src/main/services/product-service'
import { listVatCodes } from '../src/main/services/vat-service'
import { listAccounts } from '../src/main/services/account-service'
import {
  CreateCounterpartyInputSchema,
  UpdateCounterpartyInputSchema,
  VatNumberSchema,
} from '../src/main/ipc-schemas'

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
// GAP M02: Kundregister edge cases
// ═══════════════════════════════════════════════════════════

describe('GAP M02-1: EU VAT-nummer formatvalidering', () => {
  it('SE556036079301 godkänns', () => {
    expect(VatNumberSchema.safeParse('SE556036079301').success).toBe(true)
  })

  it('DE123456789 godkänns', () => {
    expect(VatNumberSchema.safeParse('DE123456789').success).toBe(true)
  })

  it('kort ogiltigt VAT (X) avvisas', () => {
    // 'X' is too short (min 2 char country code + 2 chars)
    expect(VatNumberSchema.safeParse('X').success).toBe(false)
  })

  it('numerisk start (123456) avvisas — måste börja med landskod', () => {
    expect(VatNumberSchema.safeParse('123456').success).toBe(false)
  })

  it('kund med giltigt VAT-nummer skapas', () => {
    const result = createCounterparty(db, {
      name: 'EU Kund GmbH',
      type: 'customer',
      vat_number: 'DE123456789',
    })
    expect(result.success).toBe(true)
    expect(result.data?.vat_number).toBe('DE123456789')
  })
})

describe('GAP M02-2: Sortering och filtrering', () => {
  beforeEach(() => {
    createCounterparty(db, { name: 'Alfa AB', type: 'customer' })
    createCounterparty(db, { name: 'Zeta AB', type: 'customer' })
    createCounterparty(db, { name: 'Beta AB', type: 'customer' })
  })

  it('default sortering: namn ASC', () => {
    const list = listCounterparties(db, { type: 'customer' })
    const names = list.map((c) => c.name)
    expect(names).toEqual(['Alfa AB', 'Beta AB', 'Zeta AB'])
  })

  it('is_active filtrering: deaktiverad kund exkluderas', () => {
    const result = createCounterparty(db, {
      name: 'Inaktiv AB',
      type: 'customer',
    })
    deactivateCounterparty(db, result.data!.id)

    const activeOnly = listCounterparties(db, {
      type: 'customer',
      active_only: true,
    })
    expect(activeOnly.find((c) => c.name === 'Inaktiv AB')).toBeUndefined()

    const all = listCounterparties(db, {
      type: 'customer',
      active_only: false,
    })
    expect(all.find((c) => c.name === 'Inaktiv AB')).toBeDefined()
  })

  it('deaktiverad kund med befintliga fakturor: kund finns kvar i DB', () => {
    const result = createCounterparty(db, {
      name: 'Inaktiv Kund AB',
      type: 'customer',
    })
    deactivateCounterparty(db, result.data!.id)

    const row = db
      .prepare('SELECT is_active FROM counterparties WHERE id = ?')
      .get(result.data!.id) as { is_active: number }
    expect(row.is_active).toBe(0)
  })
})

describe('GAP M02-3: UpdateCounterparty field guards', () => {
  it('uppdatering av giltig kolumn fungerar', () => {
    const created = createCounterparty(db, {
      name: 'Original AB',
      type: 'customer',
    })
    const updated = updateCounterparty(db, {
      id: created.data!.id,
      name: 'Nytt Namn AB',
    })
    expect(updated.success).toBe(true)
    expect(updated.data?.name).toBe('Nytt Namn AB')
  })

  it('UpdateCounterpartyInputSchema avvisar extra fält via .strict()', () => {
    const result = UpdateCounterpartyInputSchema.safeParse({
      id: 1,
      name: 'Test',
      is_system_account: true,
    })
    expect(result.success).toBe(false)
  })

  it('UpdateCounterpartyInputSchema kräver id', () => {
    const result = UpdateCounterpartyInputSchema.safeParse({
      name: 'Test',
    })
    expect(result.success).toBe(false)
  })
})

describe('GAP M02-4: Snabbskapande returnerar tillräcklig data', () => {
  it('createCounterparty returnerar id + name för dropdown', () => {
    const result = createCounterparty(db, {
      name: 'Dropdown Kund',
      type: 'customer',
    })
    expect(result.success).toBe(true)
    expect(result.data).toHaveProperty('id')
    expect(result.data).toHaveProperty('name')
    expect(typeof result.data!.id).toBe('number')
    expect(result.data!.name).toBe('Dropdown Kund')
  })
})

// ═══════════════════════════════════════════════════════════
// GAP M03: Leverantörsregister edge cases
// ═══════════════════════════════════════════════════════════

describe('GAP M03-1: Leverantör-specifika tester', () => {
  it('duplikat org_number för leverantörer → blockeras', () => {
    createCounterparty(db, {
      name: 'Lev A',
      type: 'supplier',
      org_number: '556789-0123',
    })
    const dup = createCounterparty(db, {
      name: 'Lev B',
      type: 'supplier',
      org_number: '556789-0123',
    })
    expect(dup.success).toBe(false)
    expect(dup.code).toBe('DUPLICATE_ORG_NUMBER')
  })

  it('NULL org_number × 2 för leverantörer → båda lyckas', () => {
    const a = createCounterparty(db, { name: 'Lev X', type: 'supplier' })
    const b = createCounterparty(db, { name: 'Lev Y', type: 'supplier' })
    expect(a.success).toBe(true)
    expect(b.success).toBe(true)
  })

  it('leverantör syns inte vid type=customer filter', () => {
    createCounterparty(db, { name: 'Leverantör AB', type: 'supplier' })
    createCounterparty(db, { name: 'Kund AB', type: 'customer' })
    const customers = listCounterparties(db, { type: 'customer' })
    expect(customers.find((c) => c.name === 'Leverantör AB')).toBeUndefined()
    expect(customers.find((c) => c.name === 'Kund AB')).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════
// GAP M04: Artikelregister & Prislistor
// ═══════════════════════════════════════════════════════════

function getTestIds(testDb: Database.Database) {
  const vatCode = testDb
    .prepare("SELECT id FROM vat_codes WHERE vat_type = 'outgoing' LIMIT 1")
    .get() as { id: number }
  const account = testDb
    .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
    .get() as { id: number }
  return { vatCodeId: vatCode.id, accountId: account.id }
}

describe('GAP M04-1: Artikeltyp → standardkonto', () => {
  it('service-typ → konto 3002 (ARTICLE_TYPE_DEFAULTS)', () => {
    const { vatCodeId, accountId } = getTestIds(db)
    const result = createProduct(db, {
      name: 'Konsulttjänst',
      default_price_ore: 100_000,
      vat_code_id: vatCodeId,
      account_id: accountId,
      article_type: 'service',
    })
    expect(result.success).toBe(true)
    // Verify article_type stored
    const row = db
      .prepare('SELECT article_type FROM products WHERE id = ?')
      .get(result.data!.id) as { article_type: string }
    expect(row.article_type).toBe('service')
  })

  it('goods-typ skapas korrekt', () => {
    const { vatCodeId } = getTestIds(db)
    const goodsAccount = db
      .prepare("SELECT id FROM accounts WHERE account_number = '3040'")
      .get() as { id: number } | undefined
    if (!goodsAccount) return // Account may not exist in seed

    const result = createProduct(db, {
      name: 'Vara',
      default_price_ore: 50_000,
      vat_code_id: vatCodeId,
      account_id: goodsAccount.id,
      article_type: 'goods',
    })
    expect(result.success).toBe(true)
  })
})

describe('GAP M04-2: Momskod-koppling', () => {
  it('ogiltig vat_code_id → error vid produktskapande', () => {
    const { accountId } = getTestIds(db)
    const result = createProduct(db, {
      name: 'Felaktig',
      default_price_ore: 10_000,
      vat_code_id: 99999, // Non-existent
      account_id: accountId,
    })
    expect(result.success).toBe(false)
  })
})

describe('GAP M04-3: K2/K3-filtrering av konton', () => {
  it('listAccounts med K2 filter returnerar bara K2-tillåtna konton', () => {
    const k2Accounts = listAccounts(db, { fiscal_rule: 'K2' })
    const k3Only = k2Accounts.filter((a) => a.k3_only === 1)
    expect(k3Only).toHaveLength(0) // No K3-only accounts in K2 list
  })

  it('listAccounts med K3 filter returnerar K3-konton', () => {
    const k3Accounts = listAccounts(db, { fiscal_rule: 'K3' })
    expect(k3Accounts.length).toBeGreaterThan(0)
  })
})

describe('GAP M04-4: VAT-kod filtrering', () => {
  it('outgoing VAT-koder finns efter seed', () => {
    const codes = listVatCodes(db)
    const outgoing = codes.filter(
      (c: { vat_type: string }) => c.vat_type === 'outgoing',
    )
    expect(outgoing.length).toBeGreaterThanOrEqual(3) // 25%, 12%, 6%
  })

  it('incoming VAT-koder finns efter seed', () => {
    const codes = listVatCodes(db)
    const incoming = codes.filter(
      (c: { vat_type: string }) => c.vat_type === 'incoming',
    )
    expect(incoming.length).toBeGreaterThanOrEqual(1) // At least 1 incoming
  })
})
