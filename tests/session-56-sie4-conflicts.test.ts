/**
 * Sprint 56 B1+B2: SIE4 import conflict-resolution.
 *
 * B1 (3 tests): detectAccountConflicts.
 * B2 (5 tests): conflict_resolutions i importSie4.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as iconv from 'iconv-lite'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { parseSie4 } from '../src/main/services/sie4/sie4-import-parser'
import {
  detectAccountConflicts,
  validateSieParseResult,
} from '../src/main/services/sie4/sie4-import-validator'
import { importSie4 } from '../src/main/services/sie4/sie4-import-service'

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

function buildSie4Buffer(lines: string[]): Buffer {
  const content = lines.join('\r\n') + '\r\n'
  return iconv.encode(content, 'cp437')
}

function seedExistingCompany(db: Database.Database, accountOverrides: Array<{ number: string; name: string }>): void {
  createCompany(db, {
    name: 'Konflikt AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 25_000_00,
    registration_date: '2025-01-01',
    fiscal_year_start: '2025-01-01',
    fiscal_year_end: '2025-12-31',
  })
  for (const o of accountOverrides) {
    db.prepare('UPDATE accounts SET name = ? WHERE account_number = ?').run(o.name, o.number)
  }
}

describe('S56 B1: detectAccountConflicts', () => {
  let db: Database.Database
  beforeEach(() => { db = createTestDb() })
  afterEach(() => { db.close() })

  it('1. Namnkonflikt vid merge → conflicts[] populerad', () => {
    seedExistingCompany(db, [{ number: '1930', name: 'Bank' }])
    const buf = buildSie4Buffer([
      '#FNAMN "Konflikt AB"',
      '#ORGNR 556036-0793',
      '#RAR 0 20250101 20251231',
      '#KONTO 1930 "Företagskonto"',
      '#KTYP 1930 T',
    ])
    const parsed = parseSie4(buf)
    const conflicts = detectAccountConflicts(db, parsed)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toMatchObject({
      account_number: '1930',
      existing_name: 'Bank',
      new_name: 'Företagskonto',
      referenced_by_entries: 0,
    })
  })

  it('2. Inga konflikter när namn matchar', () => {
    seedExistingCompany(db, [{ number: '1930', name: 'Bank' }])
    const buf = buildSie4Buffer([
      '#FNAMN "Konflikt AB"',
      '#ORGNR 556036-0793',
      '#RAR 0 20250101 20251231',
      '#KONTO 1930 "Bank"',
      '#KTYP 1930 T',
    ])
    const parsed = parseSie4(buf)
    expect(detectAccountConflicts(db, parsed)).toHaveLength(0)
  })

  it('3. referenced_by_entries räknar verifikat-rader korrekt', () => {
    seedExistingCompany(db, [{ number: '1930', name: 'Bank' }])
    const buf = buildSie4Buffer([
      '#FNAMN "Konflikt AB"',
      '#ORGNR 556036-0793',
      '#RAR 0 20250101 20251231',
      '#KONTO 1930 "Företagskonto"',
      '#KTYP 1930 T',
      '#KONTO 3001 "Försäljning"',
      '#KTYP 3001 I',
      '#VER A 1 20250115 "Test"',
      '{',
      '#TRANS 1930 {} 1000',
      '#TRANS 3001 {} -1000',
      '}',
      '#VER A 2 20250116 "Test2"',
      '{',
      '#TRANS 1930 {} 500',
      '#TRANS 3001 {} -500',
      '}',
    ])
    const parsed = parseSie4(buf)
    const conflicts = detectAccountConflicts(db, parsed)
    const c1930 = conflicts.find((c) => c.account_number === '1930')
    expect(c1930?.referenced_by_entries).toBe(2)
  })
})

describe('S56 B2: importSie4 conflict_resolutions', () => {
  let db: Database.Database
  beforeEach(() => { db = createTestDb() })
  afterEach(() => { db.close() })

  function makeBuf(extraLines: string[] = []): Buffer {
    return buildSie4Buffer([
      '#FNAMN "Konflikt AB"',
      '#ORGNR 556036-0793',
      '#RAR 0 20250101 20251231',
      '#KONTO 1930 "Företagskonto SIE"',
      '#KTYP 1930 T',
      '#KONTO 3001 "Försäljning SIE"',
      '#KTYP 3001 I',
      ...extraLines,
    ])
  }

  it('1. keep → existerande namn lämnas oförändrat', () => {
    seedExistingCompany(db, [{ number: '1930', name: 'Bank Original' }])
    const parsed = parseSie4(makeBuf())
    const r = importSie4(db, parsed, { strategy: 'merge', conflict_resolutions: { '1930': 'keep' } })
    expect(r.success).toBe(true)
    const row = db.prepare("SELECT name FROM accounts WHERE account_number='1930'").get() as { name: string }
    expect(row.name).toBe('Bank Original')
  })

  it('2. overwrite → namn uppdateras', () => {
    seedExistingCompany(db, [{ number: '1930', name: 'Bank Original' }])
    const parsed = parseSie4(makeBuf())
    const r = importSie4(db, parsed, { strategy: 'merge', conflict_resolutions: { '1930': 'overwrite' } })
    expect(r.success).toBe(true)
    const row = db.prepare("SELECT name FROM accounts WHERE account_number='1930'").get() as { name: string }
    expect(row.name).toBe('Företagskonto SIE')
  })

  it('3. skip på använt konto → VALIDATION_ERROR utan partial commit', () => {
    seedExistingCompany(db, [{ number: '1930', name: 'Bank Original' }])
    const parsed = parseSie4(makeBuf([
      '#VER A 1 20250115 "Test"',
      '{',
      '#TRANS 1930 {} 1000',
      '#TRANS 3001 {} -1000',
      '}',
    ]))
    const r = importSie4(db, parsed, { strategy: 'merge', conflict_resolutions: { '1930': 'skip' } })
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('VALIDATION_ERROR')
    // Inget partial commit: original-namn kvar
    const row = db.prepare("SELECT name FROM accounts WHERE account_number='1930'").get() as { name: string }
    expect(row.name).toBe('Bank Original')
    // Inga journal_entries skapade
    const entries = db.prepare('SELECT COUNT(*) AS c FROM journal_entries').get() as { c: number }
    expect(entries.c).toBe(0)
  })

  it('4. skip på oanvänt konto → OK', () => {
    seedExistingCompany(db, [{ number: '1930', name: 'Bank Original' }])
    // Filen har 1930 men inga verifikat refererar det
    const parsed = parseSie4(makeBuf())
    const r = importSie4(db, parsed, { strategy: 'merge', conflict_resolutions: { '1930': 'skip' } })
    expect(r.success).toBe(true)
    const row = db.prepare("SELECT name FROM accounts WHERE account_number='1930'").get() as { name: string }
    expect(row.name).toBe('Bank Original')
  })

  it('5. Saknad resolution defaultar till keep', () => {
    seedExistingCompany(db, [{ number: '1930', name: 'Bank Original' }])
    const parsed = parseSie4(makeBuf())
    // Ingen conflict_resolutions alls — alla konflikter defaultar till keep
    const r = importSie4(db, parsed, { strategy: 'merge' })
    expect(r.success).toBe(true)
    const row = db.prepare("SELECT name FROM accounts WHERE account_number='1930'").get() as { name: string }
    expect(row.name).toBe('Bank Original')
  })
})

describe('S56 B1: validator returnerar conflicts:[] (kompatibilitet)', () => {
  it('validateSieParseResult returnerar conflicts:[] (parse-only)', () => {
    const buf = buildSie4Buffer([
      '#FNAMN "X"',
      '#ORGNR 556036-0793',
      '#RAR 0 20250101 20251231',
      '#KONTO 1930 "Bank"',
      '#KTYP 1930 T',
    ])
    const parsed = parseSie4(buf)
    const v = validateSieParseResult(parsed)
    expect(v.conflicts).toEqual([])
  })
})
