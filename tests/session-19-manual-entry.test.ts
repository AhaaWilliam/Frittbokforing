import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import {
  saveManualEntryDraft,
  getManualEntry,
  updateManualEntryDraft,
  deleteManualEntryDraft,
  listManualEntryDrafts,
  listManualEntries,
  finalizeManualEntry,
} from '../src/main/services/manual-entry-service'

let db: Database.Database

const VALID_COMPANY = {
  name: 'Test AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2025-01-15',
  fiscal_year_start: '2025-01-01',
  fiscal_year_end: '2025-12-31',
}

let fyId: number

beforeEach(() => {
  db = createTestDb()
  createCompany(db, VALID_COMPANY)
  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  fyId = fy.id
})

afterEach(() => {
  db.close()
})

describe('Migration 011', () => {
  it('sätter user_version till 11', () => {
    const v = db.pragma('user_version', { simple: true }) as number
    expect(v).toBe(27) // S48: Uppdatera vid nya migrationer
  })

  it('manual_entries-tabell skapas', () => {
    const cols = db
      .pragma('table_info(manual_entries)')
      .map((c: { name: string }) => c.name)
    expect(cols).toContain('id')
    expect(cols).toContain('fiscal_year_id')
    expect(cols).toContain('entry_date')
    expect(cols).toContain('description')
    expect(cols).toContain('status')
    expect(cols).toContain('journal_entry_id')
  })

  it('manual_entry_lines-tabell skapas med UNIQUE constraint', () => {
    const cols = db
      .pragma('table_info(manual_entry_lines)')
      .map((c: { name: string }) => c.name)
    expect(cols).toContain('manual_entry_id')
    expect(cols).toContain('line_number')
    expect(cols).toContain('account_number')
    expect(cols).toContain('debit_ore')
    expect(cols).toContain('credit_ore')
  })

  it('22 tabeller totalt', () => {
    const count = (
      db
        .prepare(
          "SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .get() as { c: number }
    ).c
    expect(count).toBe(23)
  })
})

describe('Draft CRUD', () => {
  it('saveDraft skapar med status draft och returnerar id', () => {
    const r = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      entry_date: '2025-03-15',
      description: 'Löner mars',
      lines: [
        { account_number: '7010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.id).toBeGreaterThan(0)

    const entry = db
      .prepare('SELECT status FROM manual_entries WHERE id = ?')
      .get(r.data.id) as { status: string }
    expect(entry.status).toBe('draft')
  })

  it('saveDraft sparar rader med korrekt line_number', () => {
    const r = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      lines: [
        { account_number: '7010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    expect(r.success).toBe(true)
    if (!r.success) return

    const lines = db
      .prepare(
        'SELECT line_number FROM manual_entry_lines WHERE manual_entry_id = ? ORDER BY line_number',
      )
      .all(r.data.id) as { line_number: number }[]
    expect(lines.map((l) => l.line_number)).toEqual([1, 2])
  })

  it('saveDraft filtrerar bort tomma rader', () => {
    const r = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      lines: [
        { account_number: '7010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '', debit_ore: 0, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    expect(r.success).toBe(true)
    if (!r.success) return

    const count = (
      db
        .prepare(
          'SELECT COUNT(*) as c FROM manual_entry_lines WHERE manual_entry_id = ?',
        )
        .get(r.data.id) as { c: number }
    ).c
    expect(count).toBe(2)
  })

  it('get returnerar entry med rader', () => {
    const saved = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      entry_date: '2025-03-15',
      description: 'Test',
      lines: [
        {
          account_number: '7010',
          debit_ore: 100_000,
          credit_ore: 0,
          description: 'Löner',
        },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    expect(saved.success).toBe(true)
    if (!saved.success) return

    const r = getManualEntry(db, saved.data.id)
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.entry_date).toBe('2025-03-15')
    expect(r.data.description).toBe('Test')
    expect(r.data.lines.length).toBe(2)
    expect(r.data.lines[0].account_number).toBe('7010')
  })

  it('updateDraft uppdaterar och ersätter rader', () => {
    const saved = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      lines: [
        { account_number: '7010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    expect(saved.success).toBe(true)
    if (!saved.success) return

    const r = updateManualEntryDraft(db, {
      id: saved.data.id,
      entry_date: '2025-04-01',
      description: 'Uppdaterad',
      lines: [
        { account_number: '5010', debit_ore: 200_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 200_000 },
      ],
    })
    expect(r.success).toBe(true)

    const got = getManualEntry(db, saved.data.id)
    expect(got.success).toBe(true)
    if (!got.success) return
    expect(got.data.description).toBe('Uppdaterad')
    expect(got.data.lines[0].account_number).toBe('5010')
    expect(got.data.lines[0].debit_ore).toBe(200_000)
  })

  it('updateDraft kastar om finaliserad', () => {
    const saved = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      entry_date: '2025-03-15',
      lines: [
        { account_number: '7010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    expect(saved.success).toBe(true)
    if (!saved.success) return

    finalizeManualEntry(db, saved.data.id, fyId)

    const r = updateManualEntryDraft(db, {
      id: saved.data.id,
      lines: [
        { account_number: '5010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    expect(r.success).toBe(false)
  })

  it('deleteDraft raderar entry och rader (CASCADE)', () => {
    const saved = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      lines: [
        { account_number: '7010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    expect(saved.success).toBe(true)
    if (!saved.success) return

    const r = deleteManualEntryDraft(db, saved.data.id)
    expect(r.success).toBe(true)

    const entry = db
      .prepare('SELECT * FROM manual_entries WHERE id = ?')
      .get(saved.data.id)
    expect(entry).toBeUndefined()

    const lines = db
      .prepare('SELECT * FROM manual_entry_lines WHERE manual_entry_id = ?')
      .all(saved.data.id)
    expect(lines.length).toBe(0)
  })

  it('listDrafts returnerar bara drafts för rätt FY', () => {
    saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      lines: [
        { account_number: '7010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    const drafts = listManualEntryDrafts(db, fyId)
    expect(drafts.length).toBe(1)
    expect(drafts[0].status).toBe('draft')
  })
})

describe('Finalize', () => {
  it('skapar journal_entry med series=C och korrekt nummer', () => {
    const saved = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      entry_date: '2025-03-15',
      description: 'Löner mars',
      lines: [
        { account_number: '7010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    expect(saved.success).toBe(true)
    if (!saved.success) return

    const r = finalizeManualEntry(db, saved.data.id, fyId)
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.verificationNumber).toBe(1)

    const je = db
      .prepare('SELECT * FROM journal_entries WHERE id = ?')
      .get(r.data.journalEntryId) as {
      verification_series: string
      verification_number: number
      status: string
    }
    expect(je.verification_series).toBe('C')
    expect(je.verification_number).toBe(1)
    expect(je.status).toBe('booked')
  })

  it('skapar journal_entry_lines som matchar manual_entry_lines', () => {
    const saved = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      entry_date: '2025-03-15',
      description: 'Test',
      lines: [
        {
          account_number: '7010',
          debit_ore: 250_000,
          credit_ore: 0,
          description: 'Löner',
        },
        {
          account_number: '1930',
          debit_ore: 0,
          credit_ore: 250_000,
          description: 'Bank',
        },
      ],
    })
    expect(saved.success).toBe(true)
    if (!saved.success) return

    const r = finalizeManualEntry(db, saved.data.id, fyId)
    expect(r.success).toBe(true)
    if (!r.success) return

    const jels = db
      .prepare(
        'SELECT * FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
      )
      .all(r.data.journalEntryId) as {
      account_number: string
      debit_ore: number
      credit_ore: number
      description: string
    }[]
    expect(jels.length).toBe(2)
    expect(jels[0].account_number).toBe('7010')
    expect(jels[0].debit_ore).toBe(250_000)
    expect(jels[0].description).toBe('Löner')
    expect(jels[1].account_number).toBe('1930')
    expect(jels[1].credit_ore).toBe(250_000)
  })

  it('kopierar description till journal_entry', () => {
    const saved = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      entry_date: '2025-03-15',
      description: 'Löner mars 2025',
      lines: [
        { account_number: '7010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    if (!saved.success) return

    const r = finalizeManualEntry(db, saved.data.id, fyId)
    if (!r.success) return

    const je = db
      .prepare('SELECT description FROM journal_entries WHERE id = ?')
      .get(r.data.journalEntryId) as { description: string }
    expect(je.description).toBe('Löner mars 2025')
  })

  it('uppdaterar status till finalized och sätter journal_entry_id', () => {
    const saved = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      entry_date: '2025-03-15',
      lines: [
        { account_number: '7010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    if (!saved.success) return

    const r = finalizeManualEntry(db, saved.data.id, fyId)
    if (!r.success) return

    const me = db
      .prepare('SELECT * FROM manual_entries WHERE id = ?')
      .get(saved.data.id) as { status: string; journal_entry_id: number }
    expect(me.status).toBe('finalized')
    expect(me.journal_entry_id).toBe(r.data.journalEntryId)
  })

  it('gaplöst C-serienummer (2:a finalize → C-2)', () => {
    // First entry
    const s1 = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      entry_date: '2025-03-15',
      lines: [
        { account_number: '7010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    if (!s1.success) return
    const r1 = finalizeManualEntry(db, s1.data.id, fyId)
    if (!r1.success) return
    expect(r1.data.verificationNumber).toBe(1)

    // Second entry
    const s2 = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      entry_date: '2025-04-01',
      lines: [
        { account_number: '5010', debit_ore: 50_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 50_000 },
      ],
    })
    if (!s2.success) return
    const r2 = finalizeManualEntry(db, s2.data.id, fyId)
    if (!r2.success) return
    expect(r2.data.verificationNumber).toBe(2)
  })

  it('C-serienummer oberoende av A- och B-serierna', () => {
    // Create A-series entry (simulate invoice finalize)
    db.prepare(
      `INSERT INTO journal_entries (company_id, fiscal_year_id, verification_number, verification_series, journal_date, description, status, source_type)
     VALUES ((SELECT id FROM companies LIMIT 1), ?, 1, 'A', '2025-01-15', 'Faktura', 'draft', 'auto_invoice')`,
    ).run(fyId)

    // C-series should start at 1
    const saved = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      entry_date: '2025-03-15',
      lines: [
        { account_number: '7010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    if (!saved.success) return
    const r = finalizeManualEntry(db, saved.data.id, fyId)
    if (!r.success) return
    expect(r.data.verificationNumber).toBe(1)
  })

  it('filtrerar bort tomma rader före validering', () => {
    const saved = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      entry_date: '2025-03-15',
      lines: [
        { account_number: '7010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '', debit_ore: 0, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    if (!saved.success) return
    const r = finalizeManualEntry(db, saved.data.id, fyId)
    expect(r.success).toBe(true)
  })
})

describe('Validation', () => {
  it('kastar om debet ≠ kredit', () => {
    const saved = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      entry_date: '2025-03-15',
      lines: [
        { account_number: '7010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 50_000 },
      ],
    })
    if (!saved.success) return
    const r = finalizeManualEntry(db, saved.data.id, fyId)
    expect(r.success).toBe(false)
    expect(r.error).toContain('Obalanserad')
  })

  it('kastar om datum saknas', () => {
    const saved = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      lines: [
        { account_number: '7010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    if (!saved.success) return
    const r = finalizeManualEntry(db, saved.data.id, fyId)
    expect(r.success).toBe(false)
    expect(r.error).toContain('Datum')
  })

  it('kastar om datum utanför FY', () => {
    const saved = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      entry_date: '2024-12-31',
      lines: [
        { account_number: '7010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    if (!saved.success) return
    const r = finalizeManualEntry(db, saved.data.id, fyId)
    expect(r.success).toBe(false)
    expect(r.error).toContain('utanför')
  })

  it('kastar om perioden är stängd', () => {
    // Close January
    db.prepare(
      'UPDATE accounting_periods SET is_closed = 1 WHERE fiscal_year_id = ? AND period_number = 1',
    ).run(fyId)

    const saved = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      entry_date: '2025-01-15',
      lines: [
        { account_number: '7010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    if (!saved.success) return
    const r = finalizeManualEntry(db, saved.data.id, fyId)
    expect(r.success).toBe(false)
    expect(r.error).toContain('stängd')
  })

  it('kastar om konto inte finns', () => {
    const saved = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      entry_date: '2025-03-15',
      lines: [
        { account_number: '9999', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    if (!saved.success) return
    const r = finalizeManualEntry(db, saved.data.id, fyId)
    expect(r.success).toBe(false)
    expect(r.error).toContain('Ogiltigt konto')
  })

  it('kastar om redan bokförd', () => {
    const saved = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      entry_date: '2025-03-15',
      lines: [
        { account_number: '7010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    if (!saved.success) return
    finalizeManualEntry(db, saved.data.id, fyId)
    const r = finalizeManualEntry(db, saved.data.id, fyId)
    expect(r.success).toBe(false)
    expect(r.error).toContain('bokförd')
  })
})

describe('List finalized', () => {
  it('returnerar bara finaliserade för rätt FY', () => {
    const saved = saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      entry_date: '2025-03-15',
      description: 'Löner',
      lines: [
        { account_number: '7010', debit_ore: 100_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 100_000 },
      ],
    })
    if (!saved.success) return
    finalizeManualEntry(db, saved.data.id, fyId)

    // Draft that should NOT appear
    saveManualEntryDraft(db, {
      fiscal_year_id: fyId,
      lines: [
        { account_number: '7010', debit_ore: 50_000, credit_ore: 0 },
        { account_number: '1930', debit_ore: 0, credit_ore: 50_000 },
      ],
    })

    const list = listManualEntries(db, fyId)
    expect(list.length).toBe(1)
    expect(list[0].verification_series).toBe('C')
    expect(list[0].verification_number).toBe(1)
    expect(list[0].total_amount).toBe(100_000)
  })
})

describe('parseSwedishAmount', () => {
  // Inline test of the logic
  function parseSwedishAmount(input: string): number {
    if (!input || input.trim() === '') return 0
    const sanitized = input.replace(/\s/g, '').replace(',', '.')
    const value = parseFloat(sanitized)
    if (isNaN(value)) return 0
    return Math.round(value * 100)
  }

  it('"5000" → 500000', () => expect(parseSwedishAmount('5000')).toBe(500000))
  it('"5 000" → 500000', () => expect(parseSwedishAmount('5 000')).toBe(500000))
  it('"5000,00" → 500000', () =>
    expect(parseSwedishAmount('5000,00')).toBe(500000))
  it('"5 000,50" → 500050', () =>
    expect(parseSwedishAmount('5 000,50')).toBe(500050))
  it('"" → 0', () => expect(parseSwedishAmount('')).toBe(0))
  it('"abc" → 0', () => expect(parseSwedishAmount('abc')).toBe(0))
})
