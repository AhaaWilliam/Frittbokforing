import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createTestDb } from './helpers/create-test-db'
import {
  importBankStatement,
  listBankStatements,
  getBankStatement,
} from '../src/main/services/bank/bank-statement-service'

function fixture(name: string): string {
  return readFileSync(resolve(__dirname, 'fixtures', name), 'utf8')
}

function seed(db: Database.Database): { companyId: number; fyId: number } {
  db.exec(`
    INSERT INTO companies (id, org_number, name, fiscal_rule)
      VALUES (1, '559000-1234', 'Test AB', 'K2');
    INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
      VALUES (1, 1, '2026', '2026-01-01', '2026-12-31');
  `)
  return { companyId: 1, fyId: 1 }
}

describe('S55 A3 — importBankStatement + list + get', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  it('1. Valid import kör rent', () => {
    const { companyId, fyId } = seed(db)
    const result = importBankStatement(db, {
      company_id: companyId,
      fiscal_year_id: fyId,
      xml_content: fixture('camt053-happy.xml'),
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.transaction_count).toBe(3)
      const rows = db
        .prepare('SELECT COUNT(*) as c FROM bank_transactions WHERE bank_statement_id = ?')
        .get(result.data.statement_id) as { c: number }
      expect(rows.c).toBe(3)
    }
  })

  it('2. Duplicate (company_id, import_file_hash) avvisas', () => {
    const { companyId, fyId } = seed(db)
    const xml = fixture('camt053-happy.xml')
    const first = importBankStatement(db, {
      company_id: companyId,
      fiscal_year_id: fyId,
      xml_content: xml,
    })
    expect(first.success).toBe(true)
    const second = importBankStatement(db, {
      company_id: companyId,
      fiscal_year_id: fyId,
      xml_content: xml,
    })
    expect(second.success).toBe(false)
    if (!second.success) {
      expect(second.code).toBe('VALIDATION_ERROR')
      expect(second.error).toContain('redan importerats')
    }
  })

  it('3. Wrong FY (statement_date utanför) avvisas', () => {
    db.exec(`
      INSERT INTO companies (id, org_number, name, fiscal_rule)
        VALUES (1, '559000-1234', 'Test AB', 'K2');
      INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
        VALUES (1, 1, '2025', '2025-01-01', '2025-12-31');
    `)
    const result = importBankStatement(db, {
      company_id: 1,
      fiscal_year_id: 1,
      xml_content: fixture('camt053-happy.xml'),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.field).toBe('statement_date')
    }
  })

  it('4. Rollback vid parse-fel — inga rader i DB', () => {
    const { companyId, fyId } = seed(db)
    const result = importBankStatement(db, {
      company_id: companyId,
      fiscal_year_id: fyId,
      xml_content: 'not xml at all',
    })
    expect(result.success).toBe(false)
    const count = db
      .prepare('SELECT COUNT(*) as c FROM bank_statements')
      .get() as { c: number }
    expect(count.c).toBe(0)
  })

  it('5. Opening + SUM = closing-invariant: pass (exakt)', () => {
    const { companyId, fyId } = seed(db)
    // Happy-fixturen: opening 10000.00 + TX (2500 − 1200 + 200.50) = closing 11500.50 ✓
    const result = importBankStatement(db, {
      company_id: companyId,
      fiscal_year_id: fyId,
      xml_content: fixture('camt053-happy.xml'),
    })
    expect(result.success).toBe(true)
  })

  it('6. Opening + SUM = closing-invariant: fail ger tydligt fel', () => {
    const { companyId, fyId } = seed(db)
    const corrupt = fixture('camt053-happy.xml').replace(
      '<Amt Ccy="SEK">11500.50</Amt>\n        <CdtDbtInd>CRDT</CdtDbtInd>\n        <Dt><Dt>2026-04-15</Dt></Dt>\n      </Bal>',
      '<Amt Ccy="SEK">99999.00</Amt>\n        <CdtDbtInd>CRDT</CdtDbtInd>\n        <Dt><Dt>2026-04-15</Dt></Dt>\n      </Bal>',
    )
    const result = importBankStatement(db, {
      company_id: companyId,
      fiscal_year_id: fyId,
      xml_content: corrupt,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('trunkerad')
    }
  })

  it('7. listBankStatements returnerar importerade med count + matched_count', () => {
    const { companyId, fyId } = seed(db)
    const r = importBankStatement(db, {
      company_id: companyId,
      fiscal_year_id: fyId,
      xml_content: fixture('camt053-happy.xml'),
    })
    expect(r.success).toBe(true)
    const list = listBankStatements(db, fyId)
    expect(list).toHaveLength(1)
    expect(list[0].transaction_count).toBe(3)
    expect(list[0].matched_count).toBe(0)
    expect(list[0].opening_balance_ore).toBe(1_000_000)
  })

  it('8. getBankStatement returnerar detail med transactions', () => {
    const { companyId, fyId } = seed(db)
    const r = importBankStatement(db, {
      company_id: companyId,
      fiscal_year_id: fyId,
      xml_content: fixture('camt053-happy.xml'),
    })
    if (!r.success) throw new Error('import failed')
    const detail = getBankStatement(db, r.data.statement_id)
    expect(detail).not.toBeNull()
    expect(detail!.transactions).toHaveLength(3)
    expect(detail!.transactions[0].amount_ore).toBe(250_000)
    expect(detail!.transactions[0].reconciliation_status).toBe('unmatched')
  })
})
