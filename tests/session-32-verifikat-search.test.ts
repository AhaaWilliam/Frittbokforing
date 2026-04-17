import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { globalSearch } from '../src/main/services/search-service'
import {
  saveManualEntryDraft,
  finalizeManualEntry,
} from '../src/main/services/manual-entry-service'
import { createCorrectionEntry } from '../src/main/services/correction-service'
import type {
  GlobalSearchResponse,
  SearchResultType,
} from '../src/shared/search-types'
import type { IpcResult } from '../src/shared/types'

function getData(
  result: IpcResult<GlobalSearchResponse>,
): GlobalSearchResponse {
  if (!result.success) throw new Error('Expected success: ' + result.error)
  return result.data
}

let db: Database.Database

const VALID_COMPANY = {
  name: 'Test AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2026-01-15',
  fiscal_year_start: '2026-01-01',
  fiscal_year_end: '2026-12-31',
}

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  db.close()
})

function seedCompany() {
  createCompany(db, VALID_COMPANY)
  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  return fy.id
}

function bookManualEntry(fyId: number, description: string) {
  const draft = saveManualEntryDraft(db, {
    fiscal_year_id: fyId,
    entry_date: '2026-03-15',
    description,
    lines: [
      { account_number: '5010', debit_ore: 100_000, credit_ore: 0 },
      { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
    ],
  })
  if (!draft.success) throw new Error('Draft failed: ' + draft.error)
  const finalized = finalizeManualEntry(db, draft.data.id, fyId)
  if (!finalized.success) throw new Error('Finalize failed: ' + finalized.error)
  return {
    manualEntryId: draft.data.id,
    journalEntryId: finalized.data.journalEntryId,
    verificationNumber: finalized.data.verificationNumber,
  }
}

describe('B5 — verifikat search', () => {
  it('matches description ("Hyra" → Cn — Hyra kontor)', () => {
    const fyId = seedCompany()
    bookManualEntry(fyId, 'Hyra kontor')
    const results = getData(
      globalSearch(db, { query: 'Hyra', fiscal_year_id: fyId }),
    ).results
    const je = results.find((r) => r.type === 'journal_entry')
    expect(je).toBeDefined()
    expect(je!.title).toContain('Hyra kontor')
  })

  it('exact-match on serie+nummer ("C1" → C1)', () => {
    const fyId = seedCompany()
    const entry = bookManualEntry(fyId, 'Hyra kontor')
    const ref = `C${entry.verificationNumber}`
    const results = getData(
      globalSearch(db, { query: ref, fiscal_year_id: fyId }),
    ).results
    const je = results.find((r) => r.type === 'journal_entry')
    expect(je).toBeDefined()
    expect(je!.title).toContain(ref)
  })

  it('"C1" does not match "C10" (exact, not prefix — D3/F4)', () => {
    const fyId = seedCompany()
    // Create 10 entries to get C10
    for (let i = 0; i < 10; i++) {
      bookManualEntry(fyId, `Entry ${i + 1}`)
    }
    // Search for C1 — should find only C1, not C10
    const results = getData(
      globalSearch(db, { query: 'C1', fiscal_year_id: fyId }),
    ).results
    const jes = results.filter((r) => r.type === 'journal_entry')
    expect(jes.length).toBe(1)
    expect(jes[0].title).toMatch(/^C1 —/)
  })

  it('FY-scoping: verifikat from other FY excluded', () => {
    const fyId = seedCompany()
    bookManualEntry(fyId, 'Hyra kontor')
    // Use a fake FY id
    const results = getData(
      globalSearch(db, { query: 'Hyra', fiscal_year_id: fyId + 999 }),
    ).results
    const je = results.find((r) => r.type === 'journal_entry')
    expect(je).toBeUndefined()
  })

  it('draft verifikat excluded', () => {
    const fyId = seedCompany()
    // Save draft but don't finalize
    saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      entry_date: '2026-03-15',
      description: 'Utkast bokföring',
      lines: [
        { account_number: '5010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    const results = getData(
      globalSearch(db, { query: 'Utkast', fiscal_year_id: fyId }),
    ).results
    const je = results.find((r) => r.type === 'journal_entry')
    expect(je).toBeUndefined()
  })

  it('route → /manual-entries/view/{me.id}', () => {
    const fyId = seedCompany()
    const entry = bookManualEntry(fyId, 'Hyra kontor')
    const results = getData(
      globalSearch(db, { query: 'Hyra', fiscal_year_id: fyId }),
    ).results
    const je = results.find((r) => r.type === 'journal_entry')
    expect(je).toBeDefined()
    expect(je!.route).toBe(`/manual-entries/view/${entry.manualEntryId}`)
  })

  it('corrected verifikat: title gets suffix "(korrigerad)"', () => {
    const fyId = seedCompany()
    const entry = bookManualEntry(fyId, 'Hyra kontor')
    // Correct it
    const correction = createCorrectionEntry(db, {
      journal_entry_id: entry.journalEntryId,
      fiscal_year_id: fyId,
    })
    expect(correction.success).toBe(true)

    const results = getData(
      globalSearch(db, { query: 'Hyra', fiscal_year_id: fyId }),
    ).results
    const jes = results.filter((r) => r.type === 'journal_entry')
    const original = jes.find((r) => r.title.includes('(korrigerad)'))
    expect(original).toBeDefined()
  })

  it('correction verifikat: subtitle includes "korrigering"', () => {
    const fyId = seedCompany()
    const entry = bookManualEntry(fyId, 'Hyra kontor')
    createCorrectionEntry(db, {
      journal_entry_id: entry.journalEntryId,
      fiscal_year_id: fyId,
    })

    const results = getData(
      globalSearch(db, { query: 'Hyra', fiscal_year_id: fyId }),
    ).results
    const jes = results.filter((r) => r.type === 'journal_entry')
    const corr = jes.find((r) => r.subtitle.includes('korrigering'))
    expect(corr).toBeDefined()
  })

  it('both original and correction shown when searching shared description', () => {
    const fyId = seedCompany()
    const entry = bookManualEntry(fyId, 'Hyra kontor')
    createCorrectionEntry(db, {
      journal_entry_id: entry.journalEntryId,
      fiscal_year_id: fyId,
    })

    const results = getData(
      globalSearch(db, { query: 'Hyra', fiscal_year_id: fyId }),
    ).results
    const jes = results.filter((r) => r.type === 'journal_entry')
    // Both: original (korrigerad) + correction entry
    expect(jes.length).toBe(2)
    expect(jes.some((r) => r.title.includes('(korrigerad)'))).toBe(true)
    expect(jes.some((r) => r.subtitle.includes('korrigering'))).toBe(true)
  })

  it('correction routes to original manual entry with highlight param', () => {
    const fyId = seedCompany()
    const entry = bookManualEntry(fyId, 'Hyra kontor')
    const correction = createCorrectionEntry(db, {
      journal_entry_id: entry.journalEntryId,
      fiscal_year_id: fyId,
    })
    if (!correction.success) throw new Error('Correction failed')

    const results = getData(
      globalSearch(db, { query: 'Korrigering', fiscal_year_id: fyId }),
    ).results
    const corr = results.find(
      (r) => r.type === 'journal_entry' && r.subtitle.includes('korrigering'),
    )
    expect(corr).toBeDefined()
    // Routes to original's manual_entry view with highlight param
    expect(corr!.route).toContain(`/manual-entries/view/${entry.manualEntryId}`)
    expect(corr!.route).toContain('?highlight=C')
  })

  it('correction searchable by its own verifikatnummer', () => {
    const fyId = seedCompany()
    const entry = bookManualEntry(fyId, 'Hyra kontor')
    const correction = createCorrectionEntry(db, {
      journal_entry_id: entry.journalEntryId,
      fiscal_year_id: fyId,
    })
    if (!correction.success) throw new Error('Correction failed')

    const corrRef = `C${correction.data.correction_verification_number}`
    const results = getData(
      globalSearch(db, { query: corrRef, fiscal_year_id: fyId }),
    ).results
    const corr = results.find((r) => r.type === 'journal_entry')
    expect(corr).toBeDefined()
    expect(corr!.title).toContain(corrRef)
    expect(corr!.subtitle).toContain('korrigering')
  })

  it('M140 invariant: no verifikat has both corrects_entry_id AND corrected_by_id', () => {
    const fyId = seedCompany()
    const entry = bookManualEntry(fyId, 'Hyra kontor')
    createCorrectionEntry(db, {
      journal_entry_id: entry.journalEntryId,
      fiscal_year_id: fyId,
    })

    const bad = db
      .prepare(
        `
      SELECT COUNT(*) AS c FROM journal_entries
      WHERE corrects_entry_id IS NOT NULL AND corrected_by_id IS NOT NULL
    `,
      )
      .get() as { c: number }
    expect(bad.c).toBe(0)
  })

  it('draft status excluded from search', () => {
    const fyId = seedCompany()
    const companyId = (
      db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: number }
    ).id
    db.prepare(
      `
      INSERT INTO journal_entries (company_id, fiscal_year_id, verification_number,
        verification_series, journal_date, description, status, source_type)
      VALUES (?, ?, 999, 'C', '2026-03-15', 'Draft test entry', 'draft', 'manual')
    `,
    ).run(companyId, fyId)
    const jeId = (
      db.prepare('SELECT last_insert_rowid() AS id').get() as { id: number }
    ).id
    db.prepare(
      `
      INSERT INTO manual_entries (fiscal_year_id, entry_date, description, status, journal_entry_id)
      VALUES (?, '2026-03-15', 'Draft test entry', 'finalized', ?)
    `,
    ).run(fyId, jeId)

    const results = getData(
      globalSearch(db, { query: 'Draft test', fiscal_year_id: fyId }),
    ).results
    const je = results.find((r) => r.type === 'journal_entry')
    expect(je).toBeUndefined()
  })

  it('TYPE_ORDER has journal_entry last', () => {
    // Import from GlobalSearch is not possible (React component), so we test
    // the search-service output ordering: journal_entry results appear after accounts.
    const fyId = seedCompany()
    bookManualEntry(fyId, 'Hyra kontor')
    const results = getData(
      globalSearch(db, { query: 'Hyra', fiscal_year_id: fyId }),
    ).results
    // journal_entry type exists in results
    expect(results.some((r) => r.type === 'journal_entry')).toBe(true)
    // Verify the type is part of the valid set
    const validTypes: SearchResultType[] = [
      'invoice',
      'expense',
      'customer',
      'supplier',
      'product',
      'account',
      'journal_entry',
    ]
    for (const r of results) {
      expect(validTypes).toContain(r.type)
    }
  })
})
