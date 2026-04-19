import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * M96 — Result-service är single source of truth.
 *
 * Alla beräkningar av rörelseresultat/årets resultat ska gå via
 * `result-service.ts`. Andra services får inte duplicera kontointervall-
 * logik eller signMultiplier-mönster.
 *
 * Scanner: grep efter förbjudna mönster i services utanför result-service.
 */

const SCOPE = 'src/main/services'
const ALLOWED_FILES = new Set<string>([
  // result-service är källan
  'result-service.ts',
  // k2-mapping äger INCOME_STATEMENT_CONFIG + matchesRanges
  'k2-mapping.ts',
])

const FORBIDDEN_PATTERNS = [
  // Ad-hoc signMultiplier-DEFINITION (literal värde) utanför result-service.
  // Tillåter consumer-uses som `signMultiplier: l.signMultiplier`.
  /signMultiplier\s*[:=]\s*-?1[^.\w]/,
  // Hardcoded kontointervall-filter
  /account_number.*BETWEEN\s+['"]?3000/i,
  /account_number.*BETWEEN\s+['"]?4000/i,
]

function* walkTs(dir: string): Generator<string> {
  const entries = readdirSync(dir)
  for (const entry of entries) {
    const full = path.join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) yield* walkTs(full)
    else if (entry.endsWith('.ts')) yield full
  }
}

describe('M96 — result-service som SoT (scanner)', () => {
  it('inga ad-hoc signMultiplier eller hardcoded kontointervall i services', () => {
    const violations: Array<{ file: string; line: number; text: string }> = []

    for (const file of walkTs(path.join(process.cwd(), SCOPE))) {
      const basename = path.basename(file)
      if (ALLOWED_FILES.has(basename)) continue

      const content = readFileSync(file, 'utf8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue
        for (const pat of FORBIDDEN_PATTERNS) {
          pat.lastIndex = 0
          if (pat.test(line)) {
            violations.push({
              file: path.relative(process.cwd(), file),
              line: i + 1,
              text: trimmed.slice(0, 120),
            })
          }
        }
      }
    }

    if (violations.length > 0) {
      const msg = violations
        .map((v) => `  ${v.file}:${v.line}  ${v.text}`)
        .join('\n')
      throw new Error(`M96 violations:\n${msg}`)
    }
    expect(violations).toEqual([])
  })

  it('result-service exporterar dokumenterade funktioner', async () => {
    const rs = await import('../../src/main/services/result-service')
    expect(typeof rs.calculateResultSummary).toBe('function')
    expect(typeof rs.calculateNetResult).toBe('function')
    expect(typeof rs.calculateOperatingResult).toBe('function')
    expect(typeof rs.calculateResultBreakdown).toBe('function')
  })
})
