/**
 * Sprint F P6 — camt.054 parser + Path A import.
 *
 * Täcker:
 *  - Parser: minimal, multi-entry, sign-konvention (M152)
 *  - Service: Path A pseudo-statement (opening=0, closing=0, source_format='camt.054')
 *  - Blandad import (camt.053 + camt.054) → separata statement-rader
 *  - Transaktionsnivå-data korrekt sparad (BkTxCd-fälten)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { parseCamt054 } from '../src/main/services/bank/camt054-parser'
import { Camt053ParseError } from '../src/main/services/bank/camt053-parser'
import { importBankStatement } from '../src/main/services/bank/bank-statement-service'

let db: Database.Database

beforeEach(() => {
  db = createTestDb()
  db.exec(`
    INSERT INTO companies (id, org_number, name, fiscal_rule)
      VALUES (1, '559000-1234', 'Test AB', 'K2');
    INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
      VALUES (1, 1, '2026', '2026-01-01', '2026-12-31');
  `)
})

afterEach(() => {
  db.close()
})

const CAMT054_MINIMAL = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.054.001.08">
  <BkToCstmrDbtCdtNtfctn>
    <GrpHdr>
      <MsgId>N-001</MsgId>
      <CreDtTm>2026-03-20T10:00:00</CreDtTm>
    </GrpHdr>
    <Ntfctn>
      <Id>NTF-MIN-001</Id>
      <CreDtTm>2026-03-20T10:00:00</CreDtTm>
      <Acct>
        <Id><IBAN>SE4550000000050001000001</IBAN></Id>
        <Ccy>SEK</Ccy>
      </Acct>
      <Ntry>
        <Amt Ccy="SEK">125.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-03-18</Dt></BookgDt>
        <ValDt><Dt>2026-03-18</Dt></ValDt>
        <AcctSvcrRef>REF-A-1</AcctSvcrRef>
        <BkTxCd>
          <Domn>
            <Cd>PMNT</Cd>
            <Fmly>
              <Cd>RCDT</Cd>
              <SubFmlyCd>BOOK</SubFmlyCd>
            </Fmly>
          </Domn>
        </BkTxCd>
      </Ntry>
    </Ntfctn>
  </BkToCstmrDbtCdtNtfctn>
</Document>`

const CAMT054_MULTI = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.054.001.08">
  <BkToCstmrDbtCdtNtfctn>
    <GrpHdr>
      <MsgId>N-002</MsgId>
      <CreDtTm>2026-04-01T08:00:00</CreDtTm>
    </GrpHdr>
    <Ntfctn>
      <Id>NTF-MULTI-002</Id>
      <CreDtTm>2026-04-01T08:00:00</CreDtTm>
      <Acct>
        <Id><IBAN>SE4550000000050001000001</IBAN></Id>
        <Ccy>SEK</Ccy>
      </Acct>
      <Ntry>
        <Amt Ccy="SEK">200.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-03-30</Dt></BookgDt>
        <ValDt><Dt>2026-03-30</Dt></ValDt>
        <AcctSvcrRef>REF-M-1</AcctSvcrRef>
      </Ntry>
      <Ntry>
        <Amt Ccy="SEK">50.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2026-03-31</Dt></BookgDt>
        <ValDt><Dt>2026-03-31</Dt></ValDt>
        <AcctSvcrRef>REF-M-2</AcctSvcrRef>
        <BkTxCd>
          <Domn>
            <Cd>PMNT</Cd>
            <Fmly>
              <Cd>CCRD</Cd>
              <SubFmlyCd>CHRG</SubFmlyCd>
            </Fmly>
          </Domn>
        </BkTxCd>
      </Ntry>
    </Ntfctn>
  </BkToCstmrDbtCdtNtfctn>
</Document>`

// Samma IBAN som camt.054 ovan, annat datum → separat hash
const CAMT053_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>S</MsgId><CreDtTm>2026-03-31T23:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>STMT-001</Id>
      <CreDtTm>2026-03-31T23:00:00</CreDtTm>
      <Acct><Id><IBAN>SE4550000000050001000001</IBAN></Id><Ccy>SEK</Ccy></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="SEK">0.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-03-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="SEK">100.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-03-31</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="SEK">100.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-03-15</Dt></BookgDt>
        <ValDt><Dt>2026-03-15</Dt></ValDt>
        <AcctSvcrRef>STMT-REF-1</AcctSvcrRef>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`

describe('Sprint F P6 — parseCamt054', () => {
  it('Parser: minimal camt.054 → 1 transaktion korrekt', () => {
    const parsed = parseCamt054(CAMT054_MINIMAL)
    expect(parsed.statement_number).toBe('NTF-MIN-001')
    expect(parsed.bank_account_iban).toBe('SE4550000000050001000001')
    expect(parsed.statement_date).toBe('2026-03-20')
    expect(parsed.opening_balance_ore).toBeNull()
    expect(parsed.closing_balance_ore).toBeNull()
    expect(parsed.transactions).toHaveLength(1)
    expect(parsed.transactions[0]).toMatchObject({
      amount_ore: 12500,
      booking_date: '2026-03-18',
      transaction_reference: 'REF-A-1',
      bank_tx_domain: 'PMNT',
      bank_tx_family: 'RCDT',
      bank_tx_subfamily: 'BOOK',
    })
  })

  it('Parser: multi-entry + DBIT negativt (M152 sign)', () => {
    const parsed = parseCamt054(CAMT054_MULTI)
    expect(parsed.transactions).toHaveLength(2)
    expect(parsed.transactions[0].amount_ore).toBe(20000) // CRDT positivt
    expect(parsed.transactions[1].amount_ore).toBe(-5000) // DBIT negativt
    expect(parsed.transactions[1].bank_tx_subfamily).toBe('CHRG')
  })

  it('Parser: saknar Ntfctn → Camt053ParseError', () => {
    const broken = `<?xml version="1.0"?><Document><Foo/></Document>`
    expect(() => parseCamt054(broken)).toThrow(Camt053ParseError)
  })
})

describe('Sprint F P6 — importBankStatement Path A (camt.054)', () => {
  it('Service: camt.054 → pseudo-statement med opening=0, closing=0, source_format=camt.054', () => {
    const r = importBankStatement(db, {
      company_id: 1,
      fiscal_year_id: 1,
      xml_content: CAMT054_MINIMAL,
      format: 'camt.054',
    })
    expect(r.success).toBe(true)
    if (!r.success) return

    const stmt = db
      .prepare(
        'SELECT opening_balance_ore, closing_balance_ore, source_format, statement_number FROM bank_statements WHERE id = ?',
      )
      .get(r.data.statement_id) as {
      opening_balance_ore: number
      closing_balance_ore: number
      source_format: string
      statement_number: string
    }
    expect(stmt.opening_balance_ore).toBe(0)
    expect(stmt.closing_balance_ore).toBe(0)
    // Migration 043 utökade CHECK till ('camt.053','camt.054') → explicit source_format
    expect(stmt.source_format).toBe('camt.054')
    expect(stmt.statement_number).toBe('NTF-MIN-001')

    const txCount = (
      db
        .prepare(
          'SELECT COUNT(*) AS c FROM bank_transactions WHERE bank_statement_id = ?',
        )
        .get(r.data.statement_id) as { c: number }
    ).c
    expect(txCount).toBe(1)
  })

  it('Service: camt.053 (default format) → opening + SUM = closing fortfarande enforced', () => {
    const r = importBankStatement(db, {
      company_id: 1,
      fiscal_year_id: 1,
      xml_content: CAMT053_SAMPLE,
    })
    expect(r.success).toBe(true)
    if (!r.success) return

    const stmt = db
      .prepare(
        'SELECT source_format, opening_balance_ore, closing_balance_ore, statement_number FROM bank_statements WHERE id = ?',
      )
      .get(r.data.statement_id) as {
      source_format: string
      opening_balance_ore: number
      closing_balance_ore: number
      statement_number: string
    }
    expect(stmt.source_format).toBe('camt.053')
    expect(stmt.opening_balance_ore).toBe(0)
    expect(stmt.closing_balance_ore).toBe(10000)
    // camt.053 statement_number ska INTE ha CAMT054-prefix
    expect(stmt.statement_number).toBe('STMT-001')
  })

  it('Service: blandad import (camt.053 + camt.054 samma konto) → separata statement-rader', () => {
    const r053 = importBankStatement(db, {
      company_id: 1,
      fiscal_year_id: 1,
      xml_content: CAMT053_SAMPLE,
      format: 'camt.053',
    })
    expect(r053.success).toBe(true)

    const r054 = importBankStatement(db, {
      company_id: 1,
      fiscal_year_id: 1,
      xml_content: CAMT054_MULTI,
      format: 'camt.054',
    })
    expect(r054.success).toBe(true)

    const stmts = db
      .prepare(
        'SELECT source_format FROM bank_statements ORDER BY statement_number',
      )
      .all() as { source_format: string }[]
    expect(stmts.map((s) => s.source_format).sort()).toEqual([
      'camt.053',
      'camt.054',
    ])
  })

  it('Service: camt.054 balanscheck skippas (Path A) — ingen OPBD/CLBD-verifiering', () => {
    // camt.054-transaktioner summerar inte till noll, vilket skulle
    // failat opening+SUM=closing-check för camt.053. Path A ska skippa
    // denna check.
    const r = importBankStatement(db, {
      company_id: 1,
      fiscal_year_id: 1,
      xml_content: CAMT054_MULTI,
      format: 'camt.054',
    })
    expect(r.success).toBe(true)
  })

  it('Service: dubblett-import av samma camt.054-fil blockeras', () => {
    const r1 = importBankStatement(db, {
      company_id: 1,
      fiscal_year_id: 1,
      xml_content: CAMT054_MINIMAL,
      format: 'camt.054',
    })
    expect(r1.success).toBe(true)

    const r2 = importBankStatement(db, {
      company_id: 1,
      fiscal_year_id: 1,
      xml_content: CAMT054_MINIMAL,
      format: 'camt.054',
    })
    expect(r2.success).toBe(false)
    if (r2.success) return
    expect(r2.error).toContain('redan importerats')
  })

  it('Service: camt.054 BkTxCd-fält sparas på bank_transactions', () => {
    const r = importBankStatement(db, {
      company_id: 1,
      fiscal_year_id: 1,
      xml_content: CAMT054_MULTI,
      format: 'camt.054',
    })
    expect(r.success).toBe(true)
    if (!r.success) return

    const chrgTx = db
      .prepare(
        `SELECT bank_tx_domain, bank_tx_family, bank_tx_subfamily, amount_ore
         FROM bank_transactions
         WHERE bank_statement_id = ? AND bank_tx_subfamily = 'CHRG'`,
      )
      .get(r.data.statement_id) as
      | {
          bank_tx_domain: string
          bank_tx_family: string
          bank_tx_subfamily: string
          amount_ore: number
        }
      | undefined
    expect(chrgTx).toBeDefined()
    expect(chrgTx!.bank_tx_domain).toBe('PMNT')
    expect(chrgTx!.bank_tx_family).toBe('CCRD')
    expect(chrgTx!.amount_ore).toBe(-5000)
  })
})
