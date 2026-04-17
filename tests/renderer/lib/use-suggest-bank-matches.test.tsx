// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useSuggestBankMatches } from '../../../src/renderer/lib/hooks'

function wrapper(): React.FC<{ children: React.ReactNode }> {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return ({ children }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

describe('useSuggestBankMatches (S56 A3)', () => {
  beforeEach(() => {
    ;(globalThis as unknown as { window: Window }).window = globalThis as unknown as Window
    ;(window as unknown as { api: Record<string, unknown> }).api = {}
  })

  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api
  })

  it('disabled när enabled=false → ingen IPC-anrop', async () => {
    const fn = vi.fn()
    ;(window as unknown as { api: Record<string, unknown> }).api = {
      suggestBankMatches: fn,
    }
    const { result } = renderHook(() => useSuggestBankMatches(1, false), {
      wrapper: wrapper(),
    })
    await new Promise((r) => setTimeout(r, 10))
    expect(fn).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })

  it('enabled=true → anropar window.api.suggestBankMatches', async () => {
    const fn = vi.fn().mockResolvedValue({
      success: true,
      data: [
        { bank_transaction_id: 1, candidates: [] },
      ],
    })
    ;(window as unknown as { api: Record<string, unknown> }).api = {
      suggestBankMatches: fn,
    }
    const { result } = renderHook(() => useSuggestBankMatches(42, true), {
      wrapper: wrapper(),
    })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(fn).toHaveBeenCalledWith({ statement_id: 42 })
    expect(result.current.data).toHaveLength(1)
  })

  it('IPC-fel → error-state exponeras (F6)', async () => {
    const fn = vi.fn().mockResolvedValue({
      success: false,
      code: 'UNEXPECTED_ERROR',
      error: 'boom',
    })
    ;(window as unknown as { api: Record<string, unknown> }).api = {
      suggestBankMatches: fn,
    }
    const { result } = renderHook(() => useSuggestBankMatches(1, true), {
      wrapper: wrapper(),
    })
    await waitFor(() => expect(result.current.error).toBeTruthy())
    expect(String(result.current.error)).toContain('boom')
  })
})
