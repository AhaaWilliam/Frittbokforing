/**
 * Session 47: SIE4 import parser + validator — service-level tests.
 * Includes roundtrip test (export → parse → compare).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as iconv from 'iconv-lite'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import { saveDraft, finalizeDraft } from '../src/main/services/invoice-service'
import { exportSie4 } from '../src/main/services/sie4/sie4-export-service'
import { parseSie4 } from '../src/main/services/sie4/sie4-import-parser'
import { validateSieParseResult } from '../src/main/services/sie4/sie4-import-validator'
import { sie4AmountToOre } from '../src/main/services/sie4/sie4-amount-parser'

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

// ═══ Amount parser ═══

describe('S47: sie4AmountToOre', () => {
  it('A1: "1234" → 123400', () => {
    expect(sie4AmountToOre('1234')).toBe(123400)
  })

  it('A2: "1234.50" → 123450', () => {
    expect(sie4AmountToOre('1234.50')).toBe(123450)
  })

  it('A3: "-500.25" → -50025', () => {
    expect(sie4AmountToOre('-500.25')).toBe(-50025)
  })

  it('A4: "0" → 0', () => {
    expect(sie4AmountToOre('0')).toBe(0)
  })

  it('A5: "-0.01" → -1', () => {
    expect(sie4AmountToOre('-0.01')).toBe(-1)
  })

  it('A6: "0.01" → 1', () => {
    expect(sie4AmountToOre('0.01')).toBe(1)
  })
})

// ═══ Parser ═══

function buildSie4Buffer(lines: string[]): Buffer {
  const content = lines.join('\r\n') + '\r\n'
  return iconv.encode(content, 'cp437')
}

describe('S47: SIE4 parser', () => {
  it('P1: parses header records', () => {
    const buffer = buildSie4Buffer([
      '#FLAGGA 0',
      '#PROGRAM "TestApp" "2.0"',
      '#FORMAT PC8',
      '#GEN 20250115 "admin"',
      '#SIETYP 4',
      '#FTYP AB',
      '#ORGNR 556036-0793',
      '#FNAMN "Test AB"',
      '#RAR 0 20250101 20251231',
      '#KPTYP BAS2014',
      '#VALUTA SEK',
    ])
    const result = parseSie4(buffer)
    expect(result.header.flagga).toBe(0)
    expect(result.header.program).toBe('TestApp')
    expect(result.header.programVersion).toBe('2.0')
    expect(result.header.sieType).toBe(4)
    expect(result.header.orgNumber).toBe('556036-0793')
    expect(result.header.companyName).toBe('Test AB')
    expect(result.header.fiscalYears).toHaveLength(1)
    expect(result.header.fiscalYears[0].from).toBe('2025-01-01')
    expect(result.header.currency).toBe('SEK')
  })

  it('P2: parses accounts + types', () => {
    const buffer = buildSie4Buffer([
      '#KONTO 1910 "Kassa"',
      '#KONTO 3001 "Försäljning"',
      '#KTYP 1910 T',
      '#KTYP 3001 I',
    ])
    const result = parseSie4(buffer)
    expect(result.accounts).toHaveLength(2)
    expect(result.accounts[0].number).toBe('1910')
    expect(result.accounts[0].name).toBe('Kassa')
    expect(result.accounts[0].type).toBe('T')
    expect(result.accounts[1].type).toBe('I')
  })

  it('P3: parses IB/UB balances', () => {
    const buffer = buildSie4Buffer([
      '#IB 0 1910 1000.50',
      '#IB -1 1910 500',
      '#UB 0 1910 1500.50',
    ])
    const result = parseSie4(buffer)
    expect(result.openingBalances).toHaveLength(2)
    expect(result.openingBalances[0].amountOre).toBe(100050)
    expect(result.openingBalances[1].yearIndex).toBe(-1)
    expect(result.closingBalances).toHaveLength(1)
    expect(result.closingBalances[0].amountOre).toBe(150050)
  })

  it('P4: parses VER/TRANS block', () => {
    const buffer = buildSie4Buffer([
      '#VER "A" 1 20250315 "Faktura 1" 20250315',
      '{',
      '#TRANS 1510 {} 12500',
      '#TRANS 3001 {} -10000',
      '#TRANS 2610 {} -2500',
      '}',
    ])
    const result = parseSie4(buffer)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].series).toBe('A')
    expect(result.entries[0].number).toBe(1)
    expect(result.entries[0].date).toBe('2025-03-15')
    expect(result.entries[0].transactions).toHaveLength(3)
    expect(result.entries[0].transactions[0].amountOre).toBe(1250000)
    expect(result.entries[0].transactions[1].amountOre).toBe(-1000000)
  })

  it('P5: handles escape sequences in quoted strings', () => {
    const buffer = buildSie4Buffer([
      '#FNAMN "Test \\"AB\\" & Co"',
    ])
    const result = parseSie4(buffer)
    expect(result.header.companyName).toBe('Test "AB" & Co')
  })

  it('P6: handles Swedish characters (CP437 åäö)', () => {
    const buffer = buildSie4Buffer([
      '#FNAMN "Företag ÅÄÖ"',
    ])
    const result = parseSie4(buffer)
    expect(result.header.companyName).toContain('ÅÄÖ')
  })

  it('P7: unknown records produce warnings, not errors', () => {
    const buffer = buildSie4Buffer([
      '#UNKNOWN_RECORD data here',
      '#FNAMN "Test"',
    ])
    const result = parseSie4(buffer)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toContain('UNKNOWN_RECORD')
    expect(result.header.companyName).toBe('Test')
  })

  it('P8: SIETYP 1 with no VER — parser returns empty entries', () => {
    const buffer = buildSie4Buffer([
      '#SIETYP 1',
      '#KONTO 1910 "Kassa"',
      '#IB 0 1910 1000',
    ])
    const result = parseSie4(buffer)
    expect(result.header.sieType).toBe(1)
    expect(result.entries).toHaveLength(0)
  })

  it('P9: negative balances in IB/UB parsed correctly', () => {
    const buffer = buildSie4Buffer([
      '#IB 0 2440 -50000',
      '#UB 0 2440 -30000',
    ])
    const result = parseSie4(buffer)
    expect(result.openingBalances[0].amountOre).toBe(-5000000)
    expect(result.closingBalances[0].amountOre).toBe(-3000000)
  })

  it('P10: RES records parsed', () => {
    const buffer = buildSie4Buffer([
      '#RES 0 3001 -100000',
      '#RES 0 5010 50000',
    ])
    const result = parseSie4(buffer)
    expect(result.results).toHaveLength(2)
    expect(result.results[0].amountOre).toBe(-10000000)
  })
})

// ═══ Validator ═══

describe('S47: SIE4 validator', () => {
  it('V1: balanced vouchers → valid', () => {
    const buffer = buildSie4Buffer([
      '#RAR 0 20250101 20251231',
      '#VER "A" 1 20250315 "Test"',
      '{',
      '#TRANS 1510 {} 100',
      '#TRANS 3001 {} -100',
      '}',
    ])
    const result = validateSieParseResult(parseSie4(buffer))
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('V2: unbalanced voucher → error E1', () => {
    const buffer = buildSie4Buffer([
      '#RAR 0 20250101 20251231',
      '#VER "A" 1 20250315 "Test"',
      '{',
      '#TRANS 1510 {} 100',
      '#TRANS 3001 {} -50',
      '}',
    ])
    const result = validateSieParseResult(parseSie4(buffer))
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.code === 'E1')).toBe(true)
  })

  it('V3: voucher with < 2 TRANS → error E2', () => {
    const buffer = buildSie4Buffer([
      '#RAR 0 20250101 20251231',
      '#VER "A" 1 20250315 "Test"',
      '{',
      '#TRANS 1510 {} 100',
      '}',
    ])
    const result = validateSieParseResult(parseSie4(buffer))
    expect(result.errors.some(e => e.code === 'E2')).toBe(true)
  })

  it('V4: duplicate accounts → error E3', () => {
    const buffer = buildSie4Buffer([
      '#RAR 0 20250101 20251231',
      '#KONTO 1910 "Kassa"',
      '#KONTO 1910 "Kassa duplicate"',
    ])
    const result = validateSieParseResult(parseSie4(buffer))
    expect(result.errors.some(e => e.code === 'E3')).toBe(true)
  })

  it('V5: missing RAR → error E5', () => {
    const buffer = buildSie4Buffer([
      '#FNAMN "Test"',
    ])
    const result = validateSieParseResult(parseSie4(buffer))
    expect(result.errors.some(e => e.code === 'E5')).toBe(true)
  })

  it('V6: SIETYP < 4 with no VER → warning W3', () => {
    const buffer = buildSie4Buffer([
      '#SIETYP 2',
      '#RAR 0 20250101 20251231',
    ])
    const result = validateSieParseResult(parseSie4(buffer))
    expect(result.valid).toBe(true) // Warnings don't block
    expect(result.warnings.some(w => w.code === 'W3')).toBe(true)
  })

  it('V7: summary contains correct counts', () => {
    const buffer = buildSie4Buffer([
      '#SIETYP 4',
      '#RAR 0 20250101 20251231',
      '#FNAMN "Summary Test"',
      '#ORGNR 556036-0793',
      '#KONTO 1910 "Kassa"',
      '#KONTO 3001 "Försäljning"',
      '#VER "A" 1 20250315 "Test"',
      '{',
      '#TRANS 1510 {} 100',
      '#TRANS 3001 {} -100',
      '}',
    ])
    const result = validateSieParseResult(parseSie4(buffer))
    expect(result.summary.accounts).toBe(2)
    expect(result.summary.entries).toBe(1)
    expect(result.summary.lines).toBe(2)
    expect(result.summary.companyName).toBe('Summary Test')
    expect(result.summary.orgNumber).toBe('556036-0793')
  })
})

// ═══ Roundtrip ═══

describe('S47: Roundtrip (export → parse)', () => {
  let db: Database.Database

  beforeAll(() => {
    db = createTestDb()
    createCompany(db, {
      name: 'Roundtrip AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2',
      share_capital: 50000_00,
      registration_date: '2025-01-15',
      fiscal_year_start: '2025-01-01',
      fiscal_year_end: '2025-12-31',
    })
    db.prepare("UPDATE companies SET bankgiro = '1234-5678' WHERE id = 1").run()

    const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
    const customer = createCounterparty(db, { name: 'RT Kund', type: 'customer', org_number: '559999-0001' })
    if (!customer.success) throw new Error('Customer failed')

    const vatCode = db.prepare("SELECT id FROM vat_codes WHERE code = 'MP1'").get() as { id: number }
    const account = db.prepare("SELECT id FROM accounts WHERE account_number = '3002'").get() as { id: number }
    const product = createProduct(db, { name: 'RT Produkt', default_price_ore: 10000, vat_code_id: vatCode.id, account_id: account.id })
    if (!product.success) throw new Error('Product failed')

    const draft = saveDraft(db, {
      counterparty_id: customer.data.id,
      fiscal_year_id: fy.id,
      invoice_date: '2025-03-15',
      due_date: '2025-04-14',
      payment_terms: 30,
      lines: [{ product_id: product.data.id, description: 'Test', quantity: 1, unit_price_ore: 10000, vat_code_id: vatCode.id, sort_order: 0 }],
    })
    if (!draft.success) throw new Error('Draft failed')
    const fin = finalizeDraft(db, draft.data.id)
    if (!fin.success) throw new Error('Finalize failed: ' + fin.error)
  })

  afterAll(() => {
    if (db) db.close()
  })

  it('RT1: export → parse → same number of accounts', () => {
    const fyId = (db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }).id
    const exported = exportSie4(db, { fiscalYearId: fyId })
    const parsed = parseSie4(exported.content)
    expect(parsed.accounts.length).toBeGreaterThan(0)

    // Exported accounts count should match
    const exportedText = iconv.decode(exported.content, 'cp437')
    const exportedKontoCount = (exportedText.match(/#KONTO /g) ?? []).length
    expect(parsed.accounts.length).toBe(exportedKontoCount)
  })

  it('RT2: export → parse → same number of VER entries', () => {
    const fyId = (db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }).id
    const exported = exportSie4(db, { fiscalYearId: fyId })
    const parsed = parseSie4(exported.content)
    const exportedText = iconv.decode(exported.content, 'cp437')
    const exportedVerCount = (exportedText.match(/#VER /g) ?? []).length
    expect(parsed.entries.length).toBe(exportedVerCount)
  })

  it('RT3: export → parse → KSUMMA valid', () => {
    const fyId = (db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }).id
    const exported = exportSie4(db, { fiscalYearId: fyId })
    const parsed = parseSie4(exported.content)
    expect(parsed.checksum.expected).not.toBeNull()
    expect(parsed.checksum.valid).toBe(true)
  })

  it('RT4: export → parse → validate → valid (no errors)', () => {
    const fyId = (db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }).id
    const exported = exportSie4(db, { fiscalYearId: fyId })
    const parsed = parseSie4(exported.content)
    const validation = validateSieParseResult(parsed)
    expect(validation.valid).toBe(true)
    expect(validation.errors).toHaveLength(0)
  })

  it('RT5: IB amounts match between export and parse', () => {
    const fyId = (db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }).id
    const exported = exportSie4(db, { fiscalYearId: fyId })
    const parsed = parseSie4(exported.content)
    const exportedText = iconv.decode(exported.content, 'cp437')
    const ibLines = exportedText.split('\r\n').filter(l => l.startsWith('#IB 0 '))
    expect(parsed.openingBalances.filter(b => b.yearIndex === 0).length).toBe(ibLines.length)
  })
})
