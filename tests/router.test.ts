import { describe, it, expect } from 'vitest'
import { matchRoute, isRouteActive } from '../src/renderer/lib/router'
import type { RouteDefinition } from '../src/renderer/lib/router'
import { routes } from '../src/renderer/lib/routes'

describe('matchRoute', () => {
  it('matches a static route', () => {
    const result = matchRoute('/overview', routes)
    expect(result).not.toBeNull()
    expect(result!.page).toBe('overview')
    expect(result!.params).toEqual({})
  })

  it('matches a parametrized route', () => {
    const result = matchRoute('/customers/42', routes)
    expect(result).not.toBeNull()
    expect(result!.page).toBe('customers')
    expect(result!.params).toEqual({ id: '42' })
  })

  it('matches specific route before generic (customers/create before :id)', () => {
    const result = matchRoute('/customers/create', routes)
    expect(result).not.toBeNull()
    expect(result!.page).toBe('customers')
    expect(result!.params).toEqual({})
  })

  it('matches edit route for master-detail', () => {
    const result = matchRoute('/customers/99/edit', routes)
    expect(result).not.toBeNull()
    expect(result!.page).toBe('customers')
    expect(result!.params).toEqual({ id: '99' })
  })

  it('matches sub-view edit route', () => {
    const result = matchRoute('/income/edit/7', routes)
    expect(result).not.toBeNull()
    expect(result!.page).toBe('income')
    expect(result!.params).toEqual({ id: '7' })
  })

  it('matches sub-view view route', () => {
    const result = matchRoute('/expenses/view/15', routes)
    expect(result).not.toBeNull()
    expect(result!.page).toBe('expenses')
    expect(result!.params).toEqual({ id: '15' })
  })

  it('returns null for unknown route', () => {
    const result = matchRoute('/nonexistent', routes)
    expect(result).toBeNull()
  })

  it('returns null for empty path', () => {
    const result = matchRoute('', routes)
    expect(result).toBeNull()
  })

  it('matches all simple pages', () => {
    const simplePages = [
      'overview',
      'accounts',
      'settings',
      'export',
      'reports',
      'tax',
      'vat',
    ]
    for (const page of simplePages) {
      const result = matchRoute(`/${page}`, routes)
      expect(result).not.toBeNull()
      expect(result!.page).toBe(page)
    }
  })

  it('matches manual-entries sub-view routes', () => {
    expect(matchRoute('/manual-entries', routes)!.page).toBe('manual-entries')
    expect(matchRoute('/manual-entries/create', routes)!.page).toBe(
      'manual-entries',
    )
    expect(matchRoute('/manual-entries/edit/3', routes)!.params).toEqual({
      id: '3',
    })
  })

  it('does not match partial paths', () => {
    const result = matchRoute('/customers/42/edit/extra', routes)
    expect(result).toBeNull()
  })

  it('handles custom route definitions', () => {
    const customRoutes: RouteDefinition[] = [
      { pattern: '/a/:x/:y', page: 'multi' },
    ]
    const result = matchRoute('/a/foo/bar', customRoutes)
    expect(result).not.toBeNull()
    expect(result!.params).toEqual({ x: 'foo', y: 'bar' })
  })
})

describe('isRouteActive', () => {
  it('exact match is active', () => {
    expect(isRouteActive('/customers', '/customers')).toBe(true)
  })

  it('nested path is active for parent', () => {
    expect(isRouteActive('/customers/42', '/customers')).toBe(true)
  })

  it('unrelated path is not active', () => {
    expect(isRouteActive('/suppliers', '/customers')).toBe(false)
  })

  it('prefix overlap does not match (customersX != customers)', () => {
    expect(isRouteActive('/customersX', '/customers')).toBe(false)
  })

  it('root path handling', () => {
    expect(isRouteActive('/overview', '/overview')).toBe(true)
  })
})
