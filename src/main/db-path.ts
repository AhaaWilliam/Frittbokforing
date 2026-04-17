/**
 * Pure function for DB path resolution — no Electron dependency.
 * FRITT_DB_PATH: test-only override, guarded to prevent accidental use in production.
 * Respected only when NODE_ENV=test or FRITT_TEST=1.
 * Existing DB_PATH kept for backward compat with older E2E tests.
 */
export function resolveDbPath(
  env: Record<string, string | undefined>,
  defaultPath: string,
): string {
  const isTest = env.NODE_ENV === 'test' || env.FRITT_TEST === '1'
  if (isTest && env.FRITT_DB_PATH) return env.FRITT_DB_PATH
  if (env.DB_PATH) return env.DB_PATH
  return defaultPath
}
