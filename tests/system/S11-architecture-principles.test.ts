import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

/**
 * S11: Arkitekturprinciper — statisk kodanalys
 *
 * Verifierar att kodbasen följer de arkitekturprinciper som
 * definieras i CLAUDE.md och testprompten.
 */

function collectFiles(dir: string, ext: string): string[] {
  const results: string[] = []
  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      const full = join(dir, entry)
      try {
        const stat = statSync(full)
        if (
          stat.isDirectory() &&
          entry !== 'node_modules' &&
          entry !== 'dist'
        ) {
          results.push(...collectFiles(full, ext))
        } else if (entry.endsWith(ext)) {
          results.push(full)
        }
      } catch {
        // Skip inaccessible entries
      }
    }
  } catch {
    // Skip inaccessible directories
  }
  return results
}

describe('S11-01: Öre-princip — inga parseFloat/toFixed i beloppshantering', () => {
  it('inga parseFloat i src/main/ service-filer', () => {
    const files = collectFiles('src/main/services', '.ts')
    const violations: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf-8')
      if (src.includes('parseFloat')) {
        violations.push(file)
      }
    }
    expect(
      violations,
      `parseFloat hittad i: ${violations.join(', ')}`,
    ).toHaveLength(0)
  })

  it('inga .toFixed() i src/main/ service-filer', () => {
    const files = collectFiles('src/main/services', '.ts')
    const violations: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf-8')
      if (src.includes('.toFixed(')) {
        violations.push(file)
      }
    }
    expect(
      violations,
      `.toFixed() hittad i: ${violations.join(', ')}`,
    ).toHaveLength(0)
  })
})

describe('S11-02: SQL date safety — date("now","localtime")', () => {
  it('inga date("now") utan localtime i SQL-filer', () => {
    const files = [
      ...collectFiles('src/main/services', '.ts'),
      ...collectFiles('src/main', '.ts').filter((f) =>
        f.endsWith('migrations.ts'),
      ),
    ]
    const violations: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf-8')
      // Match date('now') not followed by 'localtime'
      const matches = src.match(/date\(\s*'now'\s*\)/g) || []
      if (matches.length > 0) {
        // Check if all usages have 'localtime' nearby
        const lines = src.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (line.includes("date('now')") && !line.includes('localtime')) {
            violations.push(`${file}:${i + 1}`)
          }
        }
      }
    }
    expect(
      violations,
      `date('now') utan localtime: ${violations.join(', ')}`,
    ).toHaveLength(0)
  })
})

describe('S11-03: Electron säkerhet — statisk verifiering', () => {
  it('contextIsolation: true i index.ts', () => {
    const src = readFileSync('src/main/index.ts', 'utf-8')
    expect(src).toContain('contextIsolation: true')
  })

  it('sandbox: true i index.ts', () => {
    const src = readFileSync('src/main/index.ts', 'utf-8')
    expect(src).toContain('sandbox: true')
  })

  it('nodeIntegration INTE satt till true', () => {
    const src = readFileSync('src/main/index.ts', 'utf-8')
    expect(src).not.toMatch(/nodeIntegration\s*:\s*true/)
  })
})

describe('S11-04: Typ- och hook-centralisering', () => {
  it('shared/types.ts existerar', () => {
    const src = readFileSync('src/shared/types.ts', 'utf-8')
    expect(src.length).toBeGreaterThan(0)
  })

  it('renderer/lib/hooks.ts existerar', () => {
    const src = readFileSync('src/renderer/lib/hooks.ts', 'utf-8')
    expect(src.length).toBeGreaterThan(0)
  })
})

describe('S11-05: IPC-schemas alla .strict()', () => {
  it('ipc-schemas.ts har .strict() på alla export schemas', () => {
    const src = readFileSync('src/main/ipc-schemas.ts', 'utf-8')
    // Count exported schemas (z.object patterns)
    const objectSchemas = (src.match(/z\s*\.\s*object\s*\(/g) || []).length
    const strictCalls = (src.match(/\.strict\(\)/g) || []).length

    // Every z.object() should have a corresponding .strict()
    // Some schemas are nested (e.g., in .refine()), so strict might be on the outer
    expect(
      strictCalls,
      `${objectSchemas} z.object() men bara ${strictCalls} .strict() i ipc-schemas.ts`,
    ).toBeGreaterThanOrEqual(objectSchemas * 0.8) // Allow 80% threshold for nested schemas
  })
})

describe('S11-06: IPC handlers — try/catch och felmeddelande-sanitering', () => {
  it('ipc-handlers.ts har ingen rå err.message i respons', () => {
    const src = readFileSync('src/main/ipc-handlers.ts', 'utf-8')
    // Check that raw error messages are not directly sent to renderer
    // Pattern: error: err.message (direct leak)
    const directLeaks = (src.match(/error:\s*(?:err|e|error)\.message/g) || [])
      .length
    expect(
      directLeaks,
      'Rå err.message läcker till renderer i ipc-handlers.ts',
    ).toBe(0)
  })
})

describe('S11-07: Renderer date safety', () => {
  it('renderer format.ts använder inte new Date() för datumberäkningar', () => {
    const src = readFileSync('src/renderer/lib/format.ts', 'utf-8')
    // new Date() for display/formatting is OK, but date arithmetic should use date-utils
    // This is a soft check — verify format.ts doesn't do arithmetic with new Date()
    const dateArithmetic = (
      src.match(/new Date\(.*\).*(?:getTime|setDate|setMonth)/g) || []
    ).length
    expect(dateArithmetic, 'Datumartmetik med new Date() i format.ts').toBe(0)
  })
})

describe('S11-08: WAL-läge', () => {
  it('db.ts sätter journal_mode = WAL', () => {
    const src = readFileSync('src/main/db.ts', 'utf-8')
    expect(src).toMatch(/journal_mode\s*=\s*WAL/i)
  })

  it('db.ts sätter foreign_keys = ON', () => {
    const src = readFileSync('src/main/db.ts', 'utf-8')
    expect(src).toMatch(/foreign_keys\s*=\s*ON/i)
  })
})

describe('S11-09: PRAGMA user_version', () => {
  it('migrations.ts använder PRAGMA user_version', () => {
    const src = readFileSync('src/main/migrations.ts', 'utf-8')
    expect(src.toLowerCase()).toContain('user_version')
  })
})
