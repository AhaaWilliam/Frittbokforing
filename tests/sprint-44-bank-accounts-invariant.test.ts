/**
 * Sprint 44 — BANK_ACCOUNTS-invariant (Sprint 31-skydd).
 *
 * Verifierar att BANK_ACCOUNTS-listan i src/shared/bank-accounts.ts faktiskt
 * matchar konton som finns och är aktiva i BAS-seeden. Single-source-of-
 * truth-vakt: om någon byter ett konto i seeden eller migrationen utan
 * att uppdatera bank-accounts.ts, fångas det här istället för att
 * dashboard.bankBalanceOre tyst returnerar fel siffra.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { BANK_ACCOUNTS } from '../src/shared/bank-accounts'

describe('Sprint 44 — BANK_ACCOUNTS invariant', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    const r = createCompany(db, {
      name: 'Bank Const Test AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2',
      share_capital: 2_500_000,
      registration_date: '2026-01-01',
      fiscal_year_start: '2026-01-01',
      fiscal_year_end: '2026-12-31',
    })
    if (!r.success) throw new Error('createCompany failed: ' + r.error)
  })

  it('alla BANK_ACCOUNTS finns i accounts-tabellen', () => {
    const placeholders = BANK_ACCOUNTS.map(() => '?').join(',')
    const rows = db
      .prepare(
        `SELECT account_number FROM accounts WHERE account_number IN (${placeholders})`,
      )
      .all(...BANK_ACCOUNTS) as { account_number: string }[]
    expect(rows.length).toBe(BANK_ACCOUNTS.length)
    const found = new Set(rows.map((r) => r.account_number))
    for (const acc of BANK_ACCOUNTS) {
      expect(found.has(acc)).toBe(true)
    }
  })

  it('alla BANK_ACCOUNTS är klassade som asset (account_type)', () => {
    const placeholders = BANK_ACCOUNTS.map(() => '?').join(',')
    const rows = db
      .prepare(
        `SELECT account_number, account_type FROM accounts WHERE account_number IN (${placeholders})`,
      )
      .all(...BANK_ACCOUNTS) as {
      account_number: string
      account_type: string
    }[]
    for (const row of rows) {
      expect(row.account_type).toBe('asset')
    }
  })

  it('alla BANK_ACCOUNTS är aktiva för K2 (kärn-BAS-konton)', () => {
    const placeholders = BANK_ACCOUNTS.map(() => '?').join(',')
    const rows = db
      .prepare(
        `SELECT account_number, k2_allowed FROM accounts WHERE account_number IN (${placeholders})`,
      )
      .all(...BANK_ACCOUNTS) as {
      account_number: string
      k2_allowed: number
    }[]
    for (const row of rows) {
      expect(row.k2_allowed).toBe(1)
    }
  })

  it('inga BANK_ACCOUNTS är duplicerade', () => {
    const unique = new Set(BANK_ACCOUNTS)
    expect(unique.size).toBe(BANK_ACCOUNTS.length)
  })

  it('alla BANK_ACCOUNTS är 4-siffriga BAS-koder i klass 19', () => {
    for (const acc of BANK_ACCOUNTS) {
      expect(acc).toMatch(/^19\d\d$/)
    }
  })
})
