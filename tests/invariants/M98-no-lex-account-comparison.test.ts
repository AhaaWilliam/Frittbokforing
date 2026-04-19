import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * M98 — Inga lexikografiska konto-jämförelser.
 *
 * Mönster som `account_number >= '3000'`, `LIKE '1%'`, eller
 * `account_number < '3000'` är förbjudna — de bryter för 5-siffriga
 * underkonton (t.ex. `'89991' > '8999'` lexikografiskt).
 *
 * Historisk bugg F4 fixad i Sprint 11 Fas 3. Denna scanner är regression-
 * guard.
 */

const FORBIDDEN_PATTERNS = [
  // account_number >= '3000' eller account_number < '3000' (range-jämförelse)
  /account_number\s*[<>]=?\s*['"]\d/g,
  // LIKE '1%' — förbjudet för class-range
  /account_number\s+LIKE\s+['"]\d%['"]/gi,
]

// Filer som är uttryckligen undantagna (etablerade via godkända mönster)
const EXEMPT_FILES = new Set<string>([
  // k2-mapping.ts använder CAST-mönstret — accepteras. Men den har
  // String-literaler som matchar i andra contexter.
  'src/main/services/k2-mapping.ts',
  // check-m131-ast.mjs innehåller exempel-patterns
  'scripts/check-m131-ast.mjs',
  'scripts/check-m133-ast.mjs',
  // test-filer får innehålla mönster som exempel
])

function* walkTs(dir: string): Generator<string> {
  const entries = readdirSync(dir)
  for (const entry of entries) {
    const full = path.join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'release')
        continue
      yield* walkTs(full)
    } else if (/\.(ts|mts|mjs)$/.test(entry)) {
      yield full
    }
  }
}

describe('M98 — ingen lexikografisk kontojämförelse i src/', () => {
  it('scanner', () => {
    const violations: Array<{ file: string; line: number; text: string }> = []
    for (const file of walkTs(path.join(process.cwd(), 'src'))) {
      const rel = path.relative(process.cwd(), file)
      if (EXEMPT_FILES.has(rel)) continue
      const content = readFileSync(file, 'utf8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Kommentarer är OK
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue
        for (const pat of FORBIDDEN_PATTERNS) {
          pat.lastIndex = 0
          if (pat.test(line)) {
            violations.push({
              file: rel,
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
      throw new Error(`M98 violations:\n${msg}`)
    }
    expect(violations).toEqual([])
  })
})
