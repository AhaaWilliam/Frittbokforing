// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useFilterParam } from '../../../src/renderer/lib/use-filter-param'

const STATUSES = ['draft', 'unpaid', 'paid', 'overdue'] as const
type Status = (typeof STATUSES)[number]

function setHash(hash: string) {
  window.location.hash = hash
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

describe('useFilterParam', () => {
  beforeEach(() => {
    window.location.hash = '#/income'
  })

  it('returnerar undefined när URL saknar param och inget defaultValue', () => {
    const { result } = renderHook(() =>
      useFilterParam<Status>('invoices_status', STATUSES),
    )
    expect(result.current[0]).toBeUndefined()
  })

  it('returnerar defaultValue när URL saknar param', () => {
    const { result } = renderHook(() =>
      useFilterParam<Status>('invoices_status', STATUSES, 'draft'),
    )
    expect(result.current[0]).toBe('draft')
  })

  it('läser giltigt värde från URL', () => {
    window.location.hash = '#/income?invoices_status=unpaid'
    const { result } = renderHook(() =>
      useFilterParam<Status>('invoices_status', STATUSES),
    )
    expect(result.current[0]).toBe('unpaid')
  })

  it('ogiltigt URL-värde → default, strippar param från URL', () => {
    window.location.hash = '#/income?invoices_status=xyz'
    const { result } = renderHook(() =>
      useFilterParam<Status>('invoices_status', STATUSES),
    )
    expect(result.current[0]).toBeUndefined()
    expect(window.location.hash).not.toContain('invoices_status')
  })

  it('setFilter uppdaterar URL + state', () => {
    const { result } = renderHook(() =>
      useFilterParam<Status>('invoices_status', STATUSES),
    )
    act(() => {
      result.current[1]('paid')
    })
    expect(result.current[0]).toBe('paid')
    expect(window.location.hash).toContain('invoices_status=paid')
  })

  it('setFilter(undefined) tar bort param från URL', () => {
    window.location.hash = '#/income?invoices_status=unpaid'
    const { result } = renderHook(() =>
      useFilterParam<Status>('invoices_status', STATUSES),
    )
    act(() => {
      result.current[1](undefined)
    })
    expect(result.current[0]).toBeUndefined()
    expect(window.location.hash).not.toContain('invoices_status')
  })

  it('andra query-params bevaras när filter ändras', () => {
    window.location.hash = '#/income?invoices_page=3&invoices_status=draft'
    const { result } = renderHook(() =>
      useFilterParam<Status>('invoices_status', STATUSES),
    )
    act(() => {
      result.current[1]('overdue')
    })
    expect(window.location.hash).toContain('invoices_page=3')
    expect(window.location.hash).toContain('invoices_status=overdue')
  })

  it('hashchange från extern källa synkar state', () => {
    const { result } = renderHook(() =>
      useFilterParam<Status>('invoices_status', STATUSES),
    )
    expect(result.current[0]).toBeUndefined()
    act(() => {
      setHash('#/income?invoices_status=paid')
    })
    expect(result.current[0]).toBe('paid')
  })

  it('ogiltigt URL-värde strippar bara målparam, andra params intakta', () => {
    window.location.hash = '#/income?invoices_page=2&invoices_status=xyz'
    renderHook(() => useFilterParam<Status>('invoices_status', STATUSES))
    expect(window.location.hash).not.toContain('invoices_status')
    expect(window.location.hash).toContain('invoices_page=2')
  })

  it('isolation mellan två hooks med olika keys', () => {
    window.location.hash = '#/x?invoices_status=paid&expenses_status=draft'
    const { result: inv } = renderHook(() =>
      useFilterParam<Status>('invoices_status', STATUSES),
    )
    const { result: exp } = renderHook(() =>
      useFilterParam<Status>('expenses_status', STATUSES),
    )
    expect(inv.current[0]).toBe('paid')
    expect(exp.current[0]).toBe('draft')

    act(() => {
      inv.current[1]('overdue')
    })
    expect(inv.current[0]).toBe('overdue')
    expect(window.location.hash).toContain('expenses_status=draft')
  })

  it('setFilter till defaultValue tar bort param från URL', () => {
    const { result } = renderHook(() =>
      useFilterParam<Status>('invoices_status', STATUSES, 'draft'),
    )
    act(() => {
      result.current[1]('unpaid')
    })
    expect(window.location.hash).toContain('invoices_status=unpaid')
    act(() => {
      result.current[1]('draft')
    })
    expect(window.location.hash).not.toContain('invoices_status')
    expect(result.current[0]).toBe('draft')
  })
})
