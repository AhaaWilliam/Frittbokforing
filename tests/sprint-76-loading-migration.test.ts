/**
 * Sprint 76 — LoadingSpinner-konsistens.
 *
 * 6 listor/detaljvyer hade ad-hoc `<div className="...text-muted-foreground">
 * Laddar...</div>` istället för LoadingSpinner-primitiven (som har korrekt
 * role="status" + aria-live="polite" + sr-only-text).
 *
 * Vakter att raw "Laddar..."-divs inte återinförs i de migrerade filerna.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '..')

const MIGRATED = [
  'src/renderer/components/customers/ContactList.tsx',
  'src/renderer/components/customers/CustomerDetail.tsx',
  'src/renderer/components/invoices/DraftList.tsx',
  'src/renderer/components/products/ProductList.tsx',
  'src/renderer/components/products/ProductDetail.tsx',
  'src/renderer/components/expenses/ExpenseDraftList.tsx',
] as const

describe('Sprint 76 — LoadingSpinner-paritet', () => {
  it.each(MIGRATED)('%s — importerar LoadingSpinner', (path) => {
    const src = readFileSync(resolve(repoRoot, path), 'utf8')
    expect(src).toMatch(
      /import\s*\{[^}]*\bLoadingSpinner\b[^}]*\}\s*from\s*['"][^'"]*ui\/LoadingSpinner['"]/,
    )
  })

  it.each(MIGRATED)('%s — använder <LoadingSpinner /> i isLoading-grenen', (path) => {
    const src = readFileSync(resolve(repoRoot, path), 'utf8')
    expect(src).toMatch(/<LoadingSpinner\b/)
  })

  it.each(MIGRATED)(
    '%s — inga ad-hoc "Laddar..."-divs (utan LoadingSpinner)',
    (path) => {
      const src = readFileSync(resolve(repoRoot, path), 'utf8')
      // Det gamla mönstret: ren text-only "Laddar..." inom div
      expect(src).not.toMatch(/text-muted-foreground[^"]*">[\s\n]*Laddar/)
    },
  )
})
