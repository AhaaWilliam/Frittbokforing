/**
 * Sprint 73 — design-stragglers (sista pass).
 *
 * StepCompany validation-text → FieldError (4 callsites).
 * ManualEntryList + PageManualEntries pill-style badges → Pill.
 * BalanceSheetView raw red banner → Callout.
 *
 * Vakter att stragglers inte återinförs.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '..')

describe('Sprint 73 — StepCompany FieldError-migration', () => {
  const file = resolve(
    repoRoot,
    'src/renderer/components/wizard/StepCompany.tsx',
  )

  it('inga raw text-red-500 inline error <p>-element', () => {
    const src = readFileSync(file, 'utf8')
    expect(src).not.toMatch(/text-red-500/)
  })

  it('importerar FieldError', () => {
    const src = readFileSync(file, 'utf8')
    expect(src).toMatch(/import\s*\{[^}]*FieldError[^}]*\}\s*from/)
  })
})

describe('Sprint 73 — ManualEntries Pill-migration', () => {
  it.each([
    'src/renderer/components/manual-entries/ManualEntryList.tsx',
    'src/renderer/pages/PageManualEntries.tsx',
  ])('%s — inga inline rounded-full bg-(red|blue)-100 badges', (path) => {
    const src = readFileSync(resolve(repoRoot, path), 'utf8')
    expect(src).not.toMatch(
      /inline-flex[^"]*rounded-full[^"]*bg-(red|blue)-100/,
    )
  })

  it.each([
    'src/renderer/components/manual-entries/ManualEntryList.tsx',
    'src/renderer/pages/PageManualEntries.tsx',
  ])('%s — importerar Pill', (path) => {
    const src = readFileSync(resolve(repoRoot, path), 'utf8')
    expect(src).toMatch(
      /import\s*\{[^}]*\bPill\b[^}]*\}\s*from\s*['"][^'"]*ui\/Pill['"]/,
    )
  })
})

describe('Sprint 73 — BalanceSheetView Callout-migration', () => {
  const file = resolve(
    repoRoot,
    'src/renderer/components/reports/BalanceSheetView.tsx',
  )

  it('inga raw bg-red-50 text-red-700 banners', () => {
    const src = readFileSync(file, 'utf8')
    expect(src).not.toMatch(/bg-red-50[^"']*text-red-700/)
  })

  it('importerar Callout', () => {
    const src = readFileSync(file, 'utf8')
    expect(src).toMatch(/import\s*\{[^}]*Callout[^}]*\}\s*from/)
  })
})
