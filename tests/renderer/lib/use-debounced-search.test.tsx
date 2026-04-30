// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebouncedSearch } from '../../../src/renderer/lib/use-debounced-search'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebouncedSearch', () => {
  it('initial: search och debouncedSearch är ""', () => {
    const { result } = renderHook(() => useDebouncedSearch())
    expect(result.current.search).toBe('')
    expect(result.current.debouncedSearch).toBe('')
  })

  it('setSearch uppdaterar search omedelbart men inte debounced', () => {
    const { result } = renderHook(() => useDebouncedSearch())
    act(() => {
      result.current.setSearch('test')
    })
    expect(result.current.search).toBe('test')
    expect(result.current.debouncedSearch).toBe('')
  })

  it('debouncedSearch uppdateras efter delay (default 300ms)', () => {
    const { result } = renderHook(() => useDebouncedSearch())
    act(() => {
      result.current.setSearch('hello')
    })
    expect(result.current.debouncedSearch).toBe('')
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current.debouncedSearch).toBe('hello')
  })

  it('rapida ändringar avbryter tidigare timer (debouncing)', () => {
    const { result } = renderHook(() => useDebouncedSearch())
    act(() => {
      result.current.setSearch('a')
    })
    act(() => {
      vi.advanceTimersByTime(150)
    })
    act(() => {
      result.current.setSearch('ab')
    })
    act(() => {
      vi.advanceTimersByTime(150)
    })
    // Bara 150 ms sedan senaste setSearch — debounced bör fortfarande vara ''
    expect(result.current.debouncedSearch).toBe('')
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current.debouncedSearch).toBe('ab')
  })

  it('respekterar custom delay', () => {
    const { result } = renderHook(() => useDebouncedSearch(100))
    act(() => {
      result.current.setSearch('x')
    })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current.debouncedSearch).toBe('x')
  })
})
