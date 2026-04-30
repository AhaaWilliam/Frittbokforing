/**
 * Sprint 76 — LoadingSpinner-konsistens.
 *
 * 6 listor/detaljvyer hade ad-hoc `<div className="...text-muted-foreground">
 * Laddar...</div>` istället för LoadingSpinner-primitiven (som har korrekt
 * role="status" + aria-live="polite" + sr-only-text).
 *
 * Vakter att raw "Laddar..."-divs inte återinförs i de migrerade filerna.
 *
 * **S88-uppdatering:** DraftList och ExpenseDraftList migrerades vidare
 * till TableSkeleton (mer sofistikerad table-loading utan layout-shift).
 * Båda är giltiga loading-primitives som ersätter raw divs — testet
 * delar därför listan i två sub-listor med rätt assertion per kategori.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '..')

/** Filer som migrerade till `<LoadingSpinner />` (single-entity-vyer). */
const MIGRATED_TO_LOADING_SPINNER = [
  'src/renderer/components/customers/ContactList.tsx',
  'src/renderer/components/customers/CustomerDetail.tsx',
  'src/renderer/components/products/ProductList.tsx',
  'src/renderer/components/products/ProductDetail.tsx',
] as const

/** Filer som migrerade till `<TableSkeleton />` (table-vyer, S88). */
const MIGRATED_TO_TABLE_SKELETON = [
  'src/renderer/components/invoices/DraftList.tsx',
  'src/renderer/components/expenses/ExpenseDraftList.tsx',
] as const

const ALL_MIGRATED = [
  ...MIGRATED_TO_LOADING_SPINNER,
  ...MIGRATED_TO_TABLE_SKELETON,
] as const

describe('Sprint 76 — LoadingSpinner-paritet', () => {
  it.each(MIGRATED_TO_LOADING_SPINNER)(
    '%s — importerar LoadingSpinner',
    (path) => {
      const src = readFileSync(resolve(repoRoot, path), 'utf8')
      expect(src).toMatch(
        /import\s*\{[^}]*\bLoadingSpinner\b[^}]*\}\s*from\s*['"][^'"]*ui\/LoadingSpinner['"]/,
      )
    },
  )

  it.each(MIGRATED_TO_LOADING_SPINNER)(
    '%s — använder <LoadingSpinner /> i isLoading-grenen',
    (path) => {
      const src = readFileSync(resolve(repoRoot, path), 'utf8')
      expect(src).toMatch(/<LoadingSpinner\b/)
    },
  )

  it.each(MIGRATED_TO_TABLE_SKELETON)(
    '%s — använder <TableSkeleton /> i isLoading-grenen (S88)',
    (path) => {
      const src = readFileSync(resolve(repoRoot, path), 'utf8')
      expect(src).toMatch(/<TableSkeleton\b/)
    },
  )

  it.each(ALL_MIGRATED)(
    '%s — inga ad-hoc "Laddar..."-divs (utan LoadingSpinner/TableSkeleton)',
    (path) => {
      const src = readFileSync(resolve(repoRoot, path), 'utf8')
      // Det gamla mönstret: ren text-only "Laddar..." inom div
      expect(src).not.toMatch(/text-muted-foreground[^"]*">[\s\n]*Laddar/)
    },
  )
})
