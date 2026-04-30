/**
 * Sprint 66 — Font-bundling-paritet.
 *
 * Vakter att index.css @font-face-deklarationerna pekar på exakt de
 * filnamn som README.md listar och som check-fonts.mjs verifierar.
 *
 * Brytfall:
 * - Någon byter URL i index.css till nytt filnamn utan att uppdatera README
 *   eller LICENSE-FONTS.txt → testet failar med tydlig diff.
 * - Någon tar bort en @font-face-deklaration → testet failar.
 *
 * Testet öppnar inte fontfilerna (de är inte committade än); det jämför
 * bara CSS-deklarationerna mot förväntat set.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '..')

const EXPECTED_FONTS = [
  'Fraunces-VariableFont.woff2',
  'InterTight-VariableFont.woff2',
  'JetBrainsMono-VariableFont.woff2',
] as const

function extractFontFilenames(css: string): string[] {
  const urlRegex = /src:\s*url\(['"]\.\/fonts\/([^'")]+)['"]\)/g
  const result: string[] = []
  for (const m of css.matchAll(urlRegex)) {
    result.push(m[1])
  }
  return result
}

describe('Sprint 66 — font-bundling-paritet', () => {
  it('index.css deklarerar exakt de tre förväntade woff2-filerna', () => {
    const css = readFileSync(
      resolve(repoRoot, 'src/renderer/index.css'),
      'utf8',
    )
    const found = extractFontFilenames(css)
    // Fraunces deklareras två gånger (normal + italic) sedan Sprint H+G-1
    // för att Tailwind v4 ska kunna välja italic-variant via font-style.
    const unique = Array.from(new Set(found)).sort()
    expect(unique).toEqual([...EXPECTED_FONTS].sort())
  })

  it('LICENSE-FONTS.txt nämner alla tre font-familjer', () => {
    const license = readFileSync(
      resolve(repoRoot, 'LICENSE-FONTS.txt'),
      'utf8',
    )
    expect(license).toContain('Fraunces')
    expect(license).toContain('Inter Tight')
    expect(license).toContain('JetBrains Mono')
    expect(license).toContain('SIL OPEN FONT LICENSE Version 1.1')
  })

  it('LICENSE-FONTS.txt listar exakt filnamnen som index.css refererar', () => {
    const license = readFileSync(
      resolve(repoRoot, 'LICENSE-FONTS.txt'),
      'utf8',
    )
    for (const f of EXPECTED_FONTS) {
      expect(license).toContain(f)
    }
  })

  it('fonts/README.md listar exakt filnamnen', () => {
    const readme = readFileSync(
      resolve(repoRoot, 'src/renderer/fonts/README.md'),
      'utf8',
    )
    for (const f of EXPECTED_FONTS) {
      expect(readme).toContain(f)
    }
  })

  it('@font-face-deklarationerna har font-display: swap (fallback-strategi)', () => {
    const css = readFileSync(
      resolve(repoRoot, 'src/renderer/index.css'),
      'utf8',
    )
    const fontFaceBlocks = css.match(/@font-face\s*{[^}]+}/g) ?? []
    // Fraunces (normal + italic), Inter Tight, JetBrains Mono = 4 blocks.
    expect(fontFaceBlocks).toHaveLength(4)
    for (const block of fontFaceBlocks) {
      expect(block).toContain('font-display: swap')
    }
  })

  it('@font-face deklarerar variable-vikter (font-weight: <min> <max>)', () => {
    const css = readFileSync(
      resolve(repoRoot, 'src/renderer/index.css'),
      'utf8',
    )
    const fontFaceBlocks = css.match(/@font-face\s*{[^}]+}/g) ?? []
    for (const block of fontFaceBlocks) {
      // Format `font-weight: 100 900;` (min max) signalerar variable.
      expect(block).toMatch(/font-weight:\s*\d+\s+\d+/)
    }
  })
})
