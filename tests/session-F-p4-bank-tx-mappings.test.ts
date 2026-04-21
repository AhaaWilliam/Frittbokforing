/**
 * Sprint F P4 — bank_tx_code_mappings CRUD + classifier-integration.
 *
 * Täcker migration 042, DB-driven classifier med cache, CRUD-service,
 * UNIQUE-mappning (M124), M153-determinism.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import {
  classifyBankFeeTx,
  invalidateClassifierCache,
  type BankTxInput,
} from '../src/main/services/bank/bank-fee-classifier'
import {
  listBankTxMappings,
  upsertBankTxMapping,
  deleteBankTxMapping,
} from '../src/main/services/bank/bank-tx-mapping-service'

let db: Database.Database

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  invalidateClassifierCache(db)
  db.close()
})

function tx(overrides: Partial<BankTxInput> = {}): BankTxInput {
  return {
    amount_ore: 0,
    counterparty_name: null,
    counterparty_iban: null,
    remittance_info: null,
    bank_tx_domain: null,
    bank_tx_family: null,
    bank_tx_subfamily: null,
    ...overrides,
  }
}

describe('Sprint F P4 — migration 042', () => {
  it('Migration 042 skapar bank_tx_code_mappings-tabellen med CHECK-constraint', () => {
    const schema = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='bank_tx_code_mappings'",
      )
      .get() as { sql: string } | undefined
    expect(schema).toBeDefined()
    expect(schema!.sql).toContain('UNIQUE')
    expect(schema!.sql).toContain('CHECK')
    expect(schema!.sql).toMatch(/'bank_fee'.*'interest'.*'ignore'/)
  })

  it('Seed-data: PMNT/CCRD/CHRG och PMNT/CCRD/INTR inserted', () => {
    const rows = db
      .prepare(
        `SELECT domain, family, subfamily, classification
         FROM bank_tx_code_mappings
         ORDER BY subfamily`,
      )
      .all() as Array<{
      domain: string
      family: string
      subfamily: string
      classification: string
    }>
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      domain: 'PMNT',
      family: 'CCRD',
      subfamily: 'CHRG',
      classification: 'bank_fee',
    })
    expect(rows[1]).toEqual({
      domain: 'PMNT',
      family: 'CCRD',
      subfamily: 'INTR',
      classification: 'interest',
    })
  })

  it('PRAGMA user_version är 44 efter migrations (Sprint F P4 + P6)', () => {
    const version = db.pragma('user_version', { simple: true }) as number
    expect(version).toBe(51)
  })
})

describe('Sprint F P4 — classifier läser från DB', () => {
  it('Classifier använder seed-mappning för CHRG', () => {
    const c = classifyBankFeeTx(
      db,
      tx({
        amount_ore: -5000,
        bank_tx_domain: 'PMNT',
        bank_tx_family: 'CCRD',
        bank_tx_subfamily: 'CHRG',
      }),
    )
    expect(c).not.toBeNull()
    expect(c!.type).toBe('bank_fee')
  })

  it('Ny mapping via upsert picks up av classifier efter invalidation', () => {
    // Ny bank-specifik kod (SBK = hypotetisk Swedbank-kod)
    const upsert = upsertBankTxMapping(db, {
      domain: 'PMNT',
      family: 'CCRD',
      subfamily: 'SBK',
      classification: 'bank_fee',
    })
    expect(upsert.success).toBe(true)

    const c = classifyBankFeeTx(
      db,
      tx({
        amount_ore: -2500,
        bank_tx_domain: 'PMNT',
        bank_tx_family: 'CCRD',
        bank_tx_subfamily: 'SBK',
      }),
    )
    expect(c).not.toBeNull()
    expect(c!.type).toBe('bank_fee')
  })

  it('Delete en seed-mapping → classifier returnerar null för den koden', () => {
    const list = listBankTxMappings(db)
    expect(list.success).toBe(true)
    if (!list.success) return
    const chrg = list.data.find((m) => m.subfamily === 'CHRG')!

    const del = deleteBankTxMapping(db, { id: chrg.id })
    expect(del.success).toBe(true)

    const c = classifyBankFeeTx(
      db,
      tx({
        amount_ore: -5000,
        bank_tx_domain: 'PMNT',
        bank_tx_family: 'CCRD',
        bank_tx_subfamily: 'CHRG',
      }),
    )
    expect(c).toBeNull()
  })

  it('ignore-klassificering → classifier returnerar null', () => {
    upsertBankTxMapping(db, {
      domain: 'PMNT',
      family: 'CCRD',
      subfamily: 'IGN',
      classification: 'ignore',
    })
    const c = classifyBankFeeTx(
      db,
      tx({
        amount_ore: -500,
        bank_tx_domain: 'PMNT',
        bank_tx_family: 'CCRD',
        bank_tx_subfamily: 'IGN',
      }),
    )
    expect(c).toBeNull()
  })
})

describe('Sprint F P4 — CRUD + UNIQUE (M124)', () => {
  it('UPSERT med dubbel (domain,family,subfamily) → VALIDATION_ERROR', () => {
    const first = upsertBankTxMapping(db, {
      domain: 'PMNT',
      family: 'CCRD',
      subfamily: 'XXX',
      classification: 'bank_fee',
    })
    expect(first.success).toBe(true)

    const dup = upsertBankTxMapping(db, {
      domain: 'PMNT',
      family: 'CCRD',
      subfamily: 'XXX',
      classification: 'interest',
    })
    expect(dup.success).toBe(false)
    if (dup.success) return
    expect(dup.code).toBe('VALIDATION_ERROR')
    expect(dup.field).toBe('subfamily')
  })

  it('UPSERT med existerande id → uppdaterar', () => {
    const list = listBankTxMappings(db)
    if (!list.success) throw new Error('list failed')
    const chrg = list.data.find((m) => m.subfamily === 'CHRG')!

    const upd = upsertBankTxMapping(db, {
      id: chrg.id,
      domain: chrg.domain,
      family: chrg.family,
      subfamily: chrg.subfamily,
      classification: 'ignore',
      account_number: null,
    })
    expect(upd.success).toBe(true)
    if (!upd.success) return
    expect(upd.data.classification).toBe('ignore')

    // Classifier ger nu null för denna kod (pga 'ignore')
    const c = classifyBankFeeTx(
      db,
      tx({
        amount_ore: -1000,
        bank_tx_domain: 'PMNT',
        bank_tx_family: 'CCRD',
        bank_tx_subfamily: 'CHRG',
      }),
    )
    expect(c).toBeNull()
  })

  it('UPSERT med okänt id → NOT_FOUND', () => {
    const r = upsertBankTxMapping(db, {
      id: 9999,
      domain: 'PMNT',
      family: 'CCRD',
      subfamily: 'ZZZ',
      classification: 'bank_fee',
    })
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('NOT_FOUND')
  })

  it('DELETE okänt id → NOT_FOUND', () => {
    const r = deleteBankTxMapping(db, { id: 9999 })
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('NOT_FOUND')
  })

  it('CHECK-constraint avvisar ogiltig classification via direkt SQL', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO bank_tx_code_mappings (domain, family, subfamily, classification)
         VALUES ('X','Y','Z','invalid_value')`,
      ).run()
    }).toThrow(/CHECK constraint/)
  })
})

describe('Sprint F P4 — M153 determinism', () => {
  it('Classifier ger identiskt output över upprepade anrop utan ändringar', () => {
    const input = tx({
      amount_ore: -5000,
      bank_tx_domain: 'PMNT',
      bank_tx_family: 'CCRD',
      bank_tx_subfamily: 'CHRG',
    })
    const first = JSON.stringify(classifyBankFeeTx(db, input))
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(classifyBankFeeTx(db, input))).toBe(first)
    }
  })

  it('Cache-invalidation är deterministisk: samma upsert → samma result', () => {
    const input = tx({
      amount_ore: -1000,
      bank_tx_domain: 'PMNT',
      bank_tx_family: 'CCRD',
      bank_tx_subfamily: 'CHRG',
    })
    const r1 = classifyBankFeeTx(db, input)
    upsertBankTxMapping(db, {
      domain: 'ANY',
      family: 'OTH',
      subfamily: 'X1',
      classification: 'bank_fee',
    })
    // Efter upsert är cachen invaliderad, men input är samma → samma output
    const r2 = classifyBankFeeTx(db, input)
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2))
  })
})
