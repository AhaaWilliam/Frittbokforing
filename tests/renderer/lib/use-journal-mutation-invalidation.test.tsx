// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useFinalizeInvoice,
  useFinalizeExpense,
  usePayInvoice,
  usePayExpense,
} from '../../../src/renderer/lib/hooks'
import { queryKeys } from '../../../src/renderer/lib/query-keys'
import { setupMockIpc, mockIpcResponse } from '../../setup/mock-ipc'

/**
 * Sprint VS-66/67 — kontrakt: alla mutation-hooks som muterar
 * journal_entries invaliderar de derived-keys som driver dashboard,
 * RR, BR, VAT-rapport och hero-pillen "Senast bokfört".
 *
 * Vakt mot regression — den specifika sortens stale-bug som VS-64..70
 * rättade (finalize utan latestVerification-invalidation, etc.).
 */

const FY_ID = 1

const JOURNAL_DERIVED_KEYS = {
  latestVerification: queryKeys.latestVerification(FY_ID),
  dashboard: queryKeys.dashboard(FY_ID),
  incomeStatement: queryKeys.incomeStatement(FY_ID),
  balanceSheet: queryKeys.balanceSheet(FY_ID),
  vatReport: queryKeys.vatReport(FY_ID),
} as const

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

function prepopulate(qc: QueryClient): void {
  for (const key of Object.values(JOURNAL_DERIVED_KEYS)) {
    qc.setQueryData(key, { placeholder: true })
  }
}

function getInvalidated(qc: QueryClient, key: readonly unknown[]): boolean {
  const state = qc.getQueryState([...key])
  return state?.isInvalidated === true
}

function assertAllJournalDerivedInvalidated(qc: QueryClient): void {
  for (const [name, key] of Object.entries(JOURNAL_DERIVED_KEYS)) {
    expect(
      getInvalidated(qc, key),
      `expected journal-derived key "${name}" to be invalidated`,
    ).toBe(true)
  }
}

const FINALIZE_RECEIPT = {
  id: 1,
  journal_entry_id: 100,
  verification_number: 42,
}

const PAYMENT_RECEIPT = {
  payment_id: 1,
  journal_entry_id: 100,
}

describe('Sprint VS-66/67 — journal-mutation invalidation-matrix', () => {
  beforeEach(() => {
    setupMockIpc()
  })

  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api
  })

  it('useFinalizeInvoice invaliderar latestVerification + dashboard + RR/BR/VAT', async () => {
    const { qc, wrapper } = makeWrapper()
    prepopulate(qc)

    mockIpcResponse('invoice:finalize', {
      success: true,
      data: FINALIZE_RECEIPT,
    })

    const { result } = renderHook(() => useFinalizeInvoice(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 1 })
    })

    await waitFor(() =>
      expect(
        getInvalidated(qc, JOURNAL_DERIVED_KEYS.latestVerification),
      ).toBe(true),
    )
    assertAllJournalDerivedInvalidated(qc)
  })

  it('useFinalizeExpense invaliderar latestVerification + dashboard + RR/BR/VAT', async () => {
    const { qc, wrapper } = makeWrapper()
    prepopulate(qc)

    mockIpcResponse('expense:finalize', {
      success: true,
      data: FINALIZE_RECEIPT,
    })

    const { result } = renderHook(() => useFinalizeExpense(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ id: 1 })
    })

    await waitFor(() =>
      expect(
        getInvalidated(qc, JOURNAL_DERIVED_KEYS.latestVerification),
      ).toBe(true),
    )
    assertAllJournalDerivedInvalidated(qc)
  })

  it('usePayInvoice invaliderar latestVerification + dashboard + RR/BR/VAT', async () => {
    const { qc, wrapper } = makeWrapper()
    prepopulate(qc)

    mockIpcResponse('invoice:pay', {
      success: true,
      data: PAYMENT_RECEIPT,
    })

    const { result } = renderHook(() => usePayInvoice(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        invoice_id: 1,
        amount_ore: 100000,
        payment_date: '2026-05-01',
        payment_method: 'bankgiro',
        account_number: '1930',
      })
    })

    await waitFor(() =>
      expect(
        getInvalidated(qc, JOURNAL_DERIVED_KEYS.latestVerification),
      ).toBe(true),
    )
    assertAllJournalDerivedInvalidated(qc)
  })

  it('usePayExpense invaliderar latestVerification + dashboard + RR/BR/VAT', async () => {
    const { qc, wrapper } = makeWrapper()
    prepopulate(qc)

    mockIpcResponse('expense:pay', {
      success: true,
      data: PAYMENT_RECEIPT,
    })

    const { result } = renderHook(() => usePayExpense(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({
        expense_id: 1,
        amount_ore: 50000,
        payment_date: '2026-05-01',
        payment_method: 'bankgiro',
        account_number: '1930',
      })
    })

    await waitFor(() =>
      expect(
        getInvalidated(qc, JOURNAL_DERIVED_KEYS.latestVerification),
      ).toBe(true),
    )
    assertAllJournalDerivedInvalidated(qc)
  })
})
