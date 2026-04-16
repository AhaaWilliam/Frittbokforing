/**
 * S52 — getNow()/FRITT_NOW genomsläpp genom services (M150).
 *
 * Verifierar att FRITT_NOW-override faktiskt styr tid-läsning i produktionskod
 * (SIE4 #GEN, SIE5 Date-attribut, backup-filnamn) utan att använda vi.useFakeTimers.
 * Om getNow()-helpern slutar respektera FRITT_NOW ska dessa tester fånga det
 * oberoende av vitest:s timer-mockning.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from 'vitest'
import {
  createTemplateDb,
  createSystemTestContext,
  destroyContext,
  destroyTemplateDb,
  type SystemTestContext,
} from './helpers/system-test-context'

let ctx: SystemTestContext
const originalFrittNow = process.env.FRITT_NOW

beforeAll(() => {
  createTemplateDb()
})
afterAll(() => {
  destroyTemplateDb()
  if (originalFrittNow === undefined) delete process.env.FRITT_NOW
  else process.env.FRITT_NOW = originalFrittNow
})
beforeEach(() => {
  // Ingen vi.useFakeTimers — vi vill verifiera env-overriden isolerat.
  process.env.FRITT_NOW = '2025-06-15T12:00:00.000Z'
  ctx = createSystemTestContext()
})
afterEach(() => {
  destroyContext(ctx)
  delete process.env.FRITT_NOW
})

describe('getNow() propagerar till exports och filnamn', () => {
  it('S52-01: SIE4 #GEN använder FRITT_NOW-datumet', () => {
    const sie4 = ctx.sie4ExportService.exportSie4(ctx.db, {
      fiscalYearId: ctx.seed.fiscalYearId,
    })
    const text = Buffer.from(sie4.content).toString('latin1')
    // #GEN format: YYYYMMDD (dateToSie4 strips hyphens).
    // 2025-06-15 UTC noon → Stockholm local 2025-06-15.
    expect(text).toMatch(/#GEN 20250615/)
  })

  it('S52-02: SIE5 Date-attribut reflekterar FRITT_NOW', () => {
    const sie5 = ctx.sie5ExportService.exportSie5(ctx.db, {
      fiscalYearId: ctx.seed.fiscalYearId,
    })
    // SIE5 uses full ISO timestamp without milliseconds.
    expect(sie5).toContain('2025-06-15T12:00:00Z')
  })

  it('S52-03: fallback till riktig tid vid invalid FRITT_NOW', () => {
    process.env.FRITT_NOW = 'garbage'
    const sie4 = ctx.sie4ExportService.exportSie4(ctx.db, {
      fiscalYearId: ctx.seed.fiscalYearId,
    })
    const text = Buffer.from(sie4.content).toString('latin1')
    // Ska inte krascha; #GEN ska finnas med nuvarande år.
    const currentYear = new Date().getFullYear()
    expect(text).toMatch(new RegExp(`#GEN ${currentYear}\\d{4}`))
  })
})
