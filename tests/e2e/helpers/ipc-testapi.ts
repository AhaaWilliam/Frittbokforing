/**
 * Typed wrappers runt window.__testApi (M115, M148).
 *
 * __testApi är endast exponerad när FRITT_TEST=1 (preload.ts). Dessa
 * wrappers ger typad access utan att varje spec-fil ska upprepa
 * `window.evaluate`-boilerplate.
 */
import type { Page } from '@playwright/test'

type TestApi = {
  freezeClock: (iso: string | null) => Promise<{ ok: boolean; error?: string }>
  forcePeriodState: (
    periodId: number,
    closed: boolean,
  ) => Promise<{ ok: boolean }>
  getExpenses: (fyId?: number) => Promise<Array<Record<string, unknown>>>
}

/**
 * Frys main-process-klockan till ett ISO-datum. Pass null för att släppa.
 * Påverkar alla getNow()-callsites (M150).
 */
export async function freezeClock(
  window: Page,
  iso: string | null,
): Promise<void> {
  const result = await window.evaluate(
    (v) =>
      (window as unknown as { __testApi: TestApi }).__testApi.freezeClock(v),
    iso,
  )
  if (!result.ok) {
    throw new Error(`freezeClock failed: ${result.error ?? 'unknown'}`)
  }
}

/**
 * Tvinga en accounting_period till closed/open utan sekventiell flow.
 * Används av read-only-banner-tester.
 */
export async function forcePeriodState(
  window: Page,
  periodId: number,
  closed: boolean,
): Promise<void> {
  const result = await window.evaluate(
    ([id, c]) =>
      (window as unknown as { __testApi: TestApi }).__testApi.forcePeriodState(
        id as number,
        c as boolean,
      ),
    [periodId, closed] as [number, boolean],
  )
  if (!result.ok) {
    throw new Error(`forcePeriodState failed`)
  }
}

export async function getExpenses(
  window: Page,
  fyId?: number,
): Promise<Array<Record<string, unknown>>> {
  return window.evaluate(
    (id) =>
      (window as unknown as { __testApi: TestApi }).__testApi.getExpenses(id),
    fyId,
  )
}
