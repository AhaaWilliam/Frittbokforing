// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useCreateFixedAsset,
  useUpdateFixedAsset,
  useDisposeFixedAsset,
  useDeleteFixedAsset,
  useExecuteDepreciationPeriod,
} from '../../../src/renderer/lib/hooks'
import { queryKeys } from '../../../src/renderer/lib/query-keys'
import { setupMockIpc, mockIpcResponse } from '../../setup/mock-ipc'

/**
 * Sprint F P1 — precis RQ-invalidation för 5 depreciation-hooks.
 *
 * Verifierar att hooks invaliderar enbart rätt query-keys (inte `invalidateAll`).
 * Matrix dokumenterad i docs/sprint-f-prompt.md P1.
 */

function makeWrapper(): {
  qc: QueryClient
  wrapper: React.FC<{ children: React.ReactNode }>
} {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return { qc, wrapper }
}

// Keys vi pre-populerar så vi kan observera invalidation
const FY_ID = 1
const ASSET_ID = 42
const OTHER_ASSET_ID = 99

type KeyMap = Record<string, readonly unknown[]>

const IN_SCOPE_KEYS: KeyMap = {
  allFixedAssets: queryKeys.allFixedAssets(),
  fixedAsset: queryKeys.fixedAsset(ASSET_ID),
  otherFixedAsset: queryKeys.fixedAsset(OTHER_ASSET_ID),
  depreciationSchedule: queryKeys.depreciationSchedule(ASSET_ID),
  otherDepreciationSchedule: queryKeys.depreciationSchedule(OTHER_ASSET_ID),
  dashboard: queryKeys.dashboard(FY_ID),
  incomeStatement: queryKeys.incomeStatement(FY_ID),
  balanceSheet: queryKeys.balanceSheet(FY_ID),
  manualEntries: queryKeys.manualEntries(FY_ID),
}

const OUT_OF_SCOPE_KEYS: KeyMap = {
  invoiceList: queryKeys.invoiceList(FY_ID),
  counterparties: queryKeys.counterparties(),
  vatReport: queryKeys.vatReport(FY_ID),
  products: queryKeys.products(),
  agingReceivables: queryKeys.agingReceivables(FY_ID),
}

function prepopulate(qc: QueryClient): void {
  for (const key of Object.values(IN_SCOPE_KEYS)) {
    qc.setQueryData(key, { placeholder: true })
  }
  for (const key of Object.values(OUT_OF_SCOPE_KEYS)) {
    qc.setQueryData(key, { placeholder: true })
  }
}

function getInvalidated(qc: QueryClient, key: readonly unknown[]): boolean {
  const state = qc.getQueryState([...key])
  return state?.isInvalidated === true
}

function assertOutOfScopeNotInvalidated(qc: QueryClient): void {
  for (const [name, key] of Object.entries(OUT_OF_SCOPE_KEYS)) {
    expect(
      getInvalidated(qc, key),
      `out-of-scope key "${name}" should NOT be invalidated`,
    ).toBe(false)
  }
}

function assertInvalidated(
  qc: QueryClient,
  expectedNames: readonly (keyof typeof IN_SCOPE_KEYS)[],
): void {
  for (const name of expectedNames) {
    expect(
      getInvalidated(qc, IN_SCOPE_KEYS[name]),
      `expected in-scope key "${name}" to be invalidated`,
    ).toBe(true)
  }
}

