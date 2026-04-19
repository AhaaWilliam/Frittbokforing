import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * M143 — FTS5 rebuild-anrop måste wrappas i try-catch.
 *
 * Rebuild är sekundär operation; misslyckande får inte bryta den
 * bokföringsoperation som just committats. Sökningen faller tillbaka till
 * LIKE om FTS5-rebuild failar.
 *
 * Scanner: hitta alla rebuildSearchIndex(-anrop och verifiera att varje
 * föregås av `try {` på föregående icke-tom rad (eller lika).
 */

const SCOPE = 'src/main/services'

function* walkTs(dir: string): Generator<string> {
  const entries = readdirSync(dir)
  for (const entry of entries) {
    const full = path.join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) yield* walkTs(full)
    else if (entry.endsWith('.ts')) yield full
  }
}

describe('M143 — rebuildSearchIndex i try-catch', () => {
  it('alla rebuildSearchIndex-anrop är try-catch-wrappade', () => {
    const violations: Array<{ file: string; line: number }> = []

    for (const file of walkTs(path.join(process.cwd(), SCOPE))) {
      const content = readFileSync(file, 'utf8')
      const lines = content.split('\n')
      // Skip search-service self (definition)
      if (path.basename(file) === 'search-service.ts') continue

      for (let i = 0; i < lines.length; i++) {
        if (!/rebuildSearchIndex\s*\(/.test(lines[i])) continue
        if (/import|from/.test(lines[i])) continue
        // Leta bakåt efter `try {` inom 3 rader
        let hasTry = false
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          if (/try\s*\{/.test(lines[j])) {
            hasTry = true
            break
          }
        }
        if (!hasTry) {
          violations.push({
            file: path.relative(process.cwd(), file),
            line: i + 1,
          })
        }
      }
    }

    if (violations.length > 0) {
      const msg = violations.map((v) => `  ${v.file}:${v.line}`).join('\n')
      throw new Error(`M143 violations (rebuildSearchIndex utan try):\n${msg}`)
    }
    expect(violations).toEqual([])
  })
})
