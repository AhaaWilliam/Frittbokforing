#!/usr/bin/env node
/**
 * Build-time fontkontroll. Verifierar att alla woff2-filer som
 * `src/renderer/index.css` deklarerar via @font-face faktiskt finns
 * i `src/renderer/fonts/`. Source of truth: CSS-deklarationerna.
 *
 * Beteende: warn-only. Saknade filer failar inte build (ADR-anda:
 * font-display: swap fallar tillbaka till system-stack), men
 * console.warn:as tydligt så det inte är silent drift.
 *
 * Exit code 0 även vid saknade filer. Mode `--strict` (eller env
 * `FRITT_FONTS_STRICT=1`) failar med exit 1 — för release-builds.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const cssPath = join(repoRoot, 'src/renderer/index.css')
const fontsDir = join(repoRoot, 'src/renderer/fonts')

const css = readFileSync(cssPath, 'utf8')
// Matcha url('./fonts/<filename>.woff2') i @font-face-deklarationer.
const urlRegex = /src:\s*url\(['"]\.\/fonts\/([^'")]+)['"]\)/g
const expected = new Set()
for (const m of css.matchAll(urlRegex)) {
  expected.add(m[1])
}

if (expected.size === 0) {
  console.error(
    '[check-fonts] inga @font-face url(...) hittade i src/renderer/index.css — checken kan inte verifiera något',
  )
  process.exit(1)
}

const present = new Set(
  existsSync(fontsDir)
    ? readdirSync(fontsDir).filter((f) => f.endsWith('.woff2'))
    : [],
)

const missing = [...expected].filter((f) => !present.has(f))
const extra = [...present].filter((f) => !expected.has(f))

const strict =
  process.argv.includes('--strict') || process.env.FRITT_FONTS_STRICT === '1'

if (missing.length === 0 && extra.length === 0) {
  console.log(
    `[check-fonts] OK (${expected.size}/${expected.size} woff2-filer på plats)`,
  )
  process.exit(0)
}

if (missing.length > 0) {
  const tag = strict ? 'ERROR' : 'WARN'
  console.warn(
    `[check-fonts] ${tag}: ${missing.length}/${expected.size} font-fil(er) saknas i src/renderer/fonts/:`,
  )
  for (const f of missing) console.warn(`  - ${f}`)
  console.warn(
    '  Se src/renderer/fonts/README.md för installation. App fungerar utan filerna (faller tillbaka på system-fonts).',
  )
}

if (extra.length > 0) {
  console.warn(
    `[check-fonts] notice: ${extra.length} woff2-fil(er) i fonts/ men inte refererade av index.css:`,
  )
  for (const f of extra) console.warn(`  - ${f}`)
}

process.exit(strict && missing.length > 0 ? 1 : 0)
