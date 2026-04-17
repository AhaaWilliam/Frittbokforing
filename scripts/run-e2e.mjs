#!/usr/bin/env node
/**
 * E2E-runner som håller Node-ABI-invarianten för npm-scriptade körningar.
 *
 * Problem: `test:e2e` kräver Electron-ABI (electron-rebuild), men vitest
 * + direkt-vitest via editor kräver Node-ABI. Om träd lämnas i Electron-ABI
 * efter E2E → nästa `npx vitest` failar med NODE_MODULE_VERSION.
 *
 * Denna wrapper:
 *   1. Rebuild för Electron-ABI
 *   2. Kör playwright med pass-through args
 *   3. Rebuild tillbaka till Node-ABI
 *   4. SMOKETEST: verifiera att better-sqlite3 faktiskt kan laddas i Node-ABI
 *      (skyddar mot "rebuild exit 0 men korrupt binär" — t.ex. partial
 *      download vid prebuilt-fetch, race mellan parallella körningar).
 *   5. Propagera playwright:s exit-code (primärt), rebuild-fel (sekundärt),
 *      smoketest-fel (tertiärt, distinkt kod 42).
 *
 * Signalhantering: SIGINT/SIGTERM-handlers fångar Ctrl+C så att cleanup
 * hinner köras innan process dör. Utan handlers hade Node:s default dödat
 * processen direkt efter att playwright-barnet fått signalen — lämnar
 * trädet i Electron-ABI. Andra signalen force-exitar.
 *
 * Scope-begränsning: Invarianten gäller ENDAST för npm-scriptade anrop
 * (`npm run test:e2e*`). Direkt `npx playwright test` eller IDE-integrerade
 * körningar bypass:ar wrappern — dokumenterat i CONTRIBUTING.md.
 */
import { spawnSync } from 'node:child_process'

const passthrough = process.argv.slice(2)

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  return result.status ?? (result.signal ? 1 : 0)
}

// ─── Signal-handlers: fånga Ctrl+C så cleanup hinner köras ──────────

let interrupted = false
function handleSignal(sig) {
  if (interrupted) {
    // Andra signal → force-exit utan cleanup
    console.error(`\n⚠️  ${sig} igen — abandoning cleanup, exit 130`)
    process.exit(130)
  }
  interrupted = true
  console.error(`\n⚠️  ${sig} mottagen. Återställer Node-ABI innan exit...`)
  // Fall-through: spawnSync returnerar när barnet dör av samma signal,
  // huvudflödet fortsätter till cleanup-steget.
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => handleSignal(sig))
}

// ─── Huvudflöde ─────────────────────────────────────────────────────

// 1. Electron-ABI för playwright
const rebuildElectronCode = run('npx', ['electron-rebuild', '-f', '-w', 'better-sqlite3'])
if (rebuildElectronCode !== 0) {
  console.error('electron-rebuild failed, aborting before playwright')
  process.exit(rebuildElectronCode)
}

// 2. Playwright (om vi inte redan blev avbrutna)
const pwCode = interrupted ? 130 : run('npx', ['playwright', 'test', ...passthrough])

// 3. Alltid tillbaka till Node-ABI
const rebuildNodeCode = run('npm', ['rebuild', 'better-sqlite3'])

// 4. Smoketest: bekräfta att better-sqlite3 laddas i Node-ABI. Exit=0 från
//    npm rebuild garanterar inte en funktionell binär.
const smoketestCode = run('node', [
  '-e',
  "require('better-sqlite3')(':memory:').prepare('SELECT 1').get()",
])

if (smoketestCode !== 0) {
  console.error(
    '\n❌ Smoketest failade: better-sqlite3 kan inte laddas i Node-ABI' +
      '\n   trots att rebuild rapporterade framgång.' +
      '\n   Kör manuellt: npm rebuild better-sqlite3' +
      '\n   Om det inte hjälper: inspektera node_modules/better-sqlite3/build/',
  )
}

// 5. Exit-code-prioritet: interrupt > playwright > rebuild > smoketest
if (interrupted) process.exit(130)
if (pwCode !== 0) process.exit(pwCode)
if (rebuildNodeCode !== 0) {
  console.error(`npm rebuild better-sqlite3 failed (exit ${rebuildNodeCode})`)
  process.exit(rebuildNodeCode)
}
if (smoketestCode !== 0) process.exit(42)
process.exit(0)
