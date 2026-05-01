/**
 * Sprint 71 — Pill-migration: ersätt inline status-badges med Pill-primitive.
 *
 * Mål: konsistent badge-styling via Pill (token-baserad färg, samma form).
 * Tidigare hade ContactList/ProductList/ArticlePicker/FixedAssetDetailPanel
 * inline `<span class="rounded-full bg-blue-100 ...">`-badges som
 * duplicerade Pill men med olika padding och färgval.
 *
 * Vakter:
 * - Inga raw inline-badge-mönster `inline-flex.*rounded-full.*bg-(blue|teal|purple|orange|green)-(50|100)`
 *   i de migrerade filerna.
 * - Alla migrerade filer importerar Pill.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '..')

const MIGRATED = [
  'src/renderer/components/customers/ContactList.tsx',
  'src/renderer/components/products/ProductList.tsx',
  'src/renderer/components/invoices/ArticlePicker.tsx',
  'src/renderer/components/fixed-assets/FixedAssetDetailPanel.tsx',
] as const

const RAW_BADGE_RE =
  /inline-flex[^"]*rounded-full[^"]*bg-(blue|teal|purple|orange|green)-(50|100)/

describe('Sprint 71 — Pill-migration vakter', () => {
  it.each(MIGRATED)(
    '%s — inga raw inline-badge-mönster (rounded-full + colored bg)',
    (path) => {
      const src = readFileSync(resolve(repoRoot, path), 'utf8')
      const m = src.match(RAW_BADGE_RE)
      if (m) {
        throw new Error(
          `Raw badge-mönster i ${path}: "${m[0]}". Använd <Pill variant="..."> istället.`,
        )
      }
      expect(m).toBeNull()
    },
  )

  it.each(MIGRATED)('%s — importerar Pill', (path) => {
    const src = readFileSync(resolve(repoRoot, path), 'utf8')
    expect(src).toMatch(
      /import\s*\{[^}]*\bPill\b[^}]*\}\s*from\s*['"][^'"]*ui\/Pill['"]/,
    )
  })
})
