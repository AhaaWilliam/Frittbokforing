/**
 * Sprint 72 — ReadOnlyBanner token-migration vakter.
 *
 * Source-level vakttest: verifierar att raw amber-paletten är borttagen
 * och ersatt med warning-tokens. Kräver inte FiscalYearProvider-setup
 * (DOM-rendering täcks av integration-tester i resten av sviten).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '../../../..')
const file = resolve(
  repoRoot,
  'src/renderer/components/layout/ReadOnlyBanner.tsx',
)

describe('Sprint 72 — ReadOnlyBanner token-migration', () => {
  it('använder inte raw amber-paletten', () => {
    const src = readFileSync(file, 'utf8')
    expect(src).not.toMatch(/border-amber-\d/)
    expect(src).not.toMatch(/bg-amber-\d/)
    expect(src).not.toMatch(/text-amber-\d/)
  })

  it('använder warning-tokens', () => {
    const src = readFileSync(file, 'utf8')
    expect(src).toMatch(/border-warning-/)
    expect(src).toMatch(/bg-warning-/)
    expect(src).toMatch(/text-warning-/)
  })

  it('behåller data-testid="readonly-banner"', () => {
    const src = readFileSync(file, 'utf8')
    expect(src).toMatch(/data-testid="readonly-banner"/)
  })

  it('har role="status" för screen reader-annonsering', () => {
    const src = readFileSync(file, 'utf8')
    expect(src).toMatch(/role="status"/)
  })
})
