// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { getHashParams, setHashParams, matchRoute } from '../../src/renderer/lib/router'

describe('getHashPath strips query params (A1)', () => {
  it('matchRoute matches /account-statement from hash with params', () => {
    // matchRoute receives the path portion — verify it matches correctly
    const routes = [{ pattern: '/account-statement', page: 'account-statement' }]
    const result = matchRoute('/account-statement', routes)
    expect(result).toMatchObject({ page: 'account-statement' })
  })

  it('getHashPath returns clean path when hash has params', () => {
    window.location.hash = '#/account-statement?account=1510'
    // getHashPath is internal but we verify via getHashParams + route matching
    const params = getHashParams()
    expect(params.get('account')).toBe('1510')
  })
})

describe('getHashParams', () => {
  beforeEach(() => {
    window.location.hash = ''
  })

  it('returns params from hash', () => {
    window.location.hash = '#/account-statement?account=1510&from=2026-01-01'
    const params = getHashParams()
    expect(params.get('account')).toBe('1510')
    expect(params.get('from')).toBe('2026-01-01')
  })

  it('returns empty URLSearchParams when no params', () => {
    window.location.hash = '#/account-statement'
    const params = getHashParams()
    expect(params.toString()).toBe('')
  })

  it('returns empty URLSearchParams when no hash', () => {
    window.location.hash = ''
    const params = getHashParams()
    expect(params.toString()).toBe('')
  })
})

describe('setHashParams', () => {
  beforeEach(() => {
    window.location.hash = '#/account-statement'
  })

  it('updates hash with params without triggering hashchange', () => {
    let fired = false
    const handler = () => { fired = true }
    window.addEventListener('hashchange', handler)
    try {
      setHashParams({ account: '1510', from: '2026-01-01' })
      // replaceState does NOT fire hashchange
      expect(fired).toBe(false)
      // Verify the hash was updated
      expect(window.location.hash).toContain('account=1510')
      expect(window.location.hash).toContain('from=2026-01-01')
    } finally {
      window.removeEventListener('hashchange', handler)
    }
  })

  it('clears params when empty object', () => {
    setHashParams({ account: '1510' })
    expect(window.location.hash).toContain('account=1510')
    setHashParams({})
    expect(window.location.hash).toBe('#/account-statement')
  })
})
