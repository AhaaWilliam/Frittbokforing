import { defineConfig } from 'vitest/config'

// Stryker-specific config:
//
// - pool: 'forks' + isolate: false avoids the better-sqlite3 + worker_threads
//   SIGSEGV. better-sqlite3 native handles cannot survive the Vitest 4
//   threads pool, and even forks pool crashes when a fresh module instance
//   is loaded for each test file. Disabling isolation reuses the module
//   instance across the file batch, side-stepping the native crash.
//
// - To make `isolate: false` safe (it would otherwise cause cross-file
//   state leakage — e.g. IPC handler registration leaking between files),
//   we restrict the test set to a curated subset that does not register
//   IPC handlers at module load.
//
// - Vitest 4 removed `poolOptions`; pool tunables are top-level on `test`.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/session-43-result-service.test.ts',
      'tests/s24b-br-rr-consistency.test.ts',
      'tests/s25-vat-parity.test.ts',
      'tests/session-34-chronology.test.ts',
      'tests/gap-M09-M10-tax-vat.test.ts',
      'tests/s25-backend-vat.test.ts',
      'tests/session-30-correction-service.test.ts',
      'tests/sprint-52-vat-report-mutation-gaps.test.ts',
      'tests/sprint-53-correction-mutation-gaps.test.ts',
    ],
    setupFiles: ['tests/setup/dom-matchers.ts'],
    pool: 'forks',
    isolate: false,
    fileParallelism: false,
  },
})
