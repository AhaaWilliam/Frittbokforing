import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'

// ── Types ──────────────────────────────────────────────────────────

export type RouteParams = Record<string, string>

export interface RouteMatch {
  page: string
  params: RouteParams
  path: string
}

export interface RouteDefinition {
  pattern: string
  page: string
}

interface RouterContextValue {
  currentMatch: RouteMatch
  navigate: (path: string) => void
}

// ── Pattern matching ───────────────────────────────────────────────

function matchRoute(
  path: string,
  routes: RouteDefinition[],
): RouteMatch | null {
  const segments = path.split('/').filter(Boolean)

  for (const route of routes) {
    const patternSegments = route.pattern.split('/').filter(Boolean)
    if (segments.length !== patternSegments.length) continue

    const params: RouteParams = {}
    let matched = true

    for (let i = 0; i < patternSegments.length; i++) {
      const pat = patternSegments[i]
      const seg = segments[i]
      if (pat.startsWith(':')) {
        params[pat.slice(1)] = seg
      } else if (pat !== seg) {
        matched = false
        break
      }
    }

    if (matched) {
      return { page: route.page, params, path }
    }
  }

  return null
}

/** Check if `currentPath` starts with `linkPath` (prefix match for active state). */
export function isRouteActive(currentPath: string, linkPath: string): boolean {
  const current = currentPath.replace(/\/$/, '') || '/'
  const link = linkPath.replace(/\/$/, '') || '/'
  return current === link || current.startsWith(link + '/')
}

// ── Context ────────────────────────────────────────────────────────

const RouterContext = createContext<RouterContextValue | null>(null)

// ── Hooks ──────────────────────────────────────────────────────────

export function useRoute(): RouteMatch {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useRoute must be used within HashRouter')
  return ctx.currentMatch
}

export function useNavigate(): (path: string) => void {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useNavigate must be used within HashRouter')
  return ctx.navigate
}

// ── Helper to read current hash path ───────────────────────────────

function getHashPath(): string {
  const hash = window.location.hash
  const raw = hash.startsWith('#') ? hash.slice(1) : '/'
  return raw.split('?')[0]
}

/** Read query params from the current hash URL. */
export function getHashParams(): URLSearchParams {
  const hash = window.location.hash
  const idx = hash.indexOf('?')
  return idx >= 0
    ? new URLSearchParams(hash.slice(idx + 1))
    : new URLSearchParams()
}

/** Update query params without triggering navigation (uses replaceState). */
export function setHashParams(params: Record<string, string>): void {
  const path = getHashPath()
  const search = new URLSearchParams(params).toString()
  const newHash = search ? `${path}?${search}` : path
  window.history.replaceState(null, '', `#${newHash}`)
}

// ── Components ─────────────────────────────────────────────────────

interface HashRouterProps {
  routes: RouteDefinition[]
  children: ReactNode
  fallback?: string
}

export function HashRouter({
  routes,
  children,
  fallback = '/overview',
}: HashRouterProps) {
  const [currentPath, setCurrentPath] = useState(() => getHashPath())

  useEffect(() => {
    function onHashChange() {
      setCurrentPath(getHashPath())
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = useCallback((path: string) => {
    window.location.hash = path
  }, [])

  const currentMatch = useMemo(() => {
    const match = matchRoute(currentPath, routes)
    if (match) return match

    // Fallback: redirect to fallback path
    if (currentPath !== fallback) {
      window.location.hash = fallback
    }
    return (
      matchRoute(fallback, routes) ?? {
        page: 'overview',
        params: {},
        path: fallback,
      }
    )
  }, [currentPath, routes, fallback])

  const value = useMemo(
    () => ({ currentMatch, navigate }),
    [currentMatch, navigate],
  )

  return (
    <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
  )
}

interface LinkProps {
  to: string
  children: ReactNode
  className?: string
  activeClassName?: string
  testId?: string
}

export function Link({
  to,
  children,
  className = '',
  activeClassName = '',
  testId,
}: LinkProps) {
  const { currentMatch, navigate } = useContext(RouterContext) ?? {}

  const isActive = currentMatch ? isRouteActive(currentMatch.path, to) : false

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    navigate?.(to)
  }

  return (
    <a
      href={`#${to}`}
      onClick={handleClick}
      // VS-87: aria-current="page" så skärmläsare annonserar aktuell route
      // i navigation-listor (sidebar). Symmetri med NavItem (VS-83).
      aria-current={isActive ? 'page' : undefined}
      className={`${className} ${isActive ? activeClassName : ''}`.trim()}
      data-testid={testId}
    >
      {children}
    </a>
  )
}

// ── Exported for testing ───────────────────────────────────────────

export { matchRoute }
