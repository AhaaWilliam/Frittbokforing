import { describe, it } from 'vitest'
import fc from 'fast-check'
import type Database from 'better-sqlite3'
import { createTestDb } from '../helpers/create-test-db'
import { createCompany } from '../../src/main/services/company-service'
import {
  closePeriod,
  reopenPeriod,
  listFiscalPeriods,
} from '../../src/main/services/fiscal-service'

/**
 * FiscalYear period-lifecycle state-machine (TT-3).
 *
 * States per period: open (is_closed=0) ⇄ closed (is_closed=1)
 *
 * Commands: ClosePeriod(i), ReopenPeriod(i)
 *
 * Invarianter:
 *   I1: Stängda perioder formar alltid ett prefix (1..N stängda, N+1..12 öppna).
 *       Aldrig hål i stängd-sekvensen.
 *   I2: ClosePeriod på period N fungerar bara om alla period < N är stängda.
 *   I3: ReopenPeriod fungerar bara om inga senare perioder är stängda.
 *
 * Setup: createCompany auto-skapar 12 månadsperioder för det angivna FY.
 */

function ok<T>(
  r:
    | { success: true; data: T }
    | { success: false; error: string; code?: string },
): T {
  if (!r.success) throw new Error(`${r.code}: ${r.error}`)
  return r.data
}

interface ModelState {
  // Spegla is_closed per period-index (1-12)
  closed: boolean[]
}

interface World {
  db: Database.Database
  fyId: number
  periodIds: number[] // index i = period_number i
}

function setup(): { model: ModelState; real: World } {
  const db = createTestDb()
  ok(
    createCompany(db, {
      name: 'SM AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2',
      share_capital: 2_500_000,
      registration_date: '2025-01-15',
      fiscal_year_start: '2026-01-01',
      fiscal_year_end: '2026-12-31',
    }),
  )
  const fyId = (
    db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  ).id
  const periods = listFiscalPeriods(db, fyId)
  // Map period_number → id
  const periodIds = [0]
  periods
    .sort((a, b) => a.period_number - b.period_number)
    .forEach((p) => {
      periodIds[p.period_number] = p.id
    })
  return {
    model: { closed: new Array(13).fill(false) }, // 1-indexed, 1..12
    real: { db, fyId, periodIds },
  }
}

function assertInvariants(model: ModelState, world: World): void {
  // I1: stängda perioder formar ett prefix
  let lastClosed = 0
  for (let i = 1; i <= 12; i++) {
    if (model.closed[i]) lastClosed = i
    else break
  }
  for (let i = lastClosed + 1; i <= 12; i++) {
    if (model.closed[i]) {
      throw new Error(
        `I1 violated: period ${i} stängd men period ${lastClosed + 1} öppen`,
      )
    }
  }

  // Model vs real
  for (let i = 1; i <= 12; i++) {
    const row = world.db
      .prepare('SELECT is_closed FROM accounting_periods WHERE id = ?')
      .get(world.periodIds[i]) as { is_closed: number } | undefined
    if (!row) continue
    const realClosed = row.is_closed === 1
    if (realClosed !== model.closed[i]) {
      throw new Error(
        `period ${i}: model.closed=${model.closed[i]} real.closed=${realClosed}`,
      )
    }
  }
}

class ClosePeriodCmd implements fc.Command<ModelState, World> {
  constructor(readonly periodNumber: number) {}
  check() {
    return true
  }
  run(model: ModelState, world: World): void {
    const r = closePeriod(world.db, world.periodIds[this.periodNumber])
    if (r.success) {
      model.closed[this.periodNumber] = true
    } else {
      // Förväntade fel: period före inte stängd, FY stängt, etc.
      // Model oförändrat.
    }
    assertInvariants(model, world)
  }
  toString() {
    return `Close(${this.periodNumber})`
  }
}

class ReopenPeriodCmd implements fc.Command<ModelState, World> {
  constructor(readonly periodNumber: number) {}
  check() {
    return true
  }
  run(model: ModelState, world: World): void {
    const r = reopenPeriod(world.db, world.periodIds[this.periodNumber])
    if (r.success) {
      model.closed[this.periodNumber] = false
    }
    assertInvariants(model, world)
  }
  toString() {
    return `Reopen(${this.periodNumber})`
  }
}

describe('FiscalYear period-lifecycle — state-machine', () => {
  it(
    '50 slumpade sekvenser bevarar prefix-invarianten',
    { timeout: 60_000 },
    () => {
      const periodGen = fc.integer({ min: 1, max: 12 })
      const allCommands = [
        periodGen.map((i) => new ClosePeriodCmd(i)),
        periodGen.map((i) => new ReopenPeriodCmd(i)),
      ]

      fc.assert(
        fc.property(fc.commands(allCommands, { maxCommands: 20 }), (cmds) => {
          fc.modelRun(setup, cmds)
        }),
        { numRuns: 50 },
      )
    },
  )
})
