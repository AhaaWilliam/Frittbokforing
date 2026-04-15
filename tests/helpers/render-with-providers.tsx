/**
 * Test render wrapper with real providers:
 * - QueryClientProvider (retry: false, gcTime: 0)
 * - FiscalYearProvider (real, fed via mock-IPC)
 * - HashRouter (real, from src/renderer/lib/router.tsx)
 *
 * No parallel fake-provider — tests exercise the real provider stack.
 *
 * A11y: axe-core runs by default after render. Violations fail the test.
 * Opt out with axeCheck: false (see CHECKLIST.md for policy).
 *
 * Hash-router convention: initialRoute uses path form (e.g. '/products')
 * which is set as window.location.hash internally. Note that
 * window.location.hash includes the '#' prefix — so '/products' becomes
 * '#/products' when read back. Test assertions should use the '#' form.
 *
 * Disabled axe rules (jsdom limitations):
 *   - color-contrast: jsdom does not compute styles, always fails.
 */
import { type ReactElement } from 'react'
import { render, type RenderResult } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import axe, { type AxeResults } from 'axe-core'
import { FiscalYearProvider } from '../../src/renderer/contexts/FiscalYearContext'
import { HashRouter } from '../../src/renderer/lib/router'
import { routes } from '../../src/renderer/lib/routes'
import { mockIpcResponse, mockIpcPending } from '../setup/mock-ipc'
import type { FiscalYear } from '../../src/shared/types'

// ── Re-export AxeResults for consumer use ─────────────────────────────
export type { AxeResults }

// ── Default fiscal year fixture ───────────────────────────────────────

function makeFiscalYear(
  overrides?: Partial<FiscalYear>,
): FiscalYear {
  return {
    id: 1,
    company_id: 1,
    year_label: '2026',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    is_closed: 0,
    annual_report_status: 'not_started',
    ...overrides,
  }
}

// ── Axe config ────────────────────────────────────────────────────────

const AXE_OPTIONS: axe.RunOptions = {
  rules: {
    // jsdom does not compute styles — color-contrast always fails
    'color-contrast': { enabled: false },
  },
}

// ── Options ───────────────────────────────────────────────────────────

interface RenderWithProvidersOptions {
  /** Fiscal year state: object for loaded, 'loading' for pending, 'none' for empty list. */
  fiscalYear?: { id: number; label: string } | 'loading' | 'none'
  /** Initial hash route (e.g. '/overview'). */
  initialRoute?: string
  /** Custom QueryClient if test needs cache control. */
  queryClient?: QueryClient
  /** Run axe-core a11y check after render (default: true). */
  axeCheck?: boolean
}

interface RenderWithProvidersResult extends RenderResult {
  queryClient: QueryClient
  axeResults: AxeResults | null
}

// ── Main helper ───────────────────────────────────────────────────────

export async function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
): Promise<RenderWithProvidersResult> {
  const {
    fiscalYear = { id: 1, label: '2026' },
    initialRoute = '/overview',
    queryClient: providedQc,
    axeCheck = true,
  } = options

  // Configure mock-IPC for FiscalYearContext dependencies
  if (fiscalYear === 'loading') {
    mockIpcPending('fiscal-year:list')
    mockIpcPending('settings:get')
  } else if (fiscalYear === 'none') {
    mockIpcResponse('fiscal-year:list', [])
    mockIpcResponse('settings:get', null)
    mockIpcResponse('settings:set', undefined)
  } else {
    const fy = makeFiscalYear({
      id: fiscalYear.id,
      year_label: fiscalYear.label,
    })
    mockIpcResponse('fiscal-year:list', [fy])
    mockIpcResponse('settings:get', fiscalYear.id)
    mockIpcResponse('settings:set', undefined)
  }

  window.location.hash = initialRoute

  const queryClient =
    providedQc ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    })

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <FiscalYearProvider>
          <HashRouter routes={routes} fallback="/overview">
            {children}
          </HashRouter>
        </FiscalYearProvider>
      </QueryClientProvider>
    )
  }

  const result = render(ui, { wrapper: Wrapper })

  // ── Axe a11y check ──────────────────────────────────────────────────
  let axeResults: AxeResults | null = null
  if (axeCheck) {
    axeResults = await axe.run(result.container, AXE_OPTIONS)
    if (axeResults && axeResults.violations.length > 0) {
      const msg = axeResults.violations
        .map((v) => `[${v.impact}] ${v.id}: ${v.description}\n  targets: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
        .join('\n')
      throw new Error(`axe-core violations:\n${msg}`)
    }
  }

  return { ...result, queryClient, axeResults }
}
