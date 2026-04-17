#!/usr/bin/env node
/**
 * Diff-scoped lint-gate: lintar bara filer som ändrats relativt base-branch.
 *
 * Bakgrund: Sprint E (2026-04-17) upptäckte att `npm run lint` inte kunde
 * användas som acceptance-gate eftersom repoet hade 4518 pre-existerande
 * prettier-/unused-vars-fel. Efter prettier-cleanup återstår ~187 legitima
 * fel (no-explicit-any, no-unused-vars, etc) som kräver per-fil-bedömning.
 *
 * Detta script löser avvikelsen: vi kan kräva lint-renhet för ändrade filer
 * utan att måsta fixa hela baselinen först.
 *
 * Användning:
 *   npm run check:lint-new            — diffar mot main (default)
 *   BASE_REF=HEAD~1 npm run check:lint-new  — diff mot senaste commit
 *
 * Exit-kod 0 om ändrade filer är lint-rena, annars 1.
 *
 * Scope: bara .ts/.tsx-filer. Andra ändrade filer (md, json, etc) ignoreras.
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const BASE_REF = process.env.BASE_REF || 'main'

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch (e) {
    return { error: e.stderr?.toString() || e.message, stdout: e.stdout?.toString() || '' }
  }
}

// ─── Hitta diff-bas ─────────────────────────────────────────────────

// Scriptet är designat för feature-branch-användning: "är mina ändringar
// mot main lint-rena?". På själva base-branch är "diff mot main" trivialt
// tomt — kör `npm run lint` för full baseline-check istället.
let mergeBase
const currentBranch = sh('git rev-parse --abbrev-ref HEAD')
if (currentBranch === BASE_REF) {
  console.log(
    `(på base-branch '${BASE_REF}' — diff-scoped lint är designed för feature-branches.\n` +
      `  Använd \`npm run lint\` för full baseline-check, eller kör från en feature-branch.)`,
  )
  process.exit(0)
}

mergeBase = sh(`git merge-base HEAD ${BASE_REF}`)
if (typeof mergeBase === 'object') {
  console.error(`Kunde inte hitta merge-base mot '${BASE_REF}':`, mergeBase.error)
  process.exit(1)
}

// ─── Samla ändrade .ts/.tsx-filer ──────────────────────────────────

const diffRaw = sh(`git diff --name-only --diff-filter=ACMR ${mergeBase}...HEAD`)
if (typeof diffRaw === 'object') {
  console.error('git diff failed:', diffRaw.error)
  process.exit(1)
}

// Inkludera också osparade ändringar så lokala körningar inte överraskas.
const unstagedRaw = sh('git diff --name-only --diff-filter=ACMR HEAD')
const stagedRaw = sh('git diff --name-only --diff-filter=ACMR --cached')

const all = new Set(
  [diffRaw, unstagedRaw, stagedRaw]
    .flatMap((s) => (typeof s === 'string' ? s.split('\n') : []))
    .filter(Boolean),
)

const files = [...all].filter((f) => {
  if (!f.endsWith('.ts') && !f.endsWith('.tsx')) return false
  if (!existsSync(f)) return false
  return true
})

if (files.length === 0) {
  console.log('✅ Inga ändrade .ts/.tsx-filer mot', BASE_REF)
  process.exit(0)
}

console.log(`Lintar ${files.length} ändrade filer mot ${BASE_REF}:`)
files.forEach((f) => console.log('  ', f))

// ─── Kör eslint ────────────────────────────────────────────────────

try {
  execSync(`npx eslint ${files.map((f) => `'${f}'`).join(' ')}`, {
    stdio: 'inherit',
  })
  console.log('✅ check:lint-new OK')
} catch {
  console.error('❌ Lint-fel i ändrade filer — se ovan.')
  process.exit(1)
}
