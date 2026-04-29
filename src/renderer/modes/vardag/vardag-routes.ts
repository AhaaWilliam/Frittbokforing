import type { RouteDefinition } from '../../lib/router'

/**
 * Sprint 22 — Vardag-routes (ADR 005).
 *
 * Eget routing-träd för Vardag-läget. Prefix `/v/` undviker kollision
 * med Bokförar-routerns paths (`/overview`, `/income` etc.) — om
 * användaren av misstag växlar mode mid-route blir hashen "ogiltig"
 * och fallback:ar till respektive default per mode.
 *
 * Defaultsida: `/v/inbox` (vad behöver jag göra?).
 */
export const vardagRoutes: ReadonlyArray<RouteDefinition> = [
  { pattern: '/v/inbox', page: 'v-inbox' },
  { pattern: '/v/spend', page: 'v-spend' },
  { pattern: '/v/income', page: 'v-income' },
  { pattern: '/v/status', page: 'v-status' },
] as const

export const VARDAG_FALLBACK = '/v/inbox'
