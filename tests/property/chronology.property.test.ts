import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import BetterSqlite3 from 'better-sqlite3'
import { checkChronology } from '../../src/main/services/chronology-guard'

/**
 * Property-based tester för M142 — kronologisk datumordning inom verifikationsserie.
 *
 * Invariant: checkChronology avvisar entryDate som är strikt < senaste bokförda
 * datum i samma (fiscalYearId, series), och accepterar entryDate >= (inklusive
 * samma dag).
 *
 * Domän: datum ∈ [2024-01-01, 2025-12-31]. Serier: A, B, C, E, I, O.
 */

// Generator: ISO-datumsträng i domänen
const isoDate = fc.integer({ min: 0, max: 730 }).map((offset) => {
  const d = new Date('2024-01-01T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().substring(0, 10)
})

const seriesGen = fc.constantFrom('A', 'B', 'C', 'E', 'I', 'O')

function freshDb() {
  const db = new BetterSqlite3(':memory:')
  // Minimal schema för guard-testet: guarden läser bara journal_entries.
  db.exec(`
    CREATE TABLE journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fiscal_year_id INTEGER NOT NULL,
      verification_series TEXT NOT NULL,
      verification_number INTEGER NOT NULL,
      journal_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'booked'
    );
  `)
  return db
}

describe('checkChronology — M142 properties', () => {
  let db: BetterSqlite3.Database

  beforeEach(() => {
    db = freshDb()
  })
  afterEach(() => {
    db.close()
  })

  it('tom serie: allt tillåts', () => {
    fc.assert(
      fc.property(isoDate, seriesGen, (date, series) => {
        db.exec('DELETE FROM journal_entries')
        db.transaction(() => {
          // Ska aldrig kasta för tom serie
          checkChronology(db, 1, series, date)
        })()
      }),
      { numRuns: 200 },
    )
  })

  it('non-decreasing sekvens: guarden släpper igenom', () => {
    fc.assert(
      fc.property(
        fc.array(isoDate, { minLength: 2, maxLength: 20 }),
        (dates) => {
          const sorted = [...dates].sort()
          db.exec('DELETE FROM journal_entries')
          db.transaction(() => {
            for (let i = 0; i < sorted.length; i++) {
              const date = sorted[i]
              checkChronology(db, 1, 'A', date) // ska inte kasta
              db.prepare(
                'INSERT INTO journal_entries (fiscal_year_id, verification_series, verification_number, journal_date) VALUES (?, ?, ?, ?)',
              ).run(1, 'A', i + 1, date)
            }
          })()
        },
      ),
      { numRuns: 100 },
    )
  })

  it('decreasing par: guarden avvisar det senare datumet', () => {
    fc.assert(
      fc.property(
        fc.tuple(isoDate, isoDate).filter(([a, b]) => a > b), // a är senare än b
        ([laterDate, earlierDate]) => {
          db.exec('DELETE FROM journal_entries')
          db.transaction(() => {
            db.prepare(
              'INSERT INTO journal_entries (fiscal_year_id, verification_series, verification_number, journal_date) VALUES (?, ?, ?, ?)',
            ).run(1, 'A', 1, laterDate)
          })()
          db.transaction(() => {
            expect(() => checkChronology(db, 1, 'A', earlierDate)).toThrow()
            // strukturerat kastat {code, error, field}
            try {
              checkChronology(db, 1, 'A', earlierDate)
            } catch (err) {
              expect(err).toMatchObject({
                code: 'VALIDATION_ERROR',
                field: 'date',
              })
            }
          })()
        },
      ),
      { numRuns: 200 },
    )
  })

  it('samma datum tillåts (strict less-than, inte ≤)', () => {
    fc.assert(
      fc.property(isoDate, seriesGen, (date, series) => {
        db.exec('DELETE FROM journal_entries')
        db.transaction(() => {
          db.prepare(
            'INSERT INTO journal_entries (fiscal_year_id, verification_series, verification_number, journal_date) VALUES (?, ?, ?, ?)',
          ).run(1, series, 1, date)
        })()
        db.transaction(() => {
          // Samma datum ska inte kasta
          checkChronology(db, 1, series, date)
        })()
      }),
      { numRuns: 200 },
    )
  })

  it('serie-isolation: krav gäller per serie', () => {
    fc.assert(
      fc.property(
        isoDate,
        isoDate,
        seriesGen,
        seriesGen,
        (dateA, dateB, seriesA, seriesB) => {
          if (seriesA === seriesB) return // slipp triviala overlap
          db.exec('DELETE FROM journal_entries')
          db.transaction(() => {
            // Bokför sent datum i seriesA
            db.prepare(
              'INSERT INTO journal_entries (fiscal_year_id, verification_series, verification_number, journal_date) VALUES (?, ?, ?, ?)',
            ).run(1, seriesA, 1, '2025-12-31')
          })()
          db.transaction(() => {
            // Tidigt datum i seriesB ska tillåtas (annan serie)
            checkChronology(db, 1, seriesB, dateA)
            checkChronology(db, 1, seriesB, dateB)
          })()
        },
      ),
      { numRuns: 100 },
    )
  })

  it('fiscal-year-isolation: krav gäller per FY', () => {
    fc.assert(
      fc.property(isoDate, isoDate, (lateDate, earlyDate) => {
        if (lateDate <= earlyDate) return
        db.exec('DELETE FROM journal_entries')
        db.transaction(() => {
          db.prepare(
            'INSERT INTO journal_entries (fiscal_year_id, verification_series, verification_number, journal_date) VALUES (?, ?, ?, ?)',
          ).run(1, 'A', 1, lateDate)
        })()
        db.transaction(() => {
          // Annan FY — guarden ska inte blockera
          checkChronology(db, 2, 'A', earlyDate)
        })()
      }),
      { numRuns: 100 },
    )
  })

  it('kastar Error om ej i transaktion', () => {
    expect(() => checkChronology(db, 1, 'A', '2024-01-01')).toThrow(
      /transaction/i,
    )
  })
})
