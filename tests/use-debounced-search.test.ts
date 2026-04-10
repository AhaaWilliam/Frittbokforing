// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useDebouncedSearch } from '../src/renderer/lib/use-debounced-search'

describe('useDebouncedSearch', () => {
  it('returns empty strings initially', () => {
    const { result } = renderHook(() => useDebouncedSearch())
    expect(result.current.search).toBe('')
    expect(result.current.debouncedSearch).toBe('')
  })

  it('setSearch updates search immediately', () => {
    const { result } = renderHook(() => useDebouncedSearch())
    act(() => result.current.setSearch('hello'))
    expect(result.current.search).toBe('hello')
    expect(result.current.debouncedSearch).toBe('')
  })

  it('debouncedSearch updates after delay', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useDebouncedSearch(200))

    act(() => result.current.setSearch('test'))
    expect(result.current.debouncedSearch).toBe('')

    act(() => vi.advanceTimersByTime(200))
    expect(result.current.debouncedSearch).toBe('test')

    vi.useRealTimers()
  })

  it('cleanup on unmount prevents state update', () => {
    vi.useFakeTimers()
    const { result, unmount } = renderHook(() => useDebouncedSearch(300))

    act(() => result.current.setSearch('abc'))
    unmount()

    // Advancing timers after unmount should not throw
    expect(() => vi.advanceTimersByTime(300)).not.toThrow()

    vi.useRealTimers()
  })
})
