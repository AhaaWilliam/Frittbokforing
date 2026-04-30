/**
 * Sprint 47 — VAT_ACCOUNTS-invariant (paritet med Sprint 44 BANK_ACCOUNTS).
 *
 * src/shared/vat-accounts.ts har funnits längre än bank-accounts (sedan
 * nattgranskning M-P2) men hade ingen test som verifierar att konstanterna
 * matchar BAS-seeden. Sprint 44 etablerade mönstret för bank — Sprint 47
 * applicerar det på VAT.
 *
 * Skyddar mot drift i (1) seed-data, (2) konstant-fil, (3) vat_codes-
 * tabellens default-mappning. Om någon flyttar 25%-momsen från 2610 till
 * 2611 utan att uppdatera båda, fångas det här.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import {
  VAT_OUT_25_ACCOUNT,
  VAT_OUT_12_ACCOUNT,
  VAT_OUT_6_ACCOUNT,
  VAT_IN_ACCOUNT,
  VAT_OUTGOING_ACCOUNTS,
  ALL_VAT_ACCOUNTS,
} from '../src/shared/vat-accounts'

describe('Sprint 47 — VAT_ACCOUNTS invariant', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    const r = createCompany(db, {
      name: 'VAT Const Test AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2',
      share_capital: 2_500_000,
      registration_date: '2026-01-01',
      fiscal_year_start: '2026-01-01',
      fiscal_year_end: '2026-12-31',
    })
    if (!r.success) throw new Error('createCompany failed: ' + r.error)
  })

  it('alla ALL_VAT_ACCOUNTS finns i accounts-tabellen', () => {
    const placeholders = ALL_VAT_ACCOUNTS.map(() => '?').join(',')
    const rows = db
      .prepare(
        `SELECT account_number FROM accounts WHERE account_number IN (${placeholders})`,
      )
      .all(...ALL_VAT_ACCOUNTS) as { account_number: string }[]
    expect(rows.length).toBe(ALL_VAT_ACCOUNTS.length)
  })

  it('alla utgående VAT-konton är klassade som liability', () => {
    const placeholders = VAT_OUTGOING_ACCOUNTS.map(() => '?').join(',')
    const rows = db
      .prepare(
        `SELECT account_number, account_type FROM accounts WHERE account_number IN (${placeholders})`,
      )
      .all(...VAT_OUTGOING_ACCOUNTS) as {
      account_number: string
      account_type: string
    }[]
    for (const row of rows) {
      expect(row.account_type).toBe('liability')
    }
  })

  it('VAT_IN_ACCOUNT (2640) är klassat som asset', () => {
    const row = db
      .prepare(
        `SELECT account_type FROM accounts WHERE account_number = ?`,
      )
      .get(VAT_IN_ACCOUNT) as { account_type: string } | undefined
    expect(row?.account_type).toBe('asset')
  })

  it('alla VAT-konton är aktiva för K2', () => {
    const placeholders = ALL_VAT_ACCOUNTS.map(() => '?').join(',')
    const rows = db
      .prepare(
        `SELECT account_number, k2_allowed FROM accounts WHERE account_number IN (${placeholders})`,
      )
      .all(...ALL_VAT_ACCOUNTS) as {
      account_number: string
      k2_allowed: number
    }[]
    for (const row of rows) {
      expect(row.k2_allowed).toBe(1)
    }
  })

  it('momskoder MP1/MP2/MP3 mappar till rätt vat_account', () => {
    const expected: Record<string, string> = {
      MP1: VAT_OUT_25_ACCOUNT, // 25%
      MP2: VAT_OUT_12_ACCOUNT, // 12%
      MP3: VAT_OUT_6_ACCOUNT, // 6%
    }
    for (const [code, expectedAccount] of Object.entries(expected)) {
      const row = db
        .prepare(`SELECT vat_account FROM vat_codes WHERE code = ?`)
        .get(code) as { vat_account: string } | undefined
      expect(row?.vat_account).toBe(expectedAccount)
    }
  })

  it('inkommande IP1 mappar till VAT_IN_ACCOUNT (2640)', () => {
    const row = db
      .prepare(`SELECT vat_account FROM vat_codes WHERE code = 'IP1'`)
      .get() as { vat_account: string } | undefined
    expect(row?.vat_account).toBe(VAT_IN_ACCOUNT)
  })

  it('VAT_OUTGOING_ACCOUNTS innehåller exakt tre konton (25/12/6)', () => {
    expect(VAT_OUTGOING_ACCOUNTS).toEqual([
      VAT_OUT_25_ACCOUNT,
      VAT_OUT_12_ACCOUNT,
      VAT_OUT_6_ACCOUNT,
    ])
  })

  it('inga VAT_ACCOUNTS är duplicerade', () => {
    const unique = new Set(ALL_VAT_ACCOUNTS)
    expect(unique.size).toBe(ALL_VAT_ACCOUNTS.length)
  })
})
