/**
 * Sprint 78 — info-banners (blue) migrerade till Callout variant="info".
 *
 * Sprint 67/68 städade danger/warning. Sprint 78 är samma sak för info-
 * banners (border-blue-200 bg-blue-50 text-blue-800).
 *
 * Vakter att raw blue-banner-pattern inte återinförs.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '..')

const MIGRATED = [
  'src/renderer/components/layout/CreateFiscalYearDialog.tsx',
  'src/renderer/components/wizard/StepFiscalYear.tsx',
  'src/renderer/pages/PageVat.tsx',
  'src/renderer/pages/FirstRunImport.tsx',
  'src/renderer/components/overview/PeriodList.tsx',
] as const

const RAW_BLUE_BANNER_RE =
  /border-blue-200[^"']*bg-blue-50[^"']*text-blue-(?:600|700|800)/

describe('Sprint 78 — info-Callout-migration vakter', () => {
  it.each(MIGRATED)(
    '%s — inga raw blue info-banner-mönster',
    (path) => {
      const src = readFileSync(resolve(repoRoot, path), 'utf8')
      const m = src.match(RAW_BLUE_BANNER_RE)
      if (m) {
        throw new Error(
          `Raw blue-banner i ${path}: "${m[0]}". Använd <Callout variant="info"> istället.`,
        )
      }
      expect(m).toBeNull()
    },
  )

  it.each(MIGRATED)('%s — importerar Callout', (path) => {
    const src = readFileSync(resolve(repoRoot, path), 'utf8')
    expect(src).toMatch(/import\s*\{[^}]*\bCallout\b[^}]*\}\s*from/)
  })
})
