/**
 * E2E helper: seed a legacy (pre-ADR-004) unencrypted SQLite database
 * at the given path. Used by tests/e2e/e11-legacy-migration.spec.ts.
 *
 * Why a sub-process: better-sqlite3-multiple-ciphers is rebuilt against
 * the Electron ABI for Playwright runs. Loading it directly in the
 * test (Node) process would fail with a NODE_MODULE_VERSION mismatch.
 * The sub-process runs under plain Node and re-resolves its own copy.
 *
 * The worker compiles nothing on the fly — it requires the already-built
 * dist/main/main/migrations.js, so callers must run `npm run build:main`
 * (the same prerequisite as launching the Electron app via APP_ENTRY).
 */
import { spawn } from 'node:child_process'
import path from 'node:path'

const WORKER = path.join(__dirname, '_seed-legacy-db-worker.cjs')

export function seedLegacyDb(targetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [WORKER, targetPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stderr = ''
    let stdout = ''
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    proc.on('error', reject)
    proc.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(
          new Error(
            `seedLegacyDb worker exited with code ${code}\n` +
              `stderr: ${stderr}\nstdout: ${stdout}`,
          ),
        )
      }
    })
  })
}
