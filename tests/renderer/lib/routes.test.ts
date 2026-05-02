import { describe, it, expect } from 'vitest'
import { routes } from '../../../src/renderer/lib/routes'

describe('routes-tabellen', () => {
  it('innehåller alla expected pages (smoke)', () => {
    const pages = new Set(routes.map((r) => r.page))
    expect(pages.has('overview')).toBe(true)
    expect(pages.has('income')).toBe(true)
    expect(pages.has('expenses')).toBe(true)
    expect(pages.has('vat')).toBe(true)
    expect(pages.has('tax')).toBe(true)
    expect(pages.has('customers')).toBe(true)
    expect(pages.has('suppliers')).toBe(true)
    expect(pages.has('products')).toBe(true)
    expect(pages.has('accounts')).toBe(true)
    expect(pages.has('manual-entries')).toBe(true)
    expect(pages.has('imported-entries')).toBe(true)
    expect(pages.has('settings')).toBe(true)
  })

  it('master-detail-routes är specific-före-generic (HashRouter prefix-match)', () => {
    // /customers/create måste komma FÖRE /customers/:id (annars matchar :id "create")
    const customerIdx = routes.findIndex((r) => r.pattern === '/customers/:id')
    const createIdx = routes.findIndex((r) => r.pattern === '/customers/create')
    const editIdx = routes.findIndex((r) => r.pattern === '/customers/:id/edit')
    expect(createIdx).toBeLessThan(customerIdx)
    expect(editIdx).toBeLessThan(customerIdx)
  })

  it('sub-view-routes (income/edit) är före /income (generic)', () => {
    const generic = routes.findIndex((r) => r.pattern === '/income')
    const create = routes.findIndex((r) => r.pattern === '/income/create')
    const edit = routes.findIndex((r) => r.pattern === '/income/edit/:id')
    expect(create).toBeLessThan(generic)
    expect(edit).toBeLessThan(generic)
  })

  it('alla pattern startar med /', () => {
    for (const r of routes) {
      expect(r.pattern.startsWith('/')).toBe(true)
    }
  })

  it('inga duplicate patterns', () => {
    const patterns = routes.map((r) => r.pattern)
    expect(new Set(patterns).size).toBe(patterns.length)
  })

  it('bank-statements har både list + detail', () => {
    const detail = routes.find((r) => r.pattern === '/bank-statements/:id')
    const list = routes.find((r) => r.pattern === '/bank-statements')
    expect(detail).toBeDefined()
    expect(list).toBeDefined()
  })

  it('alla page-string mappar till en känd AppShell-page-id', () => {
    const knownPages = new Set([
      'overview',
      'income',
      'expenses',
      'vat',
      'tax',
      'reports',
      'export',
      'settings',
      'customers',
      'products',
      'manual-entries',
      'imported-entries',
      'accounts',
      'suppliers',
      'account-statement',
      'aging',
      'budget',
      'accruals',
      'fixed-assets',
      'import',
      'bank-statements',
      'sepa-dd',
      'inbox',
    ])
    for (const r of routes) {
      expect(knownPages.has(r.page)).toBe(true)
    }
  })
})
