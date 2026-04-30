import { defineConfig } from 'vitest/config'

/**
 * Sprint 93 — Stryker-vitest-config för renderer-hooks (JSDOM).
 *
 * Skild från `vitest.config.stryker.ts` (node-environment) eftersom
 * hook-tester kräver JSDOM för React Testing Library.
 *
 * Konfig-tradeoff:
 * - pool: 'forks' + isolate: false matchar main-process-config för att
 *   undvika native-module-crash (relevant om stryker-mutated-source
 *   transitively importerar better-sqlite3 — det gör de inte här,
 *   men paritet med kärnconfigen ger framtidssäkerhet).
 * - Restriktiv include-list: enbart hook-tester som inte registrerar
 *   IPC-handlers eller andra globala mocks som leakar mellan filer.
 * - setupFiles inkluderar dom-matchers + cleanup-after-each (M115-anda).
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'tests/renderer/lib/use-combobox-keyboard.test.tsx',
      'tests/renderer/lib/use-roving-tabindex.test.tsx',
      'tests/renderer/lib/use-entity-form.test.tsx',
    ],
    setupFiles: [
      'tests/setup/dom-matchers.ts',
      'tests/setup/cleanup-after-each.ts',
    ],
    pool: 'forks',
    isolate: false,
    fileParallelism: false,
  },
})
