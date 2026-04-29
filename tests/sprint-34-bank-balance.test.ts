/**
 * Sprint 34 — bank-saldo-tester (dashboard-service.bankBalanceOre).
 *
 * Verifierar att Sprint 31:s bank-balans-beräkning matchar verkligheten:
 * - Endast bokade verifikat räknas, inte utkast
 * - Multipla bank-konton aggregeras korrekt (1910 + 1930)
 * - Negativ balans hanteras (overdraft)
 * - SUM(debit - credit) — inte abs-värde
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { getDashboardSummary } from '../src/main/services/dashboard-service'
import { createCompany } from '../src/main/services/company-service'
import {
  saveManualEntryDraft,
  finalizeManualEntry,
} from '../src/main/services/manual-entry-service'

function setupCompany(db: Database.Database): { fiscalYearId: number } {
  const r = createCompany(db, {
    name: 'Bank Balance AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 2_500_000,
    registration_date: '2026-01-01',
    fiscal_year_start: '2026-01-01',
    fiscal_year_end: '2026-12-31',
  })
  if (!r.success) throw new Error('createCompany failed: ' + r.error)
  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  return { fiscalYearId: fy.id }
}

function postBookedEntry(
  db: Database.Database,
  fiscalYearId: number,
  date: string,
  description: string,
  lines: { account_number: string; debit_ore: number; credit_ore: number }[],
): void {
  const draft = saveManualEntryDraft(db, {
    fiscal_year_id: fiscalYearId,
    entry_date: date,
    description,
    lines,
  })
  if (!draft.success) throw new Error('saveDraft: ' + draft.error)
  const fin = finalizeManualEntry(db, draft.data.id, fiscalYearId)
  if (!fin.success) throw new Error('finalize: ' + fin.error)
}

describe('Sprint 34 — bankBalanceOre', () => {
  let db: Database.Database
  let fiscalYearId: number

  beforeEach(() => {
    db = createTestDb()
    const setup = setupCompany(db)
    fiscalYearId = setup.fiscalYearId
  })

  it('utan transaktioner: 0', () => {
    const summary = getDashboardSummary(db, fiscalYearId)
    expect(summary.bankBalanceOre).toBe(0)
  })

  it('inkommande betalning ökar saldo (D 1930 / K 3001)', () => {
    postBookedEntry(db, fiscalYearId, '2026-04-01', 'Försäljning', [
      { account_number: '1930', debit_ore: 100000, credit_ore: 0 },
      { account_number: '3001', debit_ore: 0, credit_ore: 100000 },
    ])
    const summary = getDashboardSummary(db, fiscalYearId)
    expect(summary.bankBalanceOre).toBe(100000)
  })

  it('utgående betalning minskar saldo (D 6230 / K 1930)', () => {
    postBookedEntry(db, fiscalYearId, '2026-04-01', 'Betalning', [
      { account_number: '6230', debit_ore: 50000, credit_ore: 0 },
      { account_number: '1930', debit_ore: 0, credit_ore: 50000 },
    ])
    const summary = getDashboardSummary(db, fiscalYearId)
    expect(summary.bankBalanceOre).toBe(-50000)
  })

  it('aggregerar över multipla bank-konton (1910 kassa + 1930 företagskonto)', () => {
    postBookedEntry(db, fiscalYearId, '2026-04-01', 'Kassa-insättning', [
      { account_number: '1910', debit_ore: 30000, credit_ore: 0 },
      { account_number: '3001', debit_ore: 0, credit_ore: 30000 },
    ])
    postBookedEntry(db, fiscalYearId, '2026-04-02', 'Bank-insättning', [
      { account_number: '1930', debit_ore: 200000, credit_ore: 0 },
      { account_number: '3001', debit_ore: 0, credit_ore: 200000 },
    ])
    const summary = getDashboardSummary(db, fiscalYearId)
    expect(summary.bankBalanceOre).toBe(230000)
  })

  it('utkast räknas inte (bara status=booked)', () => {
    // Ett booked verifikat
    postBookedEntry(db, fiscalYearId, '2026-04-01', 'Bokat', [
      { account_number: '1930', debit_ore: 100000, credit_ore: 0 },
      { account_number: '3001', debit_ore: 0, credit_ore: 100000 },
    ])
    // En draft (sparas men finaliseras inte)
    const draft = saveManualEntryDraft(db, {
      fiscal_year_id: fiscalYearId,
      entry_date: '2026-04-02',
      description: 'Utkast',
      lines: [
        { account_number: '1930', debit_ore: 999999, credit_ore: 0 },
        { account_number: '3001', debit_ore: 0, credit_ore: 999999 },
      ],
    })
    expect(draft.success).toBe(true)

    const summary = getDashboardSummary(db, fiscalYearId)
    expect(summary.bankBalanceOre).toBe(100000)
  })

  it('icke-bank-konton räknas inte (1510 kundfordran ignoreras)', () => {
    postBookedEntry(db, fiscalYearId, '2026-04-01', 'Faktura skapad', [
      { account_number: '1510', debit_ore: 500000, credit_ore: 0 },
      { account_number: '3001', debit_ore: 0, credit_ore: 500000 },
    ])
    const summary = getDashboardSummary(db, fiscalYearId)
    expect(summary.bankBalanceOre).toBe(0)
  })

  it('netto över flera transaktioner (in + ut)', () => {
    postBookedEntry(db, fiscalYearId, '2026-04-01', 'Försäljning 1', [
      { account_number: '1930', debit_ore: 200000, credit_ore: 0 },
      { account_number: '3001', debit_ore: 0, credit_ore: 200000 },
    ])
    postBookedEntry(db, fiscalYearId, '2026-04-02', 'Kostnad 1', [
      { account_number: '6230', debit_ore: 75000, credit_ore: 0 },
      { account_number: '1930', debit_ore: 0, credit_ore: 75000 },
    ])
    postBookedEntry(db, fiscalYearId, '2026-04-03', 'Försäljning 2', [
      { account_number: '1910', debit_ore: 25000, credit_ore: 0 },
      { account_number: '3001', debit_ore: 0, credit_ore: 25000 },
    ])
    const summary = getDashboardSummary(db, fiscalYearId)
    // 1930: +200000 - 75000 = 125000, 1910: +25000 → 150000
    expect(summary.bankBalanceOre).toBe(150000)
  })
})
