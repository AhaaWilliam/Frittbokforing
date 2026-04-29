import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * M150 — Deterministisk tid via getNow() i main-process affärslogik.
 *
 * Förbjudet: `new Date()` utan argument i `src/main/services/`.
 * Godkänt: `new Date(string)` (parse), `getNow()`, `todayLocalFromNow()`.
 * SQL-nivå `datetime('now')` är CHECK:at separat (DB-klockan).
 */

const SCOPE_DIR = 'src/main/services'

// Regex: `new Date()` utan argument på samma rad.
// `new Date(` följt av whitespace → `)`.
const FORBIDDEN = /\bnew Date\s*\(\s*\)/g

// Filer som är dokumenterade undantag (audit 2026-04-19 — se M150-listan
// i CLAUDE.md för tillåtna callsites som INTE migrerade till getNow).
const EXEMPT_FILES = new Set<string>([
  // Add exempt files here when discovered. Empty set = strict mode.
])

function* walkTs(dir: string): Generator<string> {
  const entries = readdirSync(dir)
  for (const entry of entries) {
    const full = path.join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) yield* walkTs(full)
    else if (/\.ts$/.test(entry)) yield full
  }
}

describe('M150 — getNow() i services (ingen ny Date() utan argument)', () => {
  it('scanner', () => {
    const violations: Array<{ file: string; line: number; text: string }> = []

    for (const file of walkTs(path.join(process.cwd(), SCOPE_DIR))) {
      const rel = path.relative(process.cwd(), file)
      if (EXEMPT_FILES.has(rel)) continue
      const content = readFileSync(file, 'utf8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue
        FORBIDDEN.lastIndex = 0
        if (FORBIDDEN.test(line)) {
          violations.push({
            file: rel,
            line: i + 1,
            text: trimmed.slice(0, 120),
          })
        }
      }
    }

    if (violations.length > 0) {
      const msg = violations
        .map((v) => `  ${v.file}:${v.line}  ${v.text}`)
        .join('\n')
      throw new Error(
        `M150 violations (use getNow() from src/main/utils/now.ts):\n${msg}`,
      )
    }
    expect(violations).toEqual([])
  })
})
