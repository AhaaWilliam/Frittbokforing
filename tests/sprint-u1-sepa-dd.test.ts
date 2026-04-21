/**
 * Sprint U1 — SEPA Direct Debit (pain.008) backend-MVP tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import {
  createMandate,
  listMandates,
  revokeMandate,
  createCollection,
  createDirectDebitBatch,
} from '../src/main/services/payment/sepa-dd-service'
import { generatePain008 } from '../src/main/services/payment/pain008-export-service'

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

let db: Database.Database
let fyId: number
let customerId: number

const VALID_IBAN = 'SE4550000000058398257466'
const VALID_BIC = 'ESSESESS'

beforeAll(() => {
  db = createTestDb()
  const comp = createCompany(db, {
    name: 'SEPA Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 50000_00,
    registration_date: '2025-01-15',
    fiscal_year_start: '2025-01-01',
    fiscal_year_end: '2025-12-31',
  })
  if (!comp.success) throw new Error('company create failed')
  db.prepare("UPDATE companies SET bankgiro = '1234-5678' WHERE id = 1").run()

  fyId = (
    db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  ).id

  const cp = createCounterparty(db, {
    company_id: 1,
    name: 'Kund AB',
    type: 'customer',
    org_number: '559999-0002',
  })
  if (!cp.success) throw new Error('counterparty create failed')
  customerId = cp.data.id
})

afterAll(() => {
  if (db) db.close()
})

describe('Migration 049: schema', () => {
  it('M1: sepa_dd_mandates table exists', () => {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='sepa_dd_mandates'",
      )
      .get()
    expect(row).toBeTruthy()
  })

  it('M2: sepa_dd_collections table exists', () => {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='sepa_dd_collections'",
      )
      .get()
    expect(row).toBeTruthy()
  })

  it('M3: payment_batches.batch_type includes direct_debit', () => {
    const row = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='payment_batches'",
      )
      .get() as { sql: string }
    expect(row.sql).toContain("'direct_debit'")
  })

  it('M4: mandate_reference UNIQUE enforced', () => {
    db.prepare(
      `INSERT INTO sepa_dd_mandates
       (counterparty_id, mandate_reference, signature_date, sequence_type, iban, status)
       VALUES (?, 'UNIQ-TEST', '2025-01-01', 'RCUR', ?, 'active')`,
    ).run(customerId, VALID_IBAN)

    expect(() =>
      db
        .prepare(
          `INSERT INTO sepa_dd_mandates
         (counterparty_id, mandate_reference, signature_date, sequence_type, iban, status)
         VALUES (?, 'UNIQ-TEST', '2025-01-01', 'RCUR', ?, 'active')`,
        )
        .run(customerId, VALID_IBAN),
    ).toThrow()
  })
})

describe('sepa-dd-service: mandates', () => {
  it('S1: createMandate happy path', () => {
    const res = createMandate(db, {
      counterparty_id: customerId,
      mandate_reference: 'MND-001',
      signature_date: '2025-02-01',
      sequence_type: 'RCUR',
      iban: VALID_IBAN,
      bic: VALID_BIC,
    })
    expect(res.success).toBe(true)
    if (!res.success) throw new Error(res.error)
    expect(res.data.mandate_reference).toBe('MND-001')
    expect(res.data.status).toBe('active')
  })

  it('S2: createMandate rejects invalid iban', () => {
    const res = createMandate(db, {
      counterparty_id: customerId,
      mandate_reference: 'MND-BAD-IBAN',
      signature_date: '2025-02-01',
      sequence_type: 'RCUR',
      iban: 'NOTANIBAN',
    })
    expect(res.success).toBe(false)
    if (res.success) throw new Error('expected failure')
    expect(res.code).toBe('VALIDATION_ERROR')
    expect(res.field).toBe('iban')
  })

  it('S3: createMandate rejects missing counterparty', () => {
    const res = createMandate(db, {
      counterparty_id: 99999,
      mandate_reference: 'MND-NOCP',
      signature_date: '2025-02-01',
      sequence_type: 'OOFF',
      iban: VALID_IBAN,
    })
    expect(res.success).toBe(false)
    if (res.success) throw new Error('expected failure')
    expect(res.code).toBe('COUNTERPARTY_NOT_FOUND')
  })

  it('S4: listMandates returns mandates for counterparty', () => {
    const res = listMandates(db, customerId)
    expect(res.success).toBe(true)
    if (!res.success) throw new Error(res.error)
    expect(res.data.length).toBeGreaterThanOrEqual(1)
    expect(res.data.some((m) => m.mandate_reference === 'MND-001')).toBe(true)
  })

  it('S5: revokeMandate sets status=revoked', () => {
    const created = createMandate(db, {
      counterparty_id: customerId,
      mandate_reference: 'MND-REV',
      signature_date: '2025-02-01',
      sequence_type: 'OOFF',
      iban: VALID_IBAN,
    })
    if (!created.success) throw new Error(created.error)
    const rev = revokeMandate(db, created.data.id)
    expect(rev.success).toBe(true)
    const row = db
      .prepare('SELECT status FROM sepa_dd_mandates WHERE id = ?')
      .get(created.data.id) as { status: string }
    expect(row.status).toBe('revoked')
  })

  it('S6: revokeMandate fails for unknown id', () => {
    const res = revokeMandate(db, 99999)
    expect(res.success).toBe(false)
    if (res.success) throw new Error('expected failure')
    expect(res.code).toBe('NOT_FOUND')
  })
})

describe('sepa-dd-service: collections + batch', () => {
  let mandateId: number

  beforeAll(() => {
    const m = createMandate(db, {
      counterparty_id: customerId,
      mandate_reference: 'MND-COLL',
      signature_date: '2025-02-01',
      sequence_type: 'FRST',
      iban: VALID_IBAN,
    })
    if (!m.success) throw new Error(m.error)
    mandateId = m.data.id
  })

  it('C1: createCollection happy path', () => {
    const res = createCollection(db, {
      fiscal_year_id: fyId,
      mandate_id: mandateId,
      amount_ore: 12500,
      collection_date: '2025-03-01',
    })
    expect(res.success).toBe(true)
    if (!res.success) throw new Error(res.error)
    expect(res.data.status).toBe('pending')
    expect(res.data.amount_ore).toBe(12500)
  })

  it('C2: createCollection rejects negative amount', () => {
    const res = createCollection(db, {
      fiscal_year_id: fyId,
      mandate_id: mandateId,
      amount_ore: -100,
      collection_date: '2025-03-01',
    })
    expect(res.success).toBe(false)
    if (res.success) throw new Error('expected failure')
    // Zod is not used here — the service-level validator rejects it.
    expect(res.code).toBe('VALIDATION_ERROR')
  })

  it('C3: createCollection rejects revoked mandate', () => {
    const m = createMandate(db, {
      counterparty_id: customerId,
      mandate_reference: 'MND-REVOKED',
      signature_date: '2025-02-01',
      sequence_type: 'OOFF',
      iban: VALID_IBAN,
    })
    if (!m.success) throw new Error(m.error)
    revokeMandate(db, m.data.id)
    const res = createCollection(db, {
      fiscal_year_id: fyId,
      mandate_id: m.data.id,
      amount_ore: 10000,
      collection_date: '2025-03-01',
    })
    expect(res.success).toBe(false)
    if (res.success) throw new Error('expected failure')
    expect(res.code).toBe('VALIDATION_ERROR')
  })

  it('C4: createDirectDebitBatch happy path', () => {
    const c1 = createCollection(db, {
      fiscal_year_id: fyId,
      mandate_id: mandateId,
      amount_ore: 20000,
      collection_date: '2025-04-01',
    })
    const c2 = createCollection(db, {
      fiscal_year_id: fyId,
      mandate_id: mandateId,
      amount_ore: 30000,
      collection_date: '2025-04-01',
    })
    if (!c1.success || !c2.success) throw new Error('setup failed')

    const batch = createDirectDebitBatch(db, {
      fiscal_year_id: fyId,
      collection_ids: [c1.data.id, c2.data.id],
      payment_date: '2025-04-15',
      account_number: '1930',
    })
    expect(batch.success).toBe(true)
    if (!batch.success) throw new Error(batch.error)
    expect(batch.data.collection_count).toBe(2)

    // Verify batch_type in DB
    const row = db
      .prepare('SELECT batch_type FROM payment_batches WHERE id = ?')
      .get(batch.data.batch_id) as { batch_type: string }
    expect(row.batch_type).toBe('direct_debit')
  })

  it('C5: createDirectDebitBatch rejects already-batched collection', () => {
    const c = createCollection(db, {
      fiscal_year_id: fyId,
      mandate_id: mandateId,
      amount_ore: 15000,
      collection_date: '2025-05-01',
    })
    if (!c.success) throw new Error('setup failed')
    const b1 = createDirectDebitBatch(db, {
      fiscal_year_id: fyId,
      collection_ids: [c.data.id],
      payment_date: '2025-05-15',
      account_number: '1930',
    })
    if (!b1.success) throw new Error(b1.error)

    const b2 = createDirectDebitBatch(db, {
      fiscal_year_id: fyId,
      collection_ids: [c.data.id],
      payment_date: '2025-05-16',
      account_number: '1930',
    })
    expect(b2.success).toBe(false)
    if (b2.success) throw new Error('expected failure')
    expect(b2.code).toBe('VALIDATION_ERROR')
  })

  it('C6: createDirectDebitBatch rejects empty collections', () => {
    const res = createDirectDebitBatch(db, {
      fiscal_year_id: fyId,
      collection_ids: [],
      payment_date: '2025-05-15',
      account_number: '1930',
    })
    expect(res.success).toBe(false)
    if (res.success) throw new Error('expected failure')
    expect(res.code).toBe('VALIDATION_ERROR')
  })
})

describe('pain008-export-service', () => {
  let batchId: number

  beforeAll(() => {
    const m = createMandate(db, {
      counterparty_id: customerId,
      mandate_reference: 'MND-EXPORT',
      signature_date: '2025-02-01',
      sequence_type: 'RCUR',
      iban: VALID_IBAN,
      bic: VALID_BIC,
    })
    if (!m.success) throw new Error(m.error)

    const c = createCollection(db, {
      fiscal_year_id: fyId,
      mandate_id: m.data.id,
      amount_ore: 45000,
      collection_date: '2025-06-01',
    })
    if (!c.success) throw new Error(c.error)

    const b = createDirectDebitBatch(db, {
      fiscal_year_id: fyId,
      collection_ids: [c.data.id],
      payment_date: '2025-06-15',
      account_number: '1930',
    })
    if (!b.success) throw new Error(b.error)
    batchId = b.data.batch_id
  })

  it('E1: generatePain008 produces valid XML structure', () => {
    const res = generatePain008(db, batchId)
    expect(res.success).toBe(true)
    if (!res.success) throw new Error(res.error)
    const xml = res.data.xml
    expect(xml).toContain('<?xml')
    expect(xml).toContain('pain.008.001.02')
    expect(xml).toContain('CstmrDrctDbtInitn')
    expect(xml).toContain('GrpHdr')
    expect(xml).toContain('PmtInf')
    expect(xml).toContain('DrctDbtTxInf')
  })

  it('E2: pain.008 contains mandate reference (MndtId)', () => {
    const res = generatePain008(db, batchId)
    if (!res.success) throw new Error(res.error)
    expect(res.data.xml).toContain('<MndtId>MND-EXPORT</MndtId>')
  })

  it('E3: pain.008 contains IBAN', () => {
    const res = generatePain008(db, batchId)
    if (!res.success) throw new Error(res.error)
    expect(res.data.xml).toContain(`<IBAN>${VALID_IBAN}</IBAN>`)
  })

  it('E4: pain.008 contains correct amount (öre→kronor)', () => {
    const res = generatePain008(db, batchId)
    if (!res.success) throw new Error(res.error)
    // 45000 öre = 450.00 kr
    expect(res.data.xml).toContain('450.00')
  })

  it('E5: pain.008 filename has PAIN008 prefix', () => {
    const res = generatePain008(db, batchId)
    if (!res.success) throw new Error(res.error)
    expect(res.data.filename).toMatch(/^PAIN008_/)
    expect(res.data.filename).toContain('2025-06-15')
  })

  it('E6: generatePain008 fails for non-existent batch', () => {
    const res = generatePain008(db, 99999)
    expect(res.success).toBe(false)
    if (res.success) throw new Error('expected failure')
    expect(res.code).toBe('NOT_FOUND')
  })

  it('E7: generatePain008 fails for wrong batch_type', () => {
    // Create a plain invoice-batch
    db.prepare(
      `INSERT INTO payment_batches (fiscal_year_id, batch_type, payment_date, account_number, status)
       VALUES (?, 'invoice', '2025-07-01', '1930', 'completed')`,
    ).run(fyId)
    const invBatchId = (
      db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }
    ).id

    const res = generatePain008(db, invBatchId)
    expect(res.success).toBe(false)
    if (res.success) throw new Error('expected failure')
    expect(res.code).toBe('VALIDATION_ERROR')
  })

  it('E8: pain.008 groups collections by sequence_type', () => {
    // Create two mandates with different sequence types + collections,
    // then batch them together → two PmtInf blocks.
    const mFRST = createMandate(db, {
      counterparty_id: customerId,
      mandate_reference: 'MND-FRST',
      signature_date: '2025-02-01',
      sequence_type: 'FRST',
      iban: VALID_IBAN,
    })
    const mRCUR = createMandate(db, {
      counterparty_id: customerId,
      mandate_reference: 'MND-RCUR',
      signature_date: '2025-02-01',
      sequence_type: 'RCUR',
      iban: VALID_IBAN,
    })
    if (!mFRST.success || !mRCUR.success) throw new Error('setup failed')

    const c1 = createCollection(db, {
      fiscal_year_id: fyId,
      mandate_id: mFRST.data.id,
      amount_ore: 10000,
      collection_date: '2025-07-01',
    })
    const c2 = createCollection(db, {
      fiscal_year_id: fyId,
      mandate_id: mRCUR.data.id,
      amount_ore: 20000,
      collection_date: '2025-07-01',
    })
    if (!c1.success || !c2.success) throw new Error('setup failed')

    const b = createDirectDebitBatch(db, {
      fiscal_year_id: fyId,
      collection_ids: [c1.data.id, c2.data.id],
      payment_date: '2025-07-15',
      account_number: '1930',
    })
    if (!b.success) throw new Error(b.error)

    const res = generatePain008(db, b.data.batch_id)
    if (!res.success) throw new Error(res.error)
    // Two <PmtInf> blocks
    const pmtInfCount = (res.data.xml.match(/<PmtInf>/g) || []).length
    expect(pmtInfCount).toBe(2)
    expect(res.data.xml).toContain('<SeqTp>FRST</SeqTp>')
    expect(res.data.xml).toContain('<SeqTp>RCUR</SeqTp>')
  })
})

describe('listCollections + listDirectDebitBatches (Sprint U1.1)', () => {
  it('L1: listCollections returns empty array when none exist', async () => {
    const mod = await import('../src/main/services/payment/sepa-dd-service')
    const res = mod.listCollections(db, fyId)
    expect(res.success).toBe(true)
    if (res.success) expect(Array.isArray(res.data)).toBe(true)
  })

  it('L2: listCollections includes joined counterparty + mandate data', async () => {
    const mod = await import('../src/main/services/payment/sepa-dd-service')
    const m = createMandate(db, {
      counterparty_id: customerId,
      mandate_reference: 'LIST-M-1',
      signature_date: '2025-02-01',
      sequence_type: 'RCUR',
      iban: VALID_IBAN,
    })
    if (!m.success) throw new Error('mandate failed')
    const c = createCollection(db, {
      fiscal_year_id: fyId,
      mandate_id: m.data.id,
      amount_ore: 12500,
      collection_date: '2025-08-01',
    })
    if (!c.success) throw new Error('collection failed')

    const res = mod.listCollections(db, fyId)
    if (!res.success) throw new Error(res.error)
    const found = res.data.find((row) => row.id === c.data.id)
    expect(found).toBeDefined()
    expect(found?.mandate_reference).toBe('LIST-M-1')
    expect(found?.counterparty_name).toBe('Kund AB')
    expect(found?.counterparty_id).toBe(customerId)
    expect(found?.invoice_number).toBeNull()
  })

  it('L3: listDirectDebitBatches excludes non-direct-debit batches', async () => {
    const mod = await import('../src/main/services/payment/sepa-dd-service')
    db.prepare(
      `INSERT INTO payment_batches
       (fiscal_year_id, batch_type, payment_date, account_number, status)
       VALUES (?, 'invoice', '2025-09-01', '1930', 'completed')`,
    ).run(fyId)
    const res = mod.listDirectDebitBatches(db, fyId)
    if (!res.success) throw new Error(res.error)
    for (const b of res.data) {
      const row = db
        .prepare('SELECT batch_type FROM payment_batches WHERE id = ?')
        .get(b.id) as { batch_type: string } | undefined
      expect(row?.batch_type).toBe('direct_debit')
    }
  })

  it('L4: listDirectDebitBatches aggregates collection_count + total_amount_ore', async () => {
    const mod = await import('../src/main/services/payment/sepa-dd-service')
    const m = createMandate(db, {
      counterparty_id: customerId,
      mandate_reference: 'LIST-B-1',
      signature_date: '2025-02-01',
      sequence_type: 'RCUR',
      iban: VALID_IBAN,
    })
    if (!m.success) throw new Error('mandate failed')
    const c1 = createCollection(db, {
      fiscal_year_id: fyId,
      mandate_id: m.data.id,
      amount_ore: 40000,
      collection_date: '2025-09-01',
    })
    const c2 = createCollection(db, {
      fiscal_year_id: fyId,
      mandate_id: m.data.id,
      amount_ore: 60000,
      collection_date: '2025-09-01',
    })
    if (!c1.success || !c2.success) throw new Error('collections failed')
    const b = createDirectDebitBatch(db, {
      fiscal_year_id: fyId,
      collection_ids: [c1.data.id, c2.data.id],
      payment_date: '2025-09-15',
      account_number: '1930',
    })
    if (!b.success) throw new Error(b.error)

    const res = mod.listDirectDebitBatches(db, fyId)
    if (!res.success) throw new Error(res.error)
    const batch = res.data.find((row) => row.id === b.data.batch_id)
    expect(batch).toBeDefined()
    expect(batch?.collection_count).toBe(2)
    expect(batch?.total_amount_ore).toBe(100000)
    expect(batch?.account_number).toBe('1930')
  })

  it('L5: listDirectDebitBatches filters by fiscal_year_id', async () => {
    const mod = await import('../src/main/services/payment/sepa-dd-service')
    // fyId from beforeAll has batches; another FY should have none
    const res = mod.listDirectDebitBatches(db, 99999)
    expect(res.success).toBe(true)
    if (res.success) expect(res.data).toEqual([])
  })
})
