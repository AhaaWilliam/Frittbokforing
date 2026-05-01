/**
 * Sprint 75 — DraftList + ExpenseDraftList använder EmptyState-primitive.
 *
 * Tidigare ad-hoc `<div className="px-8 py-16 text-center ...">`-empty-state
 * ersatt med EmptyState för konsistens med InvoiceList/ExpenseList/
 * ManualEntryList som redan använde primitiven.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '..')

describe('Sprint 75 — Draft-list EmptyState-paritet', () => {
  it.each([
    'src/renderer/components/invoices/DraftList.tsx',
    'src/renderer/components/expenses/ExpenseDraftList.tsx',
  ])('%s — importerar EmptyState', (path) => {
    const src = readFileSync(resolve(repoRoot, path), 'utf8')
    expect(src).toMatch(
      /import\s*\{[^}]*\bEmptyState\b[^}]*\}\s*from\s*['"][^'"]*ui\/EmptyState['"]/,
    )
  })

  it.each([
    'src/renderer/components/invoices/DraftList.tsx',
    'src/renderer/components/expenses/ExpenseDraftList.tsx',
  ])('%s — använder <EmptyState> i empty-grenen', (path) => {
    const src = readFileSync(resolve(repoRoot, path), 'utf8')
    expect(src).toMatch(/<EmptyState/)
  })

  it.each([
    'src/renderer/components/invoices/DraftList.tsx',
    'src/renderer/components/expenses/ExpenseDraftList.tsx',
  ])('%s — inga ad-hoc px-8 py-16 text-center empty-divs', (path) => {
    const src = readFileSync(resolve(repoRoot, path), 'utf8')
    // Mönstret som ersattes
    expect(src).not.toMatch(
      /px-8 py-16 text-center text-sm text-muted-foreground/,
    )
  })
})