describe('Sprint F P1 — depreciation-hooks invalidation-matrix', () => {
  beforeEach(() => {
    setupMockIpc()
  })

  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api
  })

  it('useCreateFixedAsset invaliderar endast allFixedAssets', async () => {
    const { qc, wrapper } = makeWrapper()
    prepopulate(qc)

    mockIpcResponse('depreciation:create-asset', {
      success: true,
      data: { id: 99, scheduleCount: 5 },
    })

    const { result } = renderHook(() => useCreateFixedAsset(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        name: 'Test',
        acquisition_date: '2026-01-01',
        acquisition_cost_ore: 100000,
        residual_value_ore: 0,
        useful_life_months: 60,
        method: 'linear',
        account_asset: '1210',
        account_accumulated_depreciation: '1219',
        account_depreciation_expense: '7832',
      })
    })

    await waitFor(() =>
      expect(getInvalidated(qc, IN_SCOPE_KEYS.allFixedAssets)).toBe(true),
    )
    assertInvalidated(qc, ['allFixedAssets'])
    // Create påverkar inte detail/schedule/dashboard — bara listan
    expect(getInvalidated(qc, IN_SCOPE_KEYS.fixedAsset)).toBe(false)
    expect(getInvalidated(qc, IN_SCOPE_KEYS.depreciationSchedule)).toBe(false)
    expect(getInvalidated(qc, IN_SCOPE_KEYS.dashboard)).toBe(false)
    assertOutOfScopeNotInvalidated(qc)
  })

  it('useUpdateFixedAsset invaliderar list + aktuell asset-detail + aktuell schedule (inte andra assets)', async () => {
    const { qc, wrapper } = makeWrapper()
    prepopulate(qc)

    mockIpcResponse('depreciation:update-asset', {
      success: true,
      data: { scheduleCount: 5 },
    })

    const { result } = renderHook(() => useUpdateFixedAsset(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        id: ASSET_ID,
        input: {
          name: 'Test',
          acquisition_date: '2026-01-01',
          acquisition_cost_ore: 100000,
          residual_value_ore: 0,
          useful_life_months: 84,
          method: 'linear',
          account_asset: '1210',
          account_accumulated_depreciation: '1219',
          account_depreciation_expense: '7832',
        },
      })
    })

    await waitFor(() =>
      expect(getInvalidated(qc, IN_SCOPE_KEYS.allFixedAssets)).toBe(true),
    )
    assertInvalidated(qc, [
      'allFixedAssets',
      'fixedAsset',
      'depreciationSchedule',
    ])
    // Id-precision: andra asset-ids rörs inte
    expect(getInvalidated(qc, IN_SCOPE_KEYS.otherFixedAsset)).toBe(false)
    expect(getInvalidated(qc, IN_SCOPE_KEYS.otherDepreciationSchedule)).toBe(
      false,
    )
    // Update påverkar inte dashboard/RR/BR (ingen JE skapas)
    expect(getInvalidated(qc, IN_SCOPE_KEYS.dashboard)).toBe(false)
    expect(getInvalidated(qc, IN_SCOPE_KEYS.incomeStatement)).toBe(false)
    expect(getInvalidated(qc, IN_SCOPE_KEYS.balanceSheet)).toBe(false)
    expect(getInvalidated(qc, IN_SCOPE_KEYS.manualEntries)).toBe(false)
    assertOutOfScopeNotInvalidated(qc)
  })

  it('useExecuteDepreciationPeriod invaliderar asset + schedules + dashboard + RR + BR + manual-entries', async () => {
    const { qc, wrapper } = makeWrapper()
    prepopulate(qc)

    mockIpcResponse('depreciation:execute-period', {
      success: true,
      data: { executedScheduleCount: 3, totalDepreciationOre: 30000 },
    })

    const { result } = renderHook(() => useExecuteDepreciationPeriod(), {
      wrapper,
    })

    await act(async () => {
      await result.current.mutateAsync({
        fiscal_year_id: FY_ID,
        period_end_date: '2026-01-31',
      })
    })

    await waitFor(() =>
      expect(getInvalidated(qc, IN_SCOPE_KEYS.dashboard)).toBe(true),
    )
    assertInvalidated(qc, [
      'allFixedAssets',
      'fixedAsset',
      'depreciationSchedule',
      'dashboard',
      'incomeStatement',
      'balanceSheet',
      'manualEntries',
    ])
    assertOutOfScopeNotInvalidated(qc)
  })

  it('useDisposeFixedAsset invaliderar asset-detail per id + dashboard + RR + BR + manual-entries', async () => {
    const { qc, wrapper } = makeWrapper()
    prepopulate(qc)

    mockIpcResponse('depreciation:dispose', { success: true, data: null })

    const { result } = renderHook(() => useDisposeFixedAsset(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        id: ASSET_ID,
        disposed_date: '2026-06-01',
      })
    })

    await waitFor(() =>
      expect(getInvalidated(qc, IN_SCOPE_KEYS.dashboard)).toBe(true),
    )
    assertInvalidated(qc, [
      'allFixedAssets',
      'fixedAsset',
      'dashboard',
      'incomeStatement',
      'balanceSheet',
      'manualEntries',
    ])
    // Id-precision: annan asset rörs inte
    expect(getInvalidated(qc, IN_SCOPE_KEYS.otherFixedAsset)).toBe(false)
    // Dispose invaliderar inte schedules (future periods obsolete men inte refetched)
    expect(getInvalidated(qc, IN_SCOPE_KEYS.depreciationSchedule)).toBe(false)
    assertOutOfScopeNotInvalidated(qc)
  })

  it('useDeleteFixedAsset invaliderar endast allFixedAssets (delete = pre-execution)', async () => {
    const { qc, wrapper } = makeWrapper()
    prepopulate(qc)

    mockIpcResponse('depreciation:delete', { success: true, data: null })

    const { result } = renderHook(() => useDeleteFixedAsset(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: ASSET_ID })
    })

    await waitFor(() =>
      expect(getInvalidated(qc, IN_SCOPE_KEYS.allFixedAssets)).toBe(true),
    )
    assertInvalidated(qc, ['allFixedAssets'])
    expect(getInvalidated(qc, IN_SCOPE_KEYS.fixedAsset)).toBe(false)
    expect(getInvalidated(qc, IN_SCOPE_KEYS.depreciationSchedule)).toBe(false)
    expect(getInvalidated(qc, IN_SCOPE_KEYS.dashboard)).toBe(false)
    assertOutOfScopeNotInvalidated(qc)
  })

  it('useExecuteDepreciationPeriod invaliderar alla dateRange-varianter av incomeStatement/balanceSheet för fyId', async () => {
    const { qc, wrapper } = makeWrapper()
    prepopulate(qc)

    // Pre-populera en custom dateRange utöver default full-year
    const customRange = { from: '2026-01-01', to: '2026-03-31' }
    const customIncomeKey = queryKeys.incomeStatement(FY_ID, customRange)
    const customBalanceKey = queryKeys.balanceSheet(FY_ID, customRange)
    qc.setQueryData(customIncomeKey, { placeholder: true })
    qc.setQueryData(customBalanceKey, { placeholder: true })

    // Annan FY — får INTE invalideras
    const otherFyIncomeKey = queryKeys.incomeStatement(2)
    qc.setQueryData(otherFyIncomeKey, { placeholder: true })

    mockIpcResponse('depreciation:execute-period', {
      success: true,
      data: { executedScheduleCount: 3, totalDepreciationOre: 30000 },
    })

    const { result } = renderHook(() => useExecuteDepreciationPeriod(), {
      wrapper,
    })

    await act(async () => {
      await result.current.mutateAsync({
        fiscal_year_id: FY_ID,
        period_end_date: '2026-01-31',
      })
    })

    await waitFor(() =>
      expect(getInvalidated(qc, IN_SCOPE_KEYS.incomeStatement)).toBe(true),
    )
    // Båda dateRange-varianter för FY_ID invaliderade
    expect(getInvalidated(qc, IN_SCOPE_KEYS.incomeStatement)).toBe(true)
    expect(getInvalidated(qc, customIncomeKey)).toBe(true)
    expect(getInvalidated(qc, IN_SCOPE_KEYS.balanceSheet)).toBe(true)
    expect(getInvalidated(qc, customBalanceKey)).toBe(true)
    // Annan FY — ORÖRD
    expect(getInvalidated(qc, otherFyIncomeKey)).toBe(false)
  })

  it('negative: ingen depreciation-mutation invaliderar orelaterade queries (counterparties, invoices, vat)', async () => {
    const { qc, wrapper } = makeWrapper()
    prepopulate(qc)

    // Kör tre mutationer i följd
    mockIpcResponse('depreciation:create-asset', {
      success: true,
      data: { id: 99, scheduleCount: 5 },
    })
    mockIpcResponse('depreciation:execute-period', {
      success: true,
      data: { executedScheduleCount: 3, totalDepreciationOre: 30000 },
    })
    mockIpcResponse('depreciation:dispose', { success: true, data: null })

    const { result: createRes } = renderHook(() => useCreateFixedAsset(), {
      wrapper,
    })
    const { result: executeRes } = renderHook(
      () => useExecuteDepreciationPeriod(),
      { wrapper },
    )
    const { result: disposeRes } = renderHook(() => useDisposeFixedAsset(), {
      wrapper,
    })

    await act(async () => {
      await createRes.current.mutateAsync({
        name: 'Test',
        acquisition_date: '2026-01-01',
        acquisition_cost_ore: 100000,
        residual_value_ore: 0,
        useful_life_months: 60,
        method: 'linear',
        account_asset: '1210',
        account_accumulated_depreciation: '1219',
        account_depreciation_expense: '7832',
      })
      await executeRes.current.mutateAsync({
        fiscal_year_id: FY_ID,
        period_end_date: '2026-01-31',
      })
      await disposeRes.current.mutateAsync({
        id: ASSET_ID,
        disposed_date: '2026-06-01',
      })
    })

    // Efter alla tre mutationer — out-of-scope ska fortfarande vara intakt
    assertOutOfScopeNotInvalidated(qc)
  })
})
