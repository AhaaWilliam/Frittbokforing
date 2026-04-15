import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const SERVICES_DIR = join(__dirname, '..', '..', 'src', 'main', 'services')
const DB_FILE = join(__dirname, '..', '..', 'src', 'main', 'db.ts')

/**
 * Architecture guard: every LIKE in services that takes user input must have ESCAPE '!'.
 * Hardcoded patterns are marked with "like-exempt: hardcoded pattern".
 */
describe('F8 architecture guard — LIKE escape audit', () => {
  it('all LIKE queries in services/ have ESCAPE or like-exempt', () => {
    const violations: string[] = []

    function checkFile(filePath: string) {
      const content = readFileSync(filePath, 'utf-8')
      const lines = content.split('\n')
      lines.forEach((line, i) => {
        // Match lines containing LIKE with a parameter placeholder
        if (/LIKE\s/.test(line) && !line.includes('ESCAPE') && !line.includes('like-exempt')) {
          // Skip comments-only lines
          const trimmed = line.trim()
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return
          violations.push(`${filePath}:${i + 1}: ${trimmed}`)
        }
      })
    }

    // Check all .ts files in services/ (recursive)
    function walkDir(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) walkDir(full)
        else if (entry.name.endsWith('.ts')) checkFile(full)
      }
    }

    walkDir(SERVICES_DIR)
    checkFile(DB_FILE)

    expect(violations).toEqual([])
  })
})
