// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  FiscalYearProvider,
  useFiscalYearContext,
} from '../../../src/renderer/contexts/FiscalYearContext'
import {
  setupMockIpc,
  mockIpcResponse,
  mockIpcPending,
} from '../../setup/mock-ipc'
import type { FiscalYear } from '../../../src/shared/types'

// ── Fixtures ─────────────────────────────────────────────────────────

function makeFy(overrides: Partial<FiscalYear> & { id: number }): FiscalYear {
  return {
    company_id: 1,
    year_label: `FY${overrides.id}`,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    is_closed: 0,
    annual_report_status: 'not_started',
    ...overrides,
  }
}

const fy1 = makeFy({ id: 1, is_closed: 1 })
const fy2 = makeFy({ id: 2 })
const fy3 = makeFy({ id: 3 })

// ── Wrapper builder ──────────────────────────────────────────────────

function makeWrapper(opts?: {
  fiscalYears?: FiscalYear[]
  settingsGet?: number | null
  settingsGetPending?: boolean
}) {
  const {
    fiscalYears = [fy1, fy2, fy3],
    settingsGet = null,
    settingsGetPending = false,
  } = opts ?? {}

  mockIpcResponse('fiscal-year:list', fiscalYears)
  if (settingsGetPending) {
    mockIpcPending('settings:get')
  } else {
    mockIpcResponse('settings:get', settingsGet)
  }
  mockIpcResponse('settings:set', undefined)

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <FiscalYearProvider>{children}</FiscalYearProvider>
    </QueryClientProvider>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────

type MockFn = ReturnType<typeof vi.fn>

function setSettingCalls(): unknown[][] {
  return ((window.api as Record<string, MockFn>).setSetting).mock.calls
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  setupMockIpc()
})

// ── Grupp 1: Resolution-kedja ────────────────────────────────────────

describe('resolution chain', () => {
  it('selectedYear takes priority over restoredId', async () => {
    const wrapper = makeWrapper({ settingsGet: fy3.id })
    const { result } = renderHook(() => useFiscalYearContext(), { wrapper })

    await waitFor(() =>
      expect(result.current.activeFiscalYear?.id).toBe(fy3.id),
    )

    act(() => result.current.setActiveFiscalYear(fy2))

    expect(result.current.activeFiscalYear?.id).toBe(fy2.id)
  })

  it('restoredId is used when no selectedYear', async () => {
    const wrapper = makeWrapper({ settingsGet: fy2.id })
    const { result } = renderHook(() => useFiscalYearContext(), { wrapper })

    await waitFor(() =>
      expect(result.current.activeFiscalYear?.id).toBe(fy2.id),
    )
  })

  it('first open FY when no explicit or restored id', async () => {
    // fy1 is closed, fy2 is first open
    const wrapper = makeWrapper({ settingsGet: null })
    const { result } = renderHook(() => useFiscalYearContext(), { wrapper })

    await waitFor(() =>
      expect(result.current.activeFiscalYear?.id).toBe(fy2.id),
    )
  })

  it('first FY in list when all are closed', async () => {
    const closed1 = makeFy({ id: 10, is_closed: 1 })
    const closed2 = makeFy({ id: 11, is_closed: 1 })
    const wrapper = makeWrapper({
      fiscalYears: [closed1, closed2],
      settingsGet: null,
    })
    const { result } = renderHook(() => useFiscalYearContext(), { wrapper })

    await waitFor(() =>
      expect(result.current.activeFiscalYear?.id).toBe(closed1.id),
    )
  })
})

// ── Grupp 2: restoredIdLoaded-gating (M102) ─────────────────────────

