#!/usr/bin/env node
/**
 * M133 — A11y-regression-skydd.
 *
 * Fångar en robust invariant:
 * - axeCheck: false får inte återinföras efter F49-utfasning
 *
 * Undantag: tests/infra/render-with-providers.test.tsx (testar själva
 * axeCheck-flaggan) och tests/helpers/render-with-providers.tsx (definierar
 * flaggan) är explicit undantagna.
 *
 * Framtida utökning (flyttad ur F49-scope pga regex-spröhet):
 * - AST-baserad verifiering att error-rendering har role="alert"
 *   → kräver ts-morph/TypeScript AST, inte grep. Öppna F49-b vid behov.
 */
import { execSync } from 'node:child_process'

const violations = []

try {
  const axeFalse = execSync(
    'grep -rn "axeCheck:\\s*false" tests/ src/ --include="*.ts" --include="*.tsx" || true',
    { encoding: 'utf-8', timeout: 10_000 },
  ).trim()

  if (axeFalse) {
    // Filter out infrastructure files that define/test the flag itself
    const lines = axeFalse.split('\n').filter((line) => {
      if (line.includes('render-with-providers.tsx')) return false
      if (line.includes('render-with-providers.test.tsx')) return false
      return true
    })

    if (lines.length > 0) {
      violations.push(
        `axeCheck: false hittades (ska vara tomt efter F49):\n${lines.join('\n')}`,
      )
    }
  }
} catch (e) {
  violations.push(`M133-check kunde inte köras: ${e.message}`)
}

if (violations.length) {
  console.error('❌ M133-brott:')
  violations.forEach((v) => console.error(v))
  process.exit(1)
}
console.log('✅ M133 OK')
