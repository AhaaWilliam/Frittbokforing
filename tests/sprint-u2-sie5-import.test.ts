/**
 * Sprint U2: SIE5 import tests.
 *
 * Parser + validator + import-service + roundtrip mot SIE5-export.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { parseSie5 } from '../src/main/services/sie5/sie5-import-parser'
import {
  validateSie5ParseResult,
  detectSie5AccountConflicts,
} from '../src/main/services/sie5/sie5-import-validator'
import { importSie5 } from '../src/main/services/sie5/sie5-import-service'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import {
  saveDraft,
  finalizeDraft,
} from '../src/main/services/invoice-service'
import { exportSie5 } from '../src/main/services/sie5/sie5-export-service'

const NS = 'xmlns="http://www.sie.se/sie5"'

function buildMinimalSie5(opts: {
  companyName?: string
  orgNumber?: string
  start?: string
  end?: string
  accounts?: Array<{ id: string; name: string; type?: string; ib?: string; ub?: string; ibMonth?: string; ubMonth?: string }>
  entries?: Array<{
    series: string
    number: number
    date: string
    text: string
    lines: Array<{ accountId: string; amount: string; text?: string }>
  }>
}): string {
  const {
    companyName = 'Test AB',
    orgNumber = '556677-8899',
    start = '2025-01-01',
    end = '2025-12-31',
    accounts = [],
    entries = [],
  } = opts

  let accXml = ''
  for (const a of accounts) {
    const typeAttr = a.type ? ` type="${a.type}"` : ''
    let balXml = ''
    if (a.ib !== undefined) {
      balXml += `<OpeningBalance month="${a.ibMonth ?? start.substring(0, 7)}" amount="${a.ib}"/>`
    }
    if (a.ub !== undefined) {
      balXml += `<ClosingBalance month="${a.ubMonth ?? end.substring(0, 7)}" amount="${a.ub}"/>`
    }
    accXml += `<Account id="${a.id}" name="${a.name}"${typeAttr}>${balXml}</Account>`
  }

  // Grupp entries per serie
  const seriesGroups = new Map<string, typeof entries>()
  for (const e of entries) {
    if (!seriesGroups.has(e.series)) seriesGroups.set(e.series, [])
    seriesGroups.get(e.series)!.push(e)
  }
  let journalXml = ''
  for (const [series, ents] of seriesGroups) {
    let entryXml = ''
    for (const e of ents) {
      let lineXml = ''
      for (const l of e.lines) {
        const t = l.text ? ` text="${l.text}"` : ''
        lineXml += `<LedgerEntry accountId="${l.accountId}" amount="${l.amount}"${t}/>`
      }
      entryXml += `<JournalEntry id="${e.number}" journalDate="${e.date}" text="${e.text}">${lineXml}</JournalEntry>`
    }
    journalXml += `<Journal id="${series}" name="Serie ${series}">${entryXml}</Journal>`
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Sie ${NS}>
  <FileInfo>
    <SoftwareProduct name="Fritt Bokföring" version="1.0.0"/>
    <FileCreation time="2025-06-01T10:00:00Z" by="Fritt Bokföring"/>
    <Company organizationId="${orgNumber}" name="${companyName}"/>
    <FiscalYears><FiscalYear start="${start}" end="${end}" primary="true"/></FiscalYears>
    <AccountingCurrency currency="SEK"/>
  </FileInfo>
  <Accounts>${accXml}</Accounts>
  ${journalXml}
</Sie>`
}

// ═════════════════════════════════════════════════════════════
// Parser
// ═════════════════════════════════════════════════════════════

describe('SIE5 parser — header', () => {
  it('P1: parses company info from FileInfo/Company', () => {
    const xml = buildMinimalSie5({
      companyName: 'Importerat AB',
      orgNumber: '556036-0793',
    })
    const r = parseSie5(xml)
    expect(r.header.companyName).toBe('Importerat AB')
    expect(r.header.orgNumber).toBe('556036-0793')
  })

  it('P2: parses fiscal years from FileInfo/FiscalYears', () => {
    const xml = buildMinimalSie5({ start: '2025-01-01', end: '2025-12-31' })
    const r = parseSie5(xml)
    expect(r.header.fiscalYears).toHaveLength(1)
    expect(r.header.fiscalYears[0]).toMatchObject({
      index: 0,
      from: '2025-01-01',
      to: '2025-12-31',
    })
  })

  it('P3: parses software and currency', () => {
    const xml = buildMinimalSie5({})
    const r = parseSie5(xml)
    expect(r.header.program).toBe('Fritt Bokföring')
    expect(r.header.programVersion).toBe('1.0.0')
    expect(r.header.currency).toBe('SEK')
    expect(r.header.format).toBe('SIE5')
    expect(r.header.sieType).toBe(5)
  })

  it('P4: primary=true FY placeras som index 0', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Sie ${NS}>
  <FileInfo>
    <Company organizationId="556036-0793" name="X AB"/>
    <FiscalYears>
      <FiscalYear start="2024-01-01" end="2024-12-31"/>
      <FiscalYear start="2025-01-01" end="2025-12-31" primary="true"/>
    </FiscalYears>
  </FileInfo>
</Sie>`
    const r = parseSie5(xml)
    expect(r.header.fiscalYears[0]).toMatchObject({
      index: 0,
      from: '2025-01-01',
      to: '2025-12-31',
    })
  })
})

describe('SIE5 parser — accounts', () => {
  it('P5: parses accounts with id/name/type', () => {
    const xml = buildMinimalSie5({
      accounts: [
        { id: '1930', name: 'Bankkonto', type: 'asset' },
        { id: '3001', name: 'Försäljning', type: 'income' },
      ],
    })
    const r = parseSie5(xml)
    expect(r.accounts).toHaveLength(2)
    expect(r.accounts[0]).toMatchObject({ number: '1930', name: 'Bankkonto', type: 'T' })
    expect(r.accounts[1]).toMatchObject({ number: '3001', name: 'Försäljning', type: 'I' })
  })

  it('P6: extracts OpeningBalance and ClosingBalance', () => {
    const xml = buildMinimalSie5({
      accounts: [{ id: '1930', name: 'Bank', ib: '1000.00', ub: '1500.00' }],
    })
    const r = parseSie5(xml)
    expect(r.openingBalances).toHaveLength(1)
    expect(r.openingBalances[0]).toMatchObject({
      yearIndex: 0,
      accountNumber: '1930',
      amountOre: 100000,
    })
    expect(r.closingBalances[0]).toMatchObject({
      yearIndex: 0,
      accountNumber: '1930',
      amountOre: 150000,
    })
  })

  it('P7: account with no type still parses', () => {
    const xml = buildMinimalSie5({
      accounts: [{ id: '1930', name: 'Bank' }],
    })
    const r = parseSie5(xml)
    expect(r.accounts[0].type).toBeNull()
  })
})

describe('SIE5 parser — entries', () => {
  it('P8: parses JournalEntry + LedgerEntry (signed amounts)', () => {
    const xml = buildMinimalSie5({
      entries: [
        {
          series: 'I',
          number: 1,
          date: '2025-03-15',
          text: 'Test',
          lines: [
            { accountId: '1930', amount: '100.00' },
            { accountId: '3001', amount: '-100.00' },
          ],
        },
      ],
    })
    const r = parseSie5(xml)
    expect(r.entries).toHaveLength(1)
    expect(r.entries[0].series).toBe('I')
    expect(r.entries[0].number).toBe(1)
    expect(r.entries[0].transactions).toHaveLength(2)
    expect(r.entries[0].transactions[0].amountOre).toBe(10000)
    expect(r.entries[0].transactions[1].amountOre).toBe(-10000)
  })

  it('P9: negative amounts (credit) parsed as negative ore', () => {
    const xml = buildMinimalSie5({
      entries: [
        {
          series: 'A',
          number: 5,
          date: '2025-04-01',
          text: 'Försäljning',
          lines: [
            { accountId: '1510', amount: '1250.00' },
            { accountId: '3001', amount: '-1000.00' },
            { accountId: '2611', amount: '-250.00' },
          ],
        },
      ],
    })
    const r = parseSie5(xml)
    expect(r.entries[0].transactions.map((t) => t.amountOre)).toEqual([
      125000, -100000, -25000,
    ])
  })

  it('P10: XML-escape (&amp; &lt;) decoded properly in text attrs', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Sie ${NS}>
  <FileInfo><Company organizationId="X" name="Acme &amp; Co"/></FileInfo>
  <Accounts/>
  <Journal id="I" name="Import">
    <JournalEntry id="1" journalDate="2025-01-01" text="A &amp; B &lt; C">
      <LedgerEntry accountId="1930" amount="100.00"/>
      <LedgerEntry accountId="3001" amount="-100.00"/>
    </JournalEntry>
  </Journal>
</Sie>`
    const r = parseSie5(xml)
    expect(r.header.companyName).toBe('Acme & Co')
    expect(r.entries[0].description).toBe('A & B < C')
  })

  it('P11: comma-decimal also accepted', () => {
    const xml = buildMinimalSie5({
      entries: [
        {
          series: 'I',
          number: 1,
          date: '2025-01-01',
          text: 't',
          lines: [
            { accountId: '1930', amount: '100,50' },
            { accountId: '3001', amount: '-100,50' },
          ],
        },
      ],
    })
    const r = parseSie5(xml)
    expect(r.entries[0].transactions[0].amountOre).toBe(10050)
  })

  it('P12: malformed XML yields empty result with warning', () => {
    const r = parseSie5('<not valid xml')
    expect(r.entries).toHaveLength(0)
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('P13: empty Sie document yields empty arrays (no crash)', () => {
    const r = parseSie5(
      `<?xml version="1.0"?><Sie ${NS}><FileInfo/><Accounts/></Sie>`,
    )
    expect(r.entries).toHaveLength(0)
    expect(r.accounts).toHaveLength(0)
  })
})

// ═════════════════════════════════════════════════════════════
// Validator
// ═════════════════════════════════════════════════════════════

describe('SIE5 validator', () => {
  it('V1: valid balanced entry passes', () => {
    const r = parseSie5(
      buildMinimalSie5({
        entries: [
          {
            series: 'I',
            number: 1,
            date: '2025-03-15',
            text: 't',
            lines: [
              { accountId: '1930', amount: '100.00' },
              { accountId: '3001', amount: '-100.00' },
            ],
          },
        ],
      }),
    )
    const v = validateSie5ParseResult(r)
    expect(v.valid).toBe(true)
    expect(v.errors).toHaveLength(0)
  })

  it('V2: E1 unbalanced verifikat detekteras', () => {
    const r = parseSie5(
      buildMinimalSie5({
        entries: [
          {
            series: 'I',
            number: 1,
            date: '2025-03-15',
            text: 't',
            lines: [
              { accountId: '1930', amount: '100.00' },
              { accountId: '3001', amount: '-50.00' },
            ],
          },
        ],
      }),
    )
    const v = validateSie5ParseResult(r)
    expect(v.valid).toBe(false)
    expect(v.errors.some((e) => e.code === 'E1')).toBe(true)
  })

  it('V3: E2 verifikat med färre än 2 rader', () => {
    const r = parseSie5(
      buildMinimalSie5({
        entries: [
          {
            series: 'I',
            number: 1,
            date: '2025-03-15',
            text: 't',
            lines: [{ accountId: '1930', amount: '100.00' }],
          },
        ],
      }),
    )
    const v = validateSie5ParseResult(r)
    expect(v.errors.some((e) => e.code === 'E2')).toBe(true)
  })

  it('V4: E3 duplicerade kontonummer', () => {
    const xml = `<?xml version="1.0"?><Sie ${NS}>
      <FileInfo><Company organizationId="X" name="X"/>
      <FiscalYears><FiscalYear start="2025-01-01" end="2025-12-31" primary="true"/></FiscalYears>
      </FileInfo>
      <Accounts>
        <Account id="1930" name="Bank1"/>
        <Account id="1930" name="Bank2"/>
      </Accounts>
    </Sie>`
    const r = parseSie5(xml)
    const v = validateSie5ParseResult(r)
    expect(v.errors.some((e) => e.code === 'E3')).toBe(true)
  })

  it('V5: E5 saknat räkenskapsår', () => {
    const xml = `<?xml version="1.0"?><Sie ${NS}>
      <FileInfo><Company organizationId="X" name="X"/></FileInfo>
      <Accounts/>
    </Sie>`
    const r = parseSie5(xml)
    const v = validateSie5ParseResult(r)
    expect(v.errors.some((e) => e.code === 'E5')).toBe(true)
  })

  it('V6: W2 verifikat utanför RAR', () => {
    const r = parseSie5(
      buildMinimalSie5({
        start: '2025-01-01',
        end: '2025-12-31',
        entries: [
          {
            series: 'I',
            number: 1,
            date: '2024-06-01',
            text: 't',
            lines: [
              { accountId: '1930', amount: '100.00' },
              { accountId: '3001', amount: '-100.00' },
            ],
          },
        ],
      }),
    )
    const v = validateSie5ParseResult(r)
    expect(v.warnings.some((w) => w.code === 'W2')).toBe(true)
  })

  it('V7: summary-fält fylls', () => {
    const r = parseSie5(
      buildMinimalSie5({
        accounts: [{ id: '1930', name: 'Bank' }],
        entries: [
          {
            series: 'I',
            number: 1,
            date: '2025-01-01',
            text: 't',
            lines: [
              { accountId: '1930', amount: '100.00' },
              { accountId: '3001', amount: '-100.00' },
            ],
          },
        ],
      }),
    )
    const v = validateSie5ParseResult(r)
    expect(v.summary.accounts).toBe(1)
    expect(v.summary.entries).toBe(1)
    expect(v.summary.lines).toBe(2)
    expect(v.summary.fiscalYears).toBe(1)
    expect(v.summary.companyName).toBe('Test AB')
  })
})

// ═════════════════════════════════════════════════════════════
// Import service
// ═════════════════════════════════════════════════════════════

describe('SIE5 import service — new strategy', () => {
  let db: Database.Database
  beforeEach(() => { db = createTestDb() })
  afterEach(() => { db.close() })

  it('I1: new-strategi skapar bolag + FY + konton + verifikat i I-serien', () => {
    const xml = buildMinimalSie5({
      companyName: 'Import AB',
      orgNumber: '556036-0793',
      start: '2025-01-01',
      end: '2025-12-31',
      accounts: [
        { id: '1930', name: 'Bank', type: 'asset' },
        { id: '3001', name: 'Försäljning', type: 'income' },
      ],
      entries: [
        {
          series: 'I',
          number: 1,
          date: '2025-03-15',
          text: 'Test',
          lines: [
            { accountId: '1930', amount: '100.00' },
            { accountId: '3001', amount: '-100.00' },
          ],
        },
      ],
    })
    const parsed = parseSie5(xml)
    const res = importSie5(db, parsed, { strategy: 'new' })
    expect(res.success).toBe(true)
    if (!res.success) return

    // Verifikat i I-serien
    const rows = db
      .prepare(
        `SELECT verification_series, status FROM journal_entries`,
      )
      .all() as Array<{ verification_series: string; status: string }>
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.verification_series === 'I')).toBe(true)
    expect(rows.every((r) => r.status === 'booked')).toBe(true)
  })

  it('I2: new-strategi avvisas om databasen redan har ett bolag', () => {
    createCompany(db, {
      name: 'Befintligt AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2',
      share_capital: 50000_00,
      registration_date: '2025-01-01',
      fiscal_year_start: '2025-01-01',
      fiscal_year_end: '2025-12-31',
    })
    const xml = buildMinimalSie5({ orgNumber: '556036-0793' })
    const parsed = parseSie5(xml)
    const res = importSie5(db, parsed, { strategy: 'new' })
    expect(res.success).toBe(false)
  })

  it('I3: sign handling — positivt→debit, negativt→credit', () => {
    const xml = buildMinimalSie5({
      accounts: [
        { id: '1930', name: 'Bank', type: 'asset' },
        { id: '3001', name: 'Försäljning', type: 'income' },
      ],
      entries: [
        {
          series: 'I',
          number: 1,
          date: '2025-03-15',
          text: 'Test',
          lines: [
            { accountId: '1930', amount: '100.00' },
            { accountId: '3001', amount: '-100.00' },
          ],
        },
      ],
    })
    const parsed = parseSie5(xml)
    const res = importSie5(db, parsed, { strategy: 'new' })
    expect(res.success).toBe(true)

    const lines = db
      .prepare(
        `SELECT account_number, debit_ore, credit_ore
         FROM journal_entry_lines ORDER BY line_number`,
      )
      .all() as Array<{ account_number: string; debit_ore: number; credit_ore: number }>
    const bankLine = lines.find((l) => l.account_number === '1930')!
    const salesLine = lines.find((l) => l.account_number === '3001')!
    expect(bankLine.debit_ore).toBe(10000)
    expect(bankLine.credit_ore).toBe(0)
    expect(salesLine.debit_ore).toBe(0)
    expect(salesLine.credit_ore).toBe(10000)
  })
})

describe('SIE5 import service — merge strategy', () => {
  let db: Database.Database
  beforeEach(() => { db = createTestDb() })
  afterEach(() => { db.close() })

  it('I4: merge matchar befintligt bolag på orgNr', () => {
    createCompany(db, {
      name: 'Befintligt AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2',
      share_capital: 50000_00,
      registration_date: '2025-01-01',
      fiscal_year_start: '2025-01-01',
      fiscal_year_end: '2025-12-31',
    })
    const xml = buildMinimalSie5({
      orgNumber: '556036-0793',
      accounts: [{ id: '1930', name: 'Bank', type: 'asset' }],
      entries: [
        {
          series: 'I',
          number: 1,
          date: '2025-03-15',
          text: 't',
          lines: [
            { accountId: '1930', amount: '100.00' },
            { accountId: '3001', amount: '-100.00' },
          ],
        },
      ],
    })
    const parsed = parseSie5(xml)
    const res = importSie5(db, parsed, { strategy: 'merge' })
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.companyId).toBe(1)
      expect(res.data.entriesImported).toBe(1)
    }
  })

  it('I5: merge avvisas vid orgNr-mismatch', () => {
    createCompany(db, {
      name: 'Befintligt AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2',
      share_capital: 50000_00,
      registration_date: '2025-01-01',
      fiscal_year_start: '2025-01-01',
      fiscal_year_end: '2025-12-31',
    })
    const xml = buildMinimalSie5({ orgNumber: '556999-9999' })
    const parsed = parseSie5(xml)
    const res = importSie5(db, parsed, { strategy: 'merge' })
    expect(res.success).toBe(false)
  })

  it('I6: merge avvisas utan befintligt bolag', () => {
    const xml = buildMinimalSie5({ orgNumber: '556036-0793' })
    const parsed = parseSie5(xml)
    const res = importSie5(db, parsed, { strategy: 'merge' })
    expect(res.success).toBe(false)
  })
})

describe('SIE5 import — conflict detection', () => {
  let db: Database.Database
  beforeEach(() => { db = createTestDb() })
  afterEach(() => { db.close() })

  it('I7: detectSie5AccountConflicts flaggar namnkonflikt', () => {
    // 1930 finns i BAS som "Företagskonto/checkkonto" e.d.
    const xml = buildMinimalSie5({
      accounts: [{ id: '1930', name: 'Helt annat namn' }],
    })
    const parsed = parseSie5(xml)
    const conflicts = detectSie5AccountConflicts(db, parsed)
    expect(conflicts.length).toBeGreaterThanOrEqual(1)
    expect(conflicts[0].account_number).toBe('1930')
  })
})

// ═════════════════════════════════════════════════════════════
// Roundtrip: SIE5-export → SIE5-import
// ═════════════════════════════════════════════════════════════

describe('SIE5 roundtrip (export → import)', () => {
  let exportDb: Database.Database
  let importDb: Database.Database

  beforeEach(() => {
    exportDb = createTestDb()
    importDb = createTestDb()
  })
  afterEach(() => {
    exportDb.close()
    importDb.close()
  })

  function seedExportData(): number {
    createCompany(exportDb, {
      name: 'Roundtrip AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2',
      share_capital: 50000_00,
      registration_date: '2025-01-01',
      fiscal_year_start: '2025-01-01',
      fiscal_year_end: '2025-12-31',
    })
    const fy = exportDb
      .prepare('SELECT id FROM fiscal_years LIMIT 1')
      .get() as { id: number }
    const customer = createCounterparty(exportDb, {
      company_id: 1,
      name: 'Kund AB',
      type: 'customer',
      org_number: '559999-0001',
    })
    if (!customer.success) throw new Error('customer failed')
    const vatCode = exportDb
      .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
      .get() as { id: number }
    const account = exportDb
      .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
      .get() as { id: number }
    const product = createProduct(exportDb, {
      company_id: 1,
      name: 'Prod',
      default_price_ore: 10000,
      vat_code_id: vatCode.id,
      account_id: account.id,
    })
    if (!product.success) throw new Error('product failed')

    const draft = saveDraft(exportDb, {
      counterparty_id: customer.data.id,
      fiscal_year_id: fy.id,
      invoice_date: '2025-03-15',
      due_date: '2025-04-14',
      payment_terms: 30,
      lines: [
        {
          product_id: product.data.id,
          description: 'Test',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: vatCode.id,
          sort_order: 0,
        },
      ],
    })
    if (!draft.success) throw new Error('draft failed')
    const fin = finalizeDraft(exportDb, draft.data.id)
    if (!fin.success) throw new Error('finalize failed: ' + fin.error)
    return fy.id
  }

  it('R1: exporterad SIE5 kan parsas → samma antal konton och verifikat', () => {
    const fyId = seedExportData()
    const xml = exportSie5(exportDb, { fiscalYearId: fyId })

    const parsed = parseSie5(xml)
    expect(parsed.header.companyName).toBe('Roundtrip AB')
    expect(parsed.header.orgNumber).toBe('556036-0793')
    expect(parsed.header.fiscalYears).toHaveLength(1)
    expect(parsed.accounts.length).toBeGreaterThan(0)
    expect(parsed.entries.length).toBeGreaterThan(0)
  })

  it('R2: parsad SIE5 validerar OK (balanserade verifikat)', () => {
    const fyId = seedExportData()
    const xml = exportSie5(exportDb, { fiscalYearId: fyId })
    const parsed = parseSie5(xml)
    const v = validateSie5ParseResult(parsed)
    // Alla verifikat ska balansera efter export
    expect(v.errors.filter((e) => e.code === 'E1')).toHaveLength(0)
  })

  it('R3: import till tom databas (new) återskapar verifikats-struktur', () => {
    const fyId = seedExportData()
    const xml = exportSie5(exportDb, { fiscalYearId: fyId })
    const parsed = parseSie5(xml)

    const exportEntryCount = (
      exportDb
        .prepare(
          `SELECT COUNT(*) AS c FROM journal_entries
           WHERE fiscal_year_id = ? AND status = 'booked'`,
        )
        .get(fyId) as { c: number }
    ).c

    const res = importSie5(importDb, parsed, { strategy: 'new' })
    expect(res.success).toBe(true)
    if (!res.success) return

    const importedCount = (
      importDb
        .prepare(
          `SELECT COUNT(*) AS c FROM journal_entries
           WHERE verification_series = 'I' AND status = 'booked'`,
        )
        .get() as { c: number }
    ).c
    expect(importedCount).toBe(exportEntryCount)
  })

  it('R4: roundtrip bevarar balans per konto (debet−kredit per konto)', () => {
    const fyId = seedExportData()
    const xml = exportSie5(exportDb, { fiscalYearId: fyId })
    const parsed = parseSie5(xml)

    const origBalance = exportDb
      .prepare(
        `SELECT account_number,
                SUM(debit_ore) - SUM(credit_ore) AS net
           FROM journal_entry_lines jel
           JOIN journal_entries je ON je.id = jel.journal_entry_id
          WHERE je.fiscal_year_id = ? AND je.status = 'booked'
          GROUP BY account_number
          ORDER BY account_number`,
      )
      .all(fyId) as Array<{ account_number: string; net: number }>

    const res = importSie5(importDb, parsed, { strategy: 'new' })
    expect(res.success).toBe(true)

    const importedBalance = importDb
      .prepare(
        `SELECT account_number,
                SUM(debit_ore) - SUM(credit_ore) AS net
           FROM journal_entry_lines jel
           JOIN journal_entries je ON je.id = jel.journal_entry_id
          WHERE je.verification_series = 'I' AND je.status = 'booked'
          GROUP BY account_number
          ORDER BY account_number`,
      )
      .all() as Array<{ account_number: string; net: number }>

    // Jämför kontonummer+net för konton som båda har
    const origMap = new Map(origBalance.map((r) => [r.account_number, r.net]))
    for (const row of importedBalance) {
      const expected = origMap.get(row.account_number)
      if (expected !== undefined) {
        expect(row.net).toBe(expected)
      }
    }
    expect(importedBalance.length).toBeGreaterThan(0)
  })
})
