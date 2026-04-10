import { describe, it, expect } from 'vitest'
import { matchRoute, isRouteActive } from '../src/renderer/lib/router'
import { routes } from '../src/renderer/lib/routes'

describe('Navigation integration — sub-view flow', () => {
  it('income list → create → edit/42 → back to list', () => {
    // Start at list
    const list = matchRoute('/income', routes)
    expect(list!.page).toBe('income')
    expect(list!.params).toEqual({})

    // Navigate to create
    const create = matchRoute('/income/create', routes)
    expect(create!.page).toBe('income')
    expect(create!.path).toBe('/income/create')

    // Navigate to edit
    const edit = matchRoute('/income/edit/42', routes)
    expect(edit!.page).toBe('income')
    expect(edit!.params).toEqual({ id: '42' })

    // Back to list
    const backToList = matchRoute('/income', routes)
    expect(backToList!.page).toBe('income')
    expect(backToList!.params).toEqual({})
  })

  it('expenses list → view/5 → edit/5 → list', () => {
    const list = matchRoute('/expenses', routes)
    expect(list!.page).toBe('expenses')

    const view = matchRoute('/expenses/view/5', routes)
    expect(view!.page).toBe('expenses')
    expect(view!.params).toEqual({ id: '5' })

    const edit = matchRoute('/expenses/edit/5', routes)
    expect(edit!.page).toBe('expenses')
    expect(edit!.params).toEqual({ id: '5' })

    const back = matchRoute('/expenses', routes)
    expect(back!.page).toBe('expenses')
  })
})

describe('Navigation integration — master-detail flow', () => {
  it('customers list → select/42 → edit/42 → back to list', () => {
    const list = matchRoute('/customers', routes)
    expect(list!.page).toBe('customers')

    const detail = matchRoute('/customers/42', routes)
    expect(detail!.page).toBe('customers')
    expect(detail!.params).toEqual({ id: '42' })

    const edit = matchRoute('/customers/42/edit', routes)
    expect(edit!.page).toBe('customers')
    expect(edit!.params).toEqual({ id: '42' })

    const back = matchRoute('/customers', routes)
    expect(back!.page).toBe('customers')
    expect(back!.params).toEqual({})
  })

  it('suppliers create flow', () => {
    const create = matchRoute('/suppliers/create', routes)
    expect(create!.page).toBe('suppliers')
    expect(create!.params).toEqual({})
  })
})

describe('Navigation integration — sidebar active state', () => {
  it('sidebar shows correct active state for nested routes', () => {
    // On /customers/42/edit, /customers sidebar link should be active
    expect(isRouteActive('/customers/42/edit', '/customers')).toBe(true)

    // But /suppliers should not be active
    expect(isRouteActive('/customers/42/edit', '/suppliers')).toBe(false)

    // /income/create should mark /income as active
    expect(isRouteActive('/income/create', '/income')).toBe(true)

    // /income/edit/7 should mark /income as active
    expect(isRouteActive('/income/edit/7', '/income')).toBe(true)
  })
})

describe('Navigation integration — unknown route fallback', () => {
  it('unknown route returns null (triggers fallback in HashRouter)', () => {
    expect(matchRoute('/nonexistent', routes)).toBeNull()
    expect(matchRoute('/foo/bar/baz', routes)).toBeNull()
    expect(matchRoute('/', routes)).toBeNull()
  })
})
