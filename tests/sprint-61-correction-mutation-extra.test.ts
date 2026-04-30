/**
 * Sprint 61 — Stäng resterande mutation-gap i correction-service.
 *
 * Surviving mutants efter S53/S60:
 * - L65 StringLiteral: 'Verifikatet måste vara bokfört.' — S53 hade
 *   tidig early-return när manual-draft saknar JE, så assertet aldrig
 *   nåddes.
 * - L98 StringLiteral: 'Verifikatet har beroende betalningar...'
 * - L137 StringLiteral: 'Perioden för dagens datum är stängd.'
 * - L202 StringLiteral: 'Verifikatet hittades inte.' (createCorrectionEntry
 *   inom transaktion, ej canCorrectEntry)
 * - L227 ConditionalExpression: lines.length === 0 — kräver booked JE
 *   utan rader (insert direkt + skip balance-trigger).
 *
 * Strategi: skapa testfixtures direkt via INSERT där behövligt, och
 * assertera EXAKT reason/error-text + code.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import {
  canCorrectEntry,
  createCorrectionEntry,
} from '../src/main/services/correction-service'
import {
  saveManualEntryDraft,
  finalizeManualEntry,
} from '../src/main/services/manual-entry-service'
import { closePeriod } from '../src/main/services/fiscal-service'

let db: Database.Database
let companyId: number
let fiscalYearId: number

function createTestDb(): Database.Database {
  const testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.pragma('foreign_keys = ON')
  for (let i = 0; i < migrations.length; i++) {
    const m = migrations[i]
    testDb.exec('BEGIN EXCLUSIVE')
    testDb.exec(m.sql)
    if (m.programmatic) m.programmatic(testDb)
    testDb.pragma(`user_version = ${i + 1}`)
    testDb.exec('COMMIT')
  }
  return testDb
}

beforeEach(() => {
  db = createTestDb()
  createCompany(db, {
    name: 'Corr Mut Extra AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 2_500_000,
    registration_date: '2026-01-15',
    fiscal_year_start: '2026-01-01',
    fiscal_year_end: '2026-12-31',
  })
  companyId = (
    db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: number }
  ).id
  fiscalYearId = (
    db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  ).id
})

afterEach(() => {
  if (db) db.close()
})

function bookManual(): { journalEntryId: number } {
  const draft = saveManualEntryDraft(db, {
    fiscal_year_id: fiscalYearId,
    entry_date: '2026-04-15',
    description: 'Original',
    lines: [
      { account_number: '1930', debit_ore: 1000, credit_ore: 0 },
      { account_number: '6230', debit_ore: 0, credit_ore: 1000 },
    ],
  })
  if (!draft.success) throw new Error('saveDraft: ' + draft.error)
  const fin = finalizeManualEntry(db, draft.data.id, fiscalYearId)
  if (!fin.success) throw new Error('finalize: ' + fin.error)
  return { journalEntryId: fin.data.journalEntryId }
}

describe('Sprint 61 — guard #2 (ENTRY_NOT_BOOKED) reason exakt text', () => {
  it('canCorrect returnerar exakt "Verifikatet måste vara bokfört." för draft-JE', () => {
    // Insert ett draft-JE direkt (manual-entry-flödet skapar inte JE förrän finalize).
    const ins = db
      .prepare(
        `INSERT INTO journal_entries (company_id, fiscal_year_id, verification_number,
                                       verification_series, journal_date, description, status, source_type)
         VALUES (?, ?, NULL, 'C', '2026-04-15', 'Direct draft', 'draft', 'manual')`,
      )
      .run(companyId, fiscalYearId)
    const draftJeId = Number(ins.lastInsertRowid)

    const result = canCorrectEntry(db, draftJeId)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.canCorrect).toBe(false)
    expect(result.data.reason).toBe('Verifikatet måste vara bokfört.')
  })

  it('createCorrectionEntry på draft-JE returnerar code=ENTRY_NOT_BOOKED med exakt reason', () => {
    const ins = db
      .prepare(
        `INSERT INTO journal_entries (company_id, fiscal_year_id, verification_number,
                                       verification_series, journal_date, description, status, source_type)
         VALUES (?, ?, NULL, 'C', '2026-04-15', 'Direct draft', 'draft', 'manual')`,
      )
      .run(companyId, fiscalYearId)
    const draftJeId = Number(ins.lastInsertRowid)

    const result = createCorrectionEntry(db, {
      journal_entry_id: draftJeId,
      fiscal_year_id: fiscalYearId,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('ENTRY_NOT_BOOKED')
    expect(result.error).toBe('Verifikatet måste vara bokfört.')
  })
})

describe('Sprint 61 — guard #1 (status === "corrected") branch isolation (L53)', () => {
  it('JE med status="corrected" men corrected_by_id=NULL → guard #1 träffar via status-grenen', () => {
    // Edge-case: manuellt UPDATE status='corrected' för att isolera || -höger
    // sida i L53 `corrected_by_id !== null || status === 'corrected'`.
    // OBS: trigger-skydd gör detta orealistiskt produktion, men testbart i
    // testfixturen genom direkt-INSERT.
    const ins = db
      .prepare(
        `INSERT INTO journal_entries (company_id, fiscal_year_id, verification_number,
                                       verification_series, journal_date, description, status, source_type)
         VALUES (?, ?, NULL, 'C', '2026-04-15', 'Direct corrected', 'corrected', 'manual')`,
      )
      .run(companyId, fiscalYearId)
    const id = Number(ins.lastInsertRowid)

    const result = canCorrectEntry(db, id)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.canCorrect).toBe(false)
    expect(result.data.reason).toBe('Verifikatet är redan korrigerat.')
  })
})

describe('Sprint 61 — guard #4 (HAS_DEPENDENT_PAYMENTS) reason (L98)', () => {
  it('createCorrectionEntry på faktura-betalning returnerar exakt reason för betalning', () => {
    // Skapa fakturans payment-JE → koppla via invoice_payments → guard #4 träffar.
    const original = bookManual()

    // Skapa en invoice + invoice_payment som pekar på original-JE
    // för att simulera "payment_journal_entry has dependent payment".
    // Enklare: skapa en dummy invoice + invoice_payment som pekar JE-id:t.
    db.prepare(
      `INSERT INTO counterparties (company_id, type, name) VALUES (?, 'customer', 'Test K')`,
    ).run(companyId)
    const cpId = Number(
      (db.prepare('SELECT last_insert_rowid() AS id').get() as { id: number })
        .id,
    )

    const inv = db
      .prepare(
        `INSERT INTO invoices (counterparty_id, fiscal_year_id, invoice_type, invoice_number,
                                invoice_date, due_date, net_amount_ore, total_amount_ore,
                                paid_amount_ore, vat_amount_ore, status, journal_entry_id)
         VALUES (?, ?, 'customer_invoice', '1', '2026-04-15', '2026-05-15',
                 100000, 100000, 0, 0, 'unpaid', ?)`,
      )
      .run(cpId, fiscalYearId, original.journalEntryId)
    const invId = Number(inv.lastInsertRowid)

    db.prepare(
      `INSERT INTO invoice_payments (invoice_id, journal_entry_id, payment_date,
                                      amount_ore, account_number)
       VALUES (?, ?, '2026-04-20', 100000, '1930')`,
    ).run(invId, original.journalEntryId)

    const result = createCorrectionEntry(db, {
      journal_entry_id: original.journalEntryId,
      fiscal_year_id: fiscalYearId,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('HAS_DEPENDENT_PAYMENTS')
    expect(result.error).toBe(
      'Verifikatet har beroende betalningar. Återför betalningarna först.',
    )
  })
})

describe('Sprint 61 — guard #6 (PERIOD_CLOSED) reason (L137)', () => {
  it('createCorrectionEntry när dagens period är stängd → exakt reason', () => {
    const original = bookManual()

    // Stäng jan-april sekventiellt (M93 kräver kronologisk stängning).
    const periods = db
      .prepare(
        `SELECT id, period_number FROM accounting_periods
         WHERE fiscal_year_id = ? AND period_number <= 4
         ORDER BY period_number`,
      )
      .all(fiscalYearId) as Array<{ id: number; period_number: number }>
    expect(periods.length).toBe(4)
    for (const p of periods) {
      const r = closePeriod(db, p.id)
      expect(r.success).toBe(true)
    }

    const result = createCorrectionEntry(db, {
      journal_entry_id: original.journalEntryId,
      fiscal_year_id: fiscalYearId,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('PERIOD_CLOSED')
    expect(result.error).toBe('Perioden för dagens datum är stängd.')
  })
})

describe('Sprint 61 — createCorrectionEntry ENTRY_NOT_FOUND inom transaktion (L202)', () => {
  it('returnerar exakt "Verifikatet hittades inte." vid bogus journal_entry_id', () => {
    const result = createCorrectionEntry(db, {
      journal_entry_id: 999999,
      fiscal_year_id: fiscalYearId,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('ENTRY_NOT_FOUND')
    expect(result.error).toBe('Verifikatet hittades inte.')
  })
})
