#!/usr/bin/env node
/**
 * M153 — Deterministisk scoring för auto-matchning.
 *
 * Scoring-funktioner i src/main/services/bank/**.ts ska vara:
 *  1. Heltalspoäng (inga floats i score/thresholds) — kontrolleras manuellt
 *  2. Deterministiska — inga Math.random / Date.now / performance.now
 *  3. Rena — samma input ger samma output
 *
 * Detta script tar (2): grep-scan efter förbjudna tokens i scope.
 *
 * Framtida utökning: expandera scope till src/main/services/**\/auto-*.ts
 * vid F66-d auto-klassificering.
 */
import { execSync } from 'node:child_process'

const SCOPE = 'src/main/services/bank/'
const FORBIDDEN = [
  { pattern: 'Math\\.random\\b', label: 'Math.random' },
  { pattern: 'Date\\.now\\b', label: 'Date.now' },
  { pattern: 'performance\\.now\\b', label: 'performance.now' },
]

const violations = []

function isCommentLine(line) {
  // Format: <path>:<lineno>:<content>
  const idx = line.indexOf(':')
  const idx2 = line.indexOf(':', idx + 1)
  if (idx2 < 0) return false
  const content = line.slice(idx2 + 1).trim()
  return content.startsWith('//') || content.startsWith('*') || content.startsWith('/*')
}

for (const { pattern, label } of FORBIDDEN) {
  try {
    const out = execSync(
      `grep -rn "${pattern}" ${SCOPE} --include="*.ts" || true`,
      { encoding: 'utf-8', timeout: 10_000 },
    ).trim()
    if (out) {
      const lines = out.split('\n').filter((l) => !isCommentLine(l))
      if (lines.length > 0) {
        violations.push(`Förbjuden token "${label}" i ${SCOPE}:\n${lines.join('\n')}`)
      }
    }
  } catch (err) {
    console.error(`grep failed for ${label}:`, err.message)
    process.exit(2)
  }
}

if (violations.length > 0) {
  console.error('M153 violations:')
  for (const v of violations) console.error(v)
  process.exit(1)
}

console.log('M153 OK — scoring-modulerna i src/main/services/bank/ är deterministiska.')
