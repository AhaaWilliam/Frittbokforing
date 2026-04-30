/**
 * Sprint 67 — vakta migrationen av raw error/warning-banners till Callout.
 *
 * Sprint 24/28/41 migrerade form-callsites; Sprint 67 städar pages/+
 * components/-stragglers (PageOverview, PageVat, PageSettings,
 * CustomerPriceTable, CreateFiscalYearDialog).
 *
 * Vakttest: filerna ska inte återinföra mönstret
 * `border-red-200 bg-red-50 text-red-700/600` eller motsvarande
 * `border-amber-200 bg-amber-50 text-amber-900` för error/warn-banners.
 *
 * Inline error-text inom form-fält (FieldError) är OK och täcks av
 * M133-AST-checken (inline `errors` JSX kräver role="alert").
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '..')

const MIGRATED_FILES = [
  // Sprint 67
  'src/renderer/pages/PageOverview.tsx',
  'src/renderer/pages/PageVat.tsx',
  'src/renderer/pages/PageSettings.tsx',
  'src/renderer/components/products/CustomerPriceTable.tsx',
  'src/renderer/components/layout/CreateFiscalYearDialog.tsx',
  // Sprint 68 — pages/components stragglers
  'src/renderer/components/ui/ConfirmFinalizeDialog.tsx',
  'src/renderer/components/bank/SuggestedMatchesPanel.tsx',
  'src/renderer/components/import/ImportPreviewPhase.tsx',
  'src/renderer/pages/PageAccountStatement.tsx',
  'src/renderer/components/overview/ReTransferButton.tsx',
  'src/renderer/pages/PageAccounts.tsx',
  'src/renderer/pages/PageTax.tsx',
] as const

// Excluded — semantically not a card-Callout:
// - src/renderer/components/layout/ReadOnlyBanner.tsx
//   (page-wide top-strip with border-b, not in-flow content)

// Banner-mönster: Tailwind-trio som visuellt motsvarar Callout-variant.
const RAW_BANNER_REGEX =
  /border-red-200[^"']*bg-red-50[^"']*text-red-(?:600|700)|border-amber-200[^"']*bg-amber-50[^"']*text-amber-(?:700|900)|border-green-200[^"']*bg-green-50[^"']*text-green-(?:600|700)/

describe('Sprint 67 — Callout-migration vakter', () => {
  it.each(MIGRATED_FILES)(
    '%s — inga raw error/warn-banner-mönster (border-red-200 bg-red-50 ...)',
    (path) => {
      const src = readFileSync(resolve(repoRoot, path), 'utf8')
      const match = src.match(RAW_BANNER_REGEX)
      if (match) {
        throw new Error(
          `Raw banner-mönster återinfört i ${path}: "${match[0]}". Använd <Callout variant="danger|warning|info"> istället.`,
        )
      }
      expect(match).toBeNull()
    },
  )

  it('alla migrerade filer importerar Callout', () => {
    for (const path of MIGRATED_FILES) {
      const src = readFileSync(resolve(repoRoot, path), 'utf8')
      expect(src).toMatch(/import.*\{[^}]*Callout[^}]*\}.*from/)
    }
  })
})
