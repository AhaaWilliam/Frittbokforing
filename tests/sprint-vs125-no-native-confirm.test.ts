/**
 * Sprint VS-125 — statisk vakt: native browser confirm() är förbjudet
 * i renderer/pages (M156, ADR 003 — använd ConfirmDialog/AlertDialog).
 *
 * Kompletterar VS-124-vakten som täckte enbart PageInbox. Sökningen
 * skannar src/renderer/pages/*.tsx och stripper kommentarer (//, /* *\/)
 * + JSX text mellan { } innan match. Pages som av legitima skäl behöver
 * native confirm kan läggas till EXEMPTIONS-listan med tydlig motivering.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const PAGES_DIR = path.resolve(__dirname, '../src/renderer/pages')

// Filer som av legitima skäl får använda native confirm (just nu: ingen).
const EXEMPTIONS: string[] = []

function listPageFiles(): string[] {
  return fs
    .readdirSync(PAGES_DIR)
    .filter((f) => f.endsWith('.tsx'))
    .filter((f) => !EXEMPTIONS.includes(f))
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

describe('VS-125 inga native confirm() i renderer/pages', () => {
  for (const file of listPageFiles()) {
    it(`${file} kallar inte browser confirm()`, () => {
      const source = fs.readFileSync(path.join(PAGES_DIR, file), 'utf8')
      const stripped = stripComments(source)
      const matches = stripped.match(/\bconfirm\(/g) ?? []
      expect(matches).toEqual([])
    })
  }
})
