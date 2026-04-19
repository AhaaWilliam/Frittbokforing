import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * M133 + M153 — enforcement scripts existerar och körs i CI.
 *
 * M133: check:m133-ast (axe-regression + role=alert på errors).
 * M153: check:m153 (deterministic scoring i bank/*).
 *
 * Dessa är AST/regex-enforcement-scripts som redan finns i scripts/. Denna
 * scanner säkerställer att de inte har raderats och att package.json
 * exponerar dem som npm-scripts.
 */

describe('M133 + M153 — enforcement scripts existerar', () => {
  const pkg = JSON.parse(
    readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
  ) as { scripts: Record<string, string> }

  it('scripts/check-m133.mjs existerar', () => {
    expect(existsSync('scripts/check-m133.mjs')).toBe(true)
  })

  it('scripts/check-m133-ast.mjs existerar och kör self-test', () => {
    expect(existsSync('scripts/check-m133-ast.mjs')).toBe(true)
    expect(pkg.scripts['check:m133-ast']).toContain('--self-test')
  })

  it('scripts/check-m153.mjs existerar', () => {
    expect(existsSync('scripts/check-m153.mjs')).toBe(true)
  })

  it('scripts/check-m131-ast.mjs existerar (M131 enforcement)', () => {
    expect(existsSync('scripts/check-m131-ast.mjs')).toBe(true)
  })

  it('npm scripts exponerar alla enforcement-checks', () => {
    expect(pkg.scripts['check:m131']).toBeDefined()
    expect(pkg.scripts['check:m133']).toBeDefined()
    expect(pkg.scripts['check:m133-ast']).toBeDefined()
    expect(pkg.scripts['check:m153']).toBeDefined()
  })
})
