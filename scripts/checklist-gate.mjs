#!/usr/bin/env node

/**
 * Checklist gate: verifies that every modified/added/renamed *.tsx file
 * under src/renderer/ has a corresponding *.test.tsx under tests/renderer/.
 *
 * Path mapping (1:1 mirror):
 *   src/renderer/<X>/<Y>.tsx  →  tests/renderer/<X>/<Y>.test.tsx
 *
 * Uses git diff --diff-filter=AMR against the sprint baseline commit
 * stored in .sprint-baseline.
 *
 * Exit codes:
 *   0 — all modified renderer files have test coverage
 *   1 — one or more files lack tests
 *   2 — configuration error (missing .sprint-baseline, etc.)
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'

// ── Bootstrap exclusions (no test required) ───────────────────────────
const BOOTSTRAP_EXCLUSIONS = [
  'src/renderer/main.tsx',
  'src/renderer/app.tsx',
  'src/renderer/router/router.tsx',
  'src/renderer/router/routes.ts',
]

// ── Read sprint baseline ──────────────────────────────────────────────
const baselinePath = resolve(process.cwd(), '.sprint-baseline')
if (!existsSync(baselinePath)) {
  console.error('ERROR: .sprint-baseline not found. Create it with the sprint baseline commit hash.')
  process.exit(2)
}

const baseline = readFileSync(baselinePath, 'utf-8').trim()
if (!/^[0-9a-f]{7,40}$/.test(baseline)) {
  console.error(`ERROR: .sprint-baseline contains invalid hash: "${baseline}"`)
  process.exit(2)
}

// ── Get changed files (committed + staged since baseline) ─────────────
let changedFiles = []
try {
  // Committed changes: baseline..HEAD
  const committed = execSync(
    `git diff --name-only --diff-filter=AMR ${baseline} HEAD`,
    { encoding: 'utf-8' },
  ).trim()
  if (committed) changedFiles.push(...committed.split('\n'))

  // Staged but not yet committed (catches pre-commit gate use)
  const staged = execSync(
    `git diff --cached --name-only --diff-filter=AMR ${baseline}`,
    { encoding: 'utf-8' },
  ).trim()
  if (staged) changedFiles.push(...staged.split('\n'))

  // Deduplicate
  changedFiles = [...new Set(changedFiles)]
} catch (err) {
  console.error(`ERROR: git diff failed. Is "${baseline}" a valid commit?`)
  console.error(err.message)
  process.exit(2)
}

// ── Filter to src/renderer/**/*.{ts,tsx} excluding tests ──────────────
const rendererFiles = changedFiles.filter((f) => {
  if (!f.startsWith('src/renderer/')) return false
  if (!f.endsWith('.ts') && !f.endsWith('.tsx')) return false
  if (f.endsWith('.test.ts') || f.endsWith('.test.tsx')) return false
  if (BOOTSTRAP_EXCLUSIONS.includes(f)) return false
  return true
})

if (rendererFiles.length === 0) {
  console.log('No modified src/renderer/ files requiring tests.')
  process.exit(0)
}

// ── Check for corresponding test files ────────────────────────────────
const missing = []

for (const file of rendererFiles) {
  // src/renderer/components/ui/FormSelect.tsx → tests/renderer/components/ui/FormSelect.test.tsx
  const relativePath = file.replace(/^src\/renderer\//, '')
  const ext = relativePath.endsWith('.tsx') ? '.tsx' : '.ts'
  const baseName = relativePath.slice(0, -ext.length)
  const testPath = `tests/renderer/${baseName}.test.tsx`

  if (!existsSync(resolve(process.cwd(), testPath))) {
    missing.push({ source: file, expectedTest: testPath })
  }
}

if (missing.length === 0) {
  console.log(`All ${rendererFiles.length} modified renderer files have test coverage.`)
  process.exit(0)
}

console.log(`Missing test files (${missing.length}/${rendererFiles.length}):`)
for (const { source, expectedTest } of missing) {
  console.log(`  ${source}`)
  console.log(`    → expected: ${expectedTest}`)
}
process.exit(1)
