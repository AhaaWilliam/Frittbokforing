/**
 * Imported entries service + IPC schema test.
 * Covers: Alt 3 list-kanal för I-serie (source_type='import').
 */
import { describe, it, expect } from 'vitest'
import { createTestDb } from './helpers/create-test-db'
import { listImportedEntries } from '../src/main/services/imported-entry-service'
import { ListImportedEntriesSchema } from '../src/shared/ipc-schemas'
import { createCompany } from '../src/main/services/company-service'

describe('ListImportedEntriesSchema', () => {
  it('accepts valid fiscal_year_id', () => {
    expect(
      ListImportedEntriesSchema.safeParse({ fiscal_year_id: 1 }).success,
    ).toBe(true)
  })

  it('rejects missing fiscal_year_id', () => {
    expect(ListImportedEntriesSchema.safeParse({}).success).toBe(false)
  })

  it('rejects extra properties', () => {
    expect(
      ListImportedEntriesSchema.safeParse({ fiscal_year_id: 1, x: 2 }).success,
    ).toBe(false)
  })
})

describe('listImportedEntries', () => {
  function seed() {
    const db = createTestDb()
    const cp = createCompany(db, {
      name: 'Test AB',
      org_number: '556677-8899',
      fiscal_rule: 'K2',
      share_capital: 50000_00,
      registration_date: '2025-01-01',
      fiscal_year_start: '2025-01-01',
      fiscal_year_end: '2025-12-31',
    })
    if (!cp.success) throw new Error('Company failed')
    const fy = db
      .prepare('SELECT id FROM fiscal_years LIMIT 1')
      .get() as { id: number }
    return { db, companyId: cp.data.id, fyId: fy.id }
  }

  function insertJe(
    db: ReturnType<typeof createTestDb>,
    opts: {
      companyId: number
      fyId: number
      series: string
      num: number
      sourceType: string
      date?: string
      desc?: string
      ref?: string
      amountOre?: number
    },
  ) {
    const res = db
      .prepare(
        `INSERT INTO journal_entries (
          company_id, fiscal_year_id, verification_number, verification_series,
          journal_date, description, status, source_type, source_reference
        ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
      )
      .run(
        opts.companyId,
        opts.fyId,
        opts.num,
        opts.series,
        opts.date ?? '2025-06-15',
        opts.desc ?? 'Test',
        opts.sourceType,
        opts.ref ?? null,
      )
    const jeId = Number(res.lastInsertRowid)
    const amount = opts.amountOre ?? 100000
    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
       VALUES (?, 1, '1930', ?, 0), (?, 2, '3001', 0, ?)`,
    ).run(jeId, amount, jeId, amount)
    db.prepare("UPDATE journal_entries SET status='booked' WHERE id = ?").run(
      jeId,
    )
    return jeId
  }

  it('returnerar tom array för FY utan importer', () => {
    const { db, fyId } = seed()
    expect(listImportedEntries(db, fyId)).toEqual([])
  })

  it('returnerar bara I-serie med source_type=import', () => {
    const { db, companyId, fyId } = seed()

    insertJe(db, {
      companyId,
      fyId,
      series: 'I',
      num: 1,
      sourceType: 'import',
      ref: 'sie4:A1',
      desc: '[Import A1] Försäljning',
      amountOre: 125000,
    })
    // Annan serie
    insertJe(db, {
      companyId,
      fyId,
      series: 'C',
      num: 1,
      sourceType: 'manual',
      desc: 'Manuell',
    })
    // I-serie men annat source_type — bör filtreras bort
    insertJe(db, {
      companyId,
      fyId,
      series: 'I',
      num: 99,
      sourceType: 'manual',
      desc: 'Ej import',
    })

    const result = listImportedEntries(db, fyId)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      verification_series: 'I',
      verification_number: 1,
      source_reference: 'sie4:A1',
      total_amount_ore: 125000,
      description: '[Import A1] Försäljning',
    })
  })

  it('sorterar med högsta verifikationsnumret först', () => {
    const { db, companyId, fyId } = seed()
    insertJe(db, { companyId, fyId, series: 'I', num: 1, sourceType: 'import' })
    insertJe(db, { companyId, fyId, series: 'I', num: 3, sourceType: 'import' })
    insertJe(db, { companyId, fyId, series: 'I', num: 2, sourceType: 'import' })

    const result = listImportedEntries(db, fyId)
    expect(result.map((r) => r.verification_number)).toEqual([3, 2, 1])
  })

  it('scopar på fiscal_year_id', () => {
    const { db, companyId, fyId } = seed()
    const fy2Res = db
      .prepare(
        `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date, is_closed)
         VALUES (?, '2024', '2024-01-01', '2024-12-31', 0)`,
      )
      .run(companyId)
    const fy2Id = Number(fy2Res.lastInsertRowid)

    insertJe(db, { companyId, fyId, series: 'I', num: 1, sourceType: 'import' })
    insertJe(db, {
      companyId,
      fyId: fy2Id,
      series: 'I',
      num: 1,
      sourceType: 'import',
      date: '2024-06-01',
    })

    expect(listImportedEntries(db, fyId)).toHaveLength(1)
    expect(listImportedEntries(db, fy2Id)).toHaveLength(1)
  })
})
