// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  HashRouter,
  Link,
  useRoute,
  useNavigate,
  isRouteActive,
  getHashParams,
  setHashParams,
  type RouteDefinition,
} from '../../../src/renderer/lib/router'

const routes: RouteDefinition[] = [
  { pattern: '/overview', page: 'overview' },
  { pattern: '/customers/:id', page: 'customers' },
  { pattern: '/customers/:id/edit', page: 'customers' },
  { pattern: '/customers', page: 'customers' },
]

beforeEach(() => {
  window.location.hash = '#/overview'
})

afterEach(() => {
  window.location.hash = '#/'
})

function RouteProbe() {
  const r = useRoute()
  return (
    <div>
      <span data-testid="page">{r.page}</span>
      <span data-testid="path">{r.path}</span>
      <span data-testid="params">{JSON.stringify(r.params)}</span>
    </div>
  )
}

function NavProbe({ to }: { to: string }) {
  const navigate = useNavigate()
  return <button onClick={() => navigate(to)}>go</button>
}

describe('isRouteActive', () => {
  it('exakt match → true', () => {
    expect(isRouteActive('/customers', '/customers')).toBe(true)
  })

  it('prefix match → true', () => {
    expect(isRouteActive('/customers/5', '/customers')).toBe(true)
    expect(isRouteActive('/customers/5/edit', '/customers')).toBe(true)
  })

  it('non-match → false', () => {
    expect(isRouteActive('/products', '/customers')).toBe(false)
  })

  it('partial-prefix utan / → false (förhindrar /custom matches /customers)', () => {
    expect(isRouteActive('/customer', '/customers')).toBe(false)
  })

  it('trailing slash normaliseras', () => {
    expect(isRouteActive('/customers/', '/customers')).toBe(true)
    expect(isRouteActive('/customers', '/customers/')).toBe(true)
  })

  it('root path "/"', () => {
    expect(isRouteActive('/', '/')).toBe(true)
  })
})

describe('HashRouter — routing', () => {
  it('matchar /overview → page=overview', () => {
    window.location.hash = '#/overview'
    render(
      <HashRouter routes={routes}>
        <RouteProbe />
      </HashRouter>,
    )
    expect(screen.getByTestId('page')).toHaveTextContent('overview')
    expect(screen.getByTestId('path')).toHaveTextContent('/overview')
  })

  it('matchar /customers/42 → params.id=42', () => {
    window.location.hash = '#/customers/42'
    render(
      <HashRouter routes={routes}>
        <RouteProbe />
      </HashRouter>,
    )
    expect(screen.getByTestId('page')).toHaveTextContent('customers')
    expect(JSON.parse(screen.getByTestId('params').textContent ?? '{}')).toEqual(
      { id: '42' },
    )
  })

  it('non-match → fallback (default /overview)', () => {
    window.location.hash = '#/non-existent'
    render(
      <HashRouter routes={routes}>
        <RouteProbe />
      </HashRouter>,
    )
    expect(screen.getByTestId('page')).toHaveTextContent('overview')
  })

  it('useNavigate uppdaterar hash + matchar ny route', async () => {
    const user = userEvent.setup()
    render(
      <HashRouter routes={routes}>
        <RouteProbe />
        <NavProbe to="/customers/9" />
      </HashRouter>,
    )
    await user.click(screen.getByText('go'))
    expect(screen.getByTestId('page')).toHaveTextContent('customers')
    expect(JSON.parse(screen.getByTestId('params').textContent ?? '{}')).toEqual(
      { id: '9' },
    )
  })
})

describe('Link', () => {
  it('renderar <a> med href="#path"', () => {
    render(
      <HashRouter routes={routes}>
        <Link to="/customers">Kunder</Link>
      </HashRouter>,
    )
    const link = screen.getByRole('link', { name: 'Kunder' })
    expect(link).toHaveAttribute('href', '#/customers')
  })

  it('aktiv route → activeClassName tillagd', () => {
    window.location.hash = '#/customers'
    render(
      <HashRouter routes={routes}>
        <Link to="/customers" activeClassName="active-x">
          Kunder
        </Link>
      </HashRouter>,
    )
    const link = screen.getByRole('link', { name: 'Kunder' })
    expect(link.className).toContain('active-x')
  })

  it('inaktiv route → ingen activeClassName', () => {
    window.location.hash = '#/overview'
    render(
      <HashRouter routes={routes}>
        <Link to="/customers" activeClassName="active-x">
          Kunder
        </Link>
      </HashRouter>,
    )
    const link = screen.getByRole('link', { name: 'Kunder' })
    expect(link.className).not.toContain('active-x')
  })
})

describe('getHashParams / setHashParams', () => {
  it('getHashParams returnerar tomt vid ingen query', () => {
    window.location.hash = '#/customers'
    expect(getHashParams().toString()).toBe('')
  })

  it('getHashParams parsar query-string', () => {
    window.location.hash = '#/customers?from=2026-01-01&to=2026-12-31'
    const p = getHashParams()
    expect(p.get('from')).toBe('2026-01-01')
    expect(p.get('to')).toBe('2026-12-31')
  })

  it('setHashParams uppdaterar hash utan att trigga navigation', () => {
    window.location.hash = '#/customers'
    setHashParams({ search: 'foo' })
    expect(window.location.hash).toBe('#/customers?search=foo')
  })

  it('setHashParams med tom map ger path utan ?', () => {
    window.location.hash = '#/customers?search=foo'
    setHashParams({})
    expect(window.location.hash).toBe('#/customers')
  })
})

describe('useRoute / useNavigate utan provider', () => {
  it('useRoute kastar', () => {
    const oldErr = console.error
    console.error = () => {}
    try {
      function Probe() {
        useRoute()
        return null
      }
      expect(() => render(<Probe />)).toThrow(
        /useRoute must be used within HashRouter/,
      )
    } finally {
      console.error = oldErr
    }
  })

  it('useNavigate kastar', () => {
    const oldErr = console.error
    console.error = () => {}
    try {
      function Probe() {
        useNavigate()
        return null
      }
      expect(() => render(<Probe />)).toThrow(
        /useNavigate must be used within HashRouter/,
      )
    } finally {
      console.error = oldErr
    }
  })
})