describe('restoredIdLoaded gating (M102)', () => {
  it('no auto-persist before settings:get resolves', async () => {
    const wrapper = makeWrapper({ settingsGetPending: true })
    const { result } = renderHook(() => useFiscalYearContext(), { wrapper })

    // FY list loads, activeFiscalYear resolves to fallback
    await waitFor(() =>
      expect(result.current.allFiscalYears).toHaveLength(3),
    )

    // settings:get still pending → restoredIdLoaded === false → no auto-persist
    expect(setSettingCalls()).toHaveLength(0)
  })

  it('auto-persist fires after settings:get resolves as null', async () => {
    const wrapper = makeWrapper({ settingsGet: null })
    const { result } = renderHook(() => useFiscalYearContext(), { wrapper })

    // Wait for activeFiscalYear to resolve to first open (fy2)
    await waitFor(() =>
      expect(result.current.activeFiscalYear?.id).toBe(fy2.id),
    )

    // restoredIdLoaded=true, selectedYear=null, restoredId=null → auto-persist
    await waitFor(() => expect(setSettingCalls().length).toBeGreaterThan(0))
    expect(setSettingCalls()[0]).toEqual(['last_fiscal_year_id', fy2.id])
  })

  it('no auto-persist when restoredId is valid', async () => {
    const wrapper = makeWrapper({ settingsGet: fy2.id })
    const { result } = renderHook(() => useFiscalYearContext(), { wrapper })

    await waitFor(() =>
      expect(result.current.activeFiscalYear?.id).toBe(fy2.id),
    )

    // restoredId is set → condition !restoredId is false → no auto-persist
    expect(setSettingCalls()).toHaveLength(0)
  })

  it('explicit selectedYear wins over pending restore — exactly one settings:set', async () => {
    mockIpcResponse('fiscal-year:list', [fy1, fy2, fy3])
    mockIpcResponse('settings:set', undefined)

    // Manually control settings:get resolution
    let resolveSettings!: (value: unknown) => void
    const settingsPromise = new Promise((resolve) => {
      resolveSettings = resolve
    })
    const getSetting = (window.api as Record<string, MockFn>).getSetting
    getSetting.mockImplementation(() => settingsPromise)

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>
        <FiscalYearProvider>{children}</FiscalYearProvider>
      </QueryClientProvider>
    )

    const { result } = renderHook(() => useFiscalYearContext(), { wrapper })

    // Wait for FY list
    await waitFor(() =>
      expect(result.current.allFiscalYears).toHaveLength(3),
    )

    // settings:get still pending — set explicit year
    act(() => result.current.setActiveFiscalYear(fy2))
    expect(setSettingCalls()).toHaveLength(1)
    expect(setSettingCalls()[0]).toEqual(['last_fiscal_year_id', fy2.id])

    // Now resolve the pending settings:get with null
    await act(async () => {
      resolveSettings(null)
    })

    // M102 gate: !selectedYear is false → auto-persist should NOT fire
    // Total should still be exactly 1
    expect(setSettingCalls()).toHaveLength(1)
  })
})

// ── Grupp 3: setActiveFiscalYear side effects ───────────────────────

describe('setActiveFiscalYear', () => {
  it('calls settings:set with the fiscal year id', async () => {
    const wrapper = makeWrapper({ settingsGet: fy2.id })
    const { result } = renderHook(() => useFiscalYearContext(), { wrapper })

    await waitFor(() =>
      expect(result.current.activeFiscalYear?.id).toBe(fy2.id),
    )

    act(() => result.current.setActiveFiscalYear(fy3))

    expect(setSettingCalls()).toHaveLength(1)
    expect(setSettingCalls()[0]).toEqual(['last_fiscal_year_id', fy3.id])
  })

  it('works on a closed FY and sets isReadOnly to true', async () => {
    const wrapper = makeWrapper({ settingsGet: fy2.id })
    const { result } = renderHook(() => useFiscalYearContext(), { wrapper })

    await waitFor(() =>
      expect(result.current.activeFiscalYear?.id).toBe(fy2.id),
    )

    act(() => result.current.setActiveFiscalYear(fy1))

    expect(result.current.activeFiscalYear?.id).toBe(fy1.id)
    expect(result.current.isReadOnly).toBe(true)
  })
})

// ── Grupp 4: isReadOnly derivation ──────────────────────────────────

describe('isReadOnly', () => {
  it('is true when activeFiscalYear.is_closed === 1', async () => {
    const wrapper = makeWrapper({
      fiscalYears: [fy1],
      settingsGet: fy1.id,
    })
    const { result } = renderHook(() => useFiscalYearContext(), { wrapper })

    await waitFor(() =>
      expect(result.current.activeFiscalYear?.id).toBe(fy1.id),
    )
    expect(result.current.isReadOnly).toBe(true)
  })

  it('is false when activeFiscalYear.is_closed === 0', async () => {
    const wrapper = makeWrapper({
      fiscalYears: [fy2],
      settingsGet: fy2.id,
    })
    const { result } = renderHook(() => useFiscalYearContext(), { wrapper })

    await waitFor(() =>
      expect(result.current.activeFiscalYear?.id).toBe(fy2.id),
    )
    expect(result.current.isReadOnly).toBe(false)
  })
})

// ── Grupp 5: Edge cases ─────────────────────────────────────────────

describe('edge cases', () => {
  it('handles empty FY list without crashing', async () => {
    const wrapper = makeWrapper({ fiscalYears: [], settingsGet: null })
    const { result } = renderHook(() => useFiscalYearContext(), { wrapper })

    await waitFor(() =>
      expect(result.current.allFiscalYears).toHaveLength(0),
    )
    expect(result.current.activeFiscalYear).toBeNull()
    expect(result.current.isReadOnly).toBe(false)
  })

  it('falls through when restoredId points to missing FY', async () => {
    // restoredId=9999 not in list → falls to first open (fy2)
    const wrapper = makeWrapper({ settingsGet: 9999 })
    const { result } = renderHook(() => useFiscalYearContext(), { wrapper })

    await waitFor(() =>
      expect(result.current.activeFiscalYear?.id).toBe(fy2.id),
    )
  })
})

// ── useFiscalYearContext outside provider ────────────────────────────

describe('useFiscalYearContext outside provider', () => {
  it('throws when used without FiscalYearProvider', () => {
    expect(() => {
      renderHook(() => useFiscalYearContext())
    }).toThrow('useFiscalYearContext måste användas inom FiscalYearProvider')
  })
})
