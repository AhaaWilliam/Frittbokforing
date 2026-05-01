// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useJournalPreview } from '../../../src/renderer/lib/use-journal-preview'

interface PreviewApi {
  previewJournalLines: ReturnType<typeof vi.fn>
}

function setupApi(impl: PreviewApi['previewJournalLines']) {
  ;(window as unknown as { api: PreviewApi }).api = {
    previewJournalLines: impl,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  delete (window as unknown as { api?: unknown }).api
})

describe('useJournalPreview', () => {
  it('input=null → preview=null, pending=false', () => {
    setupApi(vi.fn())
    const { result } = renderHook(() => useJournalPreview(null))
    expect(result.current.preview).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.pending).toBe(false)
  })

  it('enabled=false → ingen IPC-call', () => {
    const fn = vi.fn().mockResolvedValue({ success: true, data: { lines: [] } })
    setupApi(fn)
    renderHook(() =>
      useJournalPreview({ x: 1 } as unknown as Parameters<
        typeof window.api.previewJournalLines
      >[0], { enabled: false }),
    )
    expect(fn).not.toHaveBeenCalled()
  })

  it('debounceras (default 150ms) innan IPC anropas', async () => {
    const fn = vi
      .fn()
      .mockResolvedValue({ success: true, data: { lines: ['a'] } })
    setupApi(fn)
    const { result } = renderHook(() =>
      useJournalPreview({ x: 1 } as unknown as Parameters<
        typeof window.api.previewJournalLines
      >[0]),
    )
    expect(result.current.pending).toBe(true)
    expect(fn).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(150)
    })
    expect(fn).toHaveBeenCalledOnce()
  })

  it('success → preview sätts, error=null, pending=false', async () => {
    const fn = vi
      .fn()
      .mockResolvedValue({ success: true, data: { lines: ['a', 'b'] } })
    setupApi(fn)
    const { result } = renderHook(() =>
      useJournalPreview({ x: 1 } as unknown as Parameters<
        typeof window.api.previewJournalLines
      >[0]),
    )
    await act(async () => {
      vi.advanceTimersByTime(150)
      // Flush mikrotasks så .then() resolverar med fakeTimers aktiv
      await vi.runAllTimersAsync()
    })
    expect(result.current.preview).toEqual({ lines: ['a', 'b'] })
    expect(result.current.error).toBeNull()
  })

  it('IPC-error (success: false) sätter error', async () => {
    const fn = vi.fn().mockResolvedValue({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'bad input',
      field: 'amount',
    })
    setupApi(fn)
    const { result } = renderHook(() =>
      useJournalPreview({ x: 1 } as unknown as Parameters<
        typeof window.api.previewJournalLines
      >[0]),
    )
    await act(async () => {
      vi.advanceTimersByTime(150)
      // Flush mikrotasks så .then() resolverar med fakeTimers aktiv
      await vi.runAllTimersAsync()
    })
    expect(result.current.preview).toBeNull()
    expect(result.current.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'bad input',
      field: 'amount',
    })
  })

  it('rejection sätter UNEXPECTED_ERROR', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('network'))
    setupApi(fn)
    const { result } = renderHook(() =>
      useJournalPreview({ x: 1 } as unknown as Parameters<
        typeof window.api.previewJournalLines
      >[0]),
    )
    await act(async () => {
      vi.advanceTimersByTime(150)
      await vi.runAllTimersAsync()
    })
    expect(result.current.error).toEqual({
      code: 'UNEXPECTED_ERROR',
      message: 'network',
    })
  })

  it('custom debounceMs respekteras', async () => {
    const fn = vi.fn().mockResolvedValue({ success: true, data: {} })
    setupApi(fn)
    renderHook(() =>
      useJournalPreview(
        { x: 1 } as unknown as Parameters<
          typeof window.api.previewJournalLines
        >[0],
        { debounceMs: 500 },
      ),
    )
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(fn).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(fn).toHaveBeenCalledOnce()
  })

  it('input-byte under in-flight debounce avbryter tidigare', async () => {
    const fn = vi.fn().mockResolvedValue({ success: true, data: {} })
    setupApi(fn)
    const { rerender } = renderHook(
      ({ inp }: { inp: Parameters<typeof window.api.previewJournalLines>[0] }) =>
        useJournalPreview(inp),
      { initialProps: { inp: { x: 1 } as unknown as Parameters<typeof window.api.previewJournalLines>[0] } },
    )
    await act(async () => {
      vi.advanceTimersByTime(50)
    })
    rerender({ inp: { x: 2 } as unknown as Parameters<typeof window.api.previewJournalLines>[0] })
    await act(async () => {
      vi.advanceTimersByTime(150)
    })
    // Bara den sista kallas (50ms-call avbröts av cleanup när input bytte)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith({ x: 2 })
  })
})
