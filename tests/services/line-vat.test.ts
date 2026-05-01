import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  loadVatCodeMap,
  computeLineVat,
  type VatCodeInfo,
} from '../../src/main/services/shared/line-vat'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE vat_codes (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL,
      rate_percent INTEGER NOT NULL,
      vat_type TEXT NOT NULL,
      vat_account TEXT
    )
  `)
  db.prepare(
    `INSERT INTO vat_codes (id, code, rate_percent, vat_type, vat_account) VALUES
     (1, 'OUT-25', 25, 'outgoing', '2611'),
     (2, 'OUT-12', 12, 'outgoing', '2621'),
     (3, 'OUT-6', 6, 'outgoing', '2631'),
     (4, 'OUT-0', 0, 'outgoing', NULL),
     (5, 'IN-25', 25, 'incoming', '2641'),
     (6, 'IN-12', 12, 'incoming', '2642')`,
  ).run()
})

afterEach(() => {
  db.close()
})

describe('loadVatCodeMap', () => {
  it('outgoing → alla koder med vatAccount=null (rate räcker för invoice)', () => {
    // Notera: outgoing-grenen filtrerar inte på vat_type — returnerar alla
    // koder men med vatAccount=null. Invoice-service behöver bara rate.
    const map = loadVatCodeMap(db, 'outgoing')
    expect(map.size).toBe(6)
    expect(map.get(1)?.rate).toBe(25)
    expect(map.get(1)?.vatAccount).toBeNull()
    expect(map.get(5)?.vatAccount).toBeNull() // även "incoming"-koder får null
  })

  it('incoming → 2 koder med korrekt vatAccount', () => {
    const map = loadVatCodeMap(db, 'incoming')
    expect(map.size).toBe(2)
    expect(map.get(5)?.rate).toBe(25)
    expect(map.get(5)?.vatAccount).toBe('2641')
    expect(map.get(6)?.vatAccount).toBe('2642')
  })

  it('all → båda riktningar (6 koder), vatAccount inkluderat', () => {
    const map = loadVatCodeMap(db, 'all')
    expect(map.size).toBe(6)
    expect(map.get(1)?.vatAccount).toBe('2611')
    expect(map.get(5)?.vatAccount).toBe('2641')
  })

  it('returnerar tom map om vat_codes är tom', () => {
    db.prepare('DELETE FROM vat_codes').run()
    expect(loadVatCodeMap(db, 'all').size).toBe(0)
  })
})

describe('computeLineVat', () => {
  function map(rate: number): Map<number, VatCodeInfo> {
    return new Map([[1, { rate, vatAccount: null }]])
  }

  it('25% av 100000 öre → 25000 öre', () => {
    expect(computeLineVat(map(25), 1, 100000)).toBe(25000)
  })

  it('12% av 100000 öre → 12000 öre', () => {
    expect(computeLineVat(map(12), 1, 100000)).toBe(12000)
  })

  it('0% → 0 (oavsett belopp)', () => {
    expect(computeLineVat(map(0), 1, 100000)).toBe(0)
  })

  it('avrundning vid fraktional rate-beräkning (25% av 333 = 83.25 → 83)', () => {
    expect(computeLineVat(map(25), 1, 333)).toBe(83)
  })

  it('avrundning vid 0.5 → uppåt (25% av 14 = 3.5 → 4)', () => {
    // Math.round(3.5) = 4 i JS (banker's rounding gäller inte för Math.round)
    expect(computeLineVat(map(25), 1, 14)).toBe(4)
  })

  it('okänd vatCodeId → 0 (defensivt)', () => {
    expect(computeLineVat(map(25), 999, 100000)).toBe(0)
  })

  it('lineTotalOre=0 → 0', () => {
    expect(computeLineVat(map(25), 1, 0)).toBe(0)
  })

  it('negativa belopp (kreditfakturor) hanteras', () => {
    expect(computeLineVat(map(25), 1, -100000)).toBe(-25000)
  })
})
