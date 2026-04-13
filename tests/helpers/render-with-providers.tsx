/**
 * Test render wrapper with real providers:
 * - QueryClientProvider (retry: false, gcTime: 0)
 * - FiscalYearProvider (real, fed via mock-IPC)
 * - HashRouter (real, from src/renderer/lib/router.tsx)
 *
 * No parallel fake-provider — tests exercise the real provider stack.
 * axeCheck prop reserved for future a11y policy (no-op now).
 */
import { type ReactElement } from 'react'
import { render, type RenderResult } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FiscalYearProvider } from '../../src/renderer/contexts/FiscalYearContext'
import { HashRouter } from '../../src/renderer/lib/router'
import { routes } from '../../src/renderer/lib/routes'
import { mockIpcResponse, mockIpcPending } from '../setup/mock-ipc'
import type { FiscalYear } from '../../src/shared/types'

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

// ── Options ───────────────────────────────────────────────────────────

interface RenderWithProvidersOptions {
  /** Fiscal year state: object for loaded, 'loading' for pending, 'none' for empty list. */
  fiscalYear?: { id: number; label: string } | 'loading' | 'none'
  /** Initial hash route (e.g. '/overview'). */
  initialRoute?: string
  /** Custom QueryClient if test needs cache control. */
  queryClient?: QueryClient
  /** Reserved for future a11y policy — no-op now. */
  axeCheck?: boolean
}

interface RenderWithProvidersResult extends RenderResult {
  queryClient: QueryClient
}

// ── Main helper ───────────────────────────────────────────────────────

export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
): RenderWithProvidersResult {
  const {
    fiscalYear = { id: 1, label: '2026' },
    initialRoute = '/overview',
    queryClient: providedQc,
  } = options

  // Configure mock-IPC for FiscalYearContext dependencies
  if (fiscalYear === 'loading') {
    // FiscalYearProvider calls useFiscalYears() → window.api.listFiscalYears()
    // and window.api.getSetting('last_fiscal_year_id')
    // Both should hang to simulate loading state
    mockIpcPending('fiscal-year:list')
    mockIpcPending('settings:get')
  } else if (fiscalYear === 'none') {
    // Empty fiscal year list — no years exist
    mockIpcResponse('fiscal-year:list', [])
    mockIpcResponse('settings:get', null)
    mockIpcResponse('settings:set', undefined)
  } else {
    // Loaded state: return a fiscal year matching the provided id/label
    const fy = makeFiscalYear({
      id: fiscalYear.id,
      year_label: fiscalYear.label,
    })
    mockIpcResponse('fiscal-year:list', [fy])
    mockIpcResponse('settings:get', fiscalYear.id)
    mockIpcResponse('settings:set', undefined)
  }

  // Set initial hash route
  window.location.hash = initialRoute

  // Create QueryClient with test-friendly defaults
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

  return { ...result, queryClient }
}
