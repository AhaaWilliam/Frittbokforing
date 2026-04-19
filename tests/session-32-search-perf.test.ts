import { describe, it, expect } from 'vitest'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { globalSearch } from '../src/main/services/search-service'

const VALID_COMPANY = {
  name: 'Perf AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2026-01-15',
  fiscal_year_start: '2026-01-01',
  fiscal_year_end: '2026-12-31',
}

describe('globalSearch performance baseline (F13)', () => {
  it('1000 counterparties + search median < gate', () => {
    const db = createTestDb()
    createCompany(db, VALID_COMPANY)
    const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
      id: number
    }

    // Seed 1000 counterparties
    const insert = db.prepare(
      "INSERT INTO counterparties (company_id, name, type) VALUES (1, ?, 'customer')",
    )
    db.transaction(() => {
      for (let i = 0; i < 1000; i++) {
        insert.run(`Företag ${i} AB`)
      }
    })()

    // Warm up (JIT + prepared statement cache)
    for (let i = 0; i < 3; i++) {
      globalSearch(db, { query: 'Företag 500', fiscal_year_id: fy.id })
    }

    // Measure median of 7 runs
    const samples: number[] = []
    for (let i = 0; i < 7; i++) {
      const start = performance.now()
      globalSearch(db, { query: 'Företag 5', fiscal_year_id: fy.id })
      samples.push(performance.now() - start)
    }
    samples.sort((a, b) => a - b)
    const median = samples[3]

    const isCI = process.env.CI === 'true'
    const limit = isCI ? 500 : 200
    console.log(
      `  globalSearch median: ${median.toFixed(1)}ms (gate: ${limit}ms)`,
    )
    expect(median).toBeLessThan(limit)

    db.close()
  })

  it('1000 manual verifikat + search median < gate', () => {
    const db = createTestDb()
    createCompany(db, VALID_COMPANY)
    const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
      id: number
    }
    const companyId = (
      db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: number }
    ).id

    // Seed 1000 booked manual entries via direct SQL (faster than service calls).
    // Insert as draft first, add lines, then book — immutability trigger blocks
    // line inserts on booked entries.
    const insertJe = db.prepare(`
      INSERT INTO journal_entries (company_id, fiscal_year_id, verification_number,
        verification_series, journal_date, description, status, source_type)
      VALUES (?, ?, ?, 'C', '2026-03-15', ?, 'draft', 'manual')
    `)
    const insertMe = db.prepare(`
      INSERT INTO manual_entries (fiscal_year_id, entry_date, description,
        status, journal_entry_id)
      VALUES (?, '2026-03-15', ?, 'finalized', ?)
    `)
    const insertLine1 = db.prepare(`
      INSERT INTO journal_entry_lines (journal_entry_id, account_number,
        debit_ore, credit_ore, line_number)
      VALUES (?, '5010', 100000, 0, 1)
    `)
    const insertLine2 = db.prepare(`
      INSERT INTO journal_entry_lines (journal_entry_id, account_number,
        debit_ore, credit_ore, line_number)
      VALUES (?, '1930', 0, 100000, 2)
    `)
    const bookJe = db.prepare(
      "UPDATE journal_entries SET status = 'booked' WHERE id = ?",
    )
    db.transaction(() => {
      for (let i = 0; i < 1000; i++) {
        const je = insertJe.run(companyId, fy.id, i + 1, `Hyra kontor ${i}`)
        const jeId = je.lastInsertRowid
        insertMe.run(fy.id, `Hyra kontor ${i}`, jeId)
        insertLine1.run(jeId)
        insertLine2.run(jeId)
        bookJe.run(jeId)
      }
    })()

    // Warm up
    for (let i = 0; i < 3; i++) {
      globalSearch(db, { query: 'Hyra kontor 500', fiscal_year_id: fy.id })
    }

    // Measure description search
    const descSamples: number[] = []
    for (let i = 0; i < 7; i++) {
      const start = performance.now()
      globalSearch(db, { query: 'Hyra kontor 5', fiscal_year_id: fy.id })
      descSamples.push(performance.now() - start)
    }
    descSamples.sort((a, b) => a - b)
    const descMedian = descSamples[3]

    // Measure ref search
    const refSamples: number[] = []
    for (let i = 0; i < 7; i++) {
      const start = performance.now()
      globalSearch(db, { query: 'C500', fiscal_year_id: fy.id })
      refSamples.push(performance.now() - start)
    }
    refSamples.sort((a, b) => a - b)
    const refMedian = refSamples[3]

    const isCI = process.env.CI === 'true'
    const limit = isCI ? 500 : 200
    console.log(
      `  verifikat desc median: ${descMedian.toFixed(1)}ms, ref median: ${refMedian.toFixed(1)}ms (gate: ${limit}ms)`,
    )
    expect(descMedian).toBeLessThan(limit)
    expect(refMedian).toBeLessThan(limit)

    db.close()
  })
})
