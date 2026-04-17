// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { usePageParam } from '../../../src/renderer/lib/use-page-param'

function setHash(hash: string) {
  window.location.hash = hash
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

describe('usePageParam', () => {
  beforeEach(() => {
    window.location.hash = '#/invoices'
  })

  it('returnerar default när URL saknar param', () => {
    const { result } = renderHook(() => usePageParam('invoices_page', 0))
    expect(result.current[0]).toBe(0)
  })

  it('läser initialt värde från URL query-param', () => {
    window.location.hash = '#/invoices?invoices_page=3'
    const { result } = renderHook(() => usePageParam('invoices_page', 0))
    expect(result.current[0]).toBe(3)
  })

  it('ogiltig param (NaN) → default', () => {
    window.location.hash = '#/invoices?invoices_page=abc'
    const { result } = renderHook(() => usePageParam('invoices_page', 0))
    expect(result.current[0]).toBe(0)
  })

  it('negativ param → default', () => {
    window.location.hash = '#/invoices?invoices_page=-1'
    const { result } = renderHook(() => usePageParam('invoices_page', 0))
    expect(result.current[0]).toBe(0)
  })

  it('fractional param (?invoices_page=1.5) → heltalsdel via parseInt', () => {
    window.location.hash = '#/invoices?invoices_page=1.5'
    const { result } = renderHook(() => usePageParam('invoices_page', 0))
    expect(result.current[0]).toBe(1)
  })

  it('setPage uppdaterar URL', () => {
    const { result } = renderHook(() => usePageParam('invoices_page', 0))
    act(() => {
      result.current[1](4)
    })
    expect(result.current[0]).toBe(4)
    expect(window.location.hash).toContain('invoices_page=4')
  })

  it('page=0 (default) tar bort param från URL', () => {
    window.location.hash = '#/invoices?invoices_page=5'
    const { result } = renderHook(() => usePageParam('invoices_page', 0))
    expect(result.current[0]).toBe(5)
    act(() => {
      result.current[1](0)
    })
    expect(window.location.hash).not.toContain('invoices_page')
  })

  it('andra query-params bevaras när page ändras', () => {
    window.location.hash = '#/invoices?status=draft&invoices_page=0'
    const { result } = renderHook(() => usePageParam('invoices_page', 0))
    act(() => {
      result.current[1](2)
    })
    expect(window.location.hash).toContain('status=draft')
    expect(window.location.hash).toContain('invoices_page=2')
  })

  it('hashchange från extern källa synkar state', () => {
    const { result } = renderHook(() => usePageParam('invoices_page', 0))
    act(() => {
      setHash('#/invoices?invoices_page=5')
    })
    expect(result.current[0]).toBe(5)
  })

  it('isolation mellan två hooks med olika keys', () => {
    window.location.hash = '#/x?invoices_page=2&expenses_page=7'
    const { result: invoiceHook } = renderHook(() =>
      usePageParam('invoices_page', 0),
    )
    const { result: expenseHook } = renderHook(() =>
      usePageParam('expenses_page', 0),
    )
    expect(invoiceHook.current[0]).toBe(2)
    expect(expenseHook.current[0]).toBe(7)

    act(() => {
      invoiceHook.current[1](9)
    })
    expect(invoiceHook.current[0]).toBe(9)
    expect(window.location.hash).toContain('expenses_page=7')
  })
})
