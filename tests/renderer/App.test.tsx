// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '../../src/renderer/App'

interface AuthMock {
  status: ReturnType<typeof vi.fn>
  logout: ReturnType<typeof vi.fn>
}
interface ApiMock {
  getSetting: ReturnType<typeof vi.fn>
  setSetting: ReturnType<typeof vi.fn>
  listCompanies: ReturnType<typeof vi.fn>
}

function setupMocks(opts: {
  authStatus:
    | { success: true; data: { locked: boolean; userId?: string; msUntilLock: number } }
    | { success: false; error: string }
    | 'pending'
  companies?: unknown[]
  uiMode?: string
}) {
  const auth: AuthMock = {
    status:
      opts.authStatus === 'pending'
        ? vi.fn().mockReturnValue(new Promise(() => {}))
        : vi.fn().mockResolvedValue(opts.authStatus),
    logout: vi.fn(),
  }
  ;(window as unknown as { auth: AuthMock }).auth = auth

  const api: ApiMock = {
    getSetting: vi.fn().mockResolvedValue(opts.uiMode ?? 'bokforare'),
    setSetting: vi.fn().mockResolvedValue(undefined),
    listCompanies: vi.fn().mockResolvedValue({
      success: true,
      data: opts.companies ?? [],
    }),
  }
  ;(window as unknown as { api: ApiMock }).api = api
}

function renderApp() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  /* nothing */
})

afterEach(() => {
  delete (window as unknown as { auth?: unknown }).auth
  delete (window as unknown as { api?: unknown }).api
})

describe('App', () => {
  it('auth.kind=loading → visar app-loading', () => {
    setupMocks({ authStatus: 'pending' })
    renderApp()
    expect(screen.getByTestId('app-loading')).toBeInTheDocument()
    expect(screen.getByText('Laddar...')).toBeInTheDocument()
  })

  it('auth.kind=error → visar fel-Alert med message', async () => {
    setupMocks({ authStatus: { success: false, error: 'db-locked' } })
    renderApp()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByText('db-locked')).toBeInTheDocument()
    expect(screen.getByText('Ett fel uppstod')).toBeInTheDocument()
  })

  it('auth.kind=locked → laddar inte AppShell', async () => {
    setupMocks({
      authStatus: { success: true, data: { locked: true, msUntilLock: 0 } },
    })
    const { container } = renderApp()
    // Vänta in att loading-state försvinner
    await waitFor(() => {
      expect(screen.queryByTestId('app-loading')).not.toBeInTheDocument()
    })
    // App.test verifierar att vi inte hamnat i AppShell (inga app-ready)
    expect(container.querySelector('[data-testid="app-ready"]')).toBeNull()
  })

  it('auth.unlocked + 0 companies → onboarding wizard default', async () => {
    setupMocks({
      authStatus: {
        success: true,
        data: { locked: false, userId: 'u', msUntilLock: 9000 },
      },
      companies: [],
    })
    renderApp()
    await waitFor(() => {
      expect(screen.getByTestId('wizard')).toBeInTheDocument()
    })
  })

  it('auth.unlocked + companies + companies-loading → app-loading', async () => {
    const auth: AuthMock = {
      status: vi.fn().mockResolvedValue({
        success: true,
        data: { locked: false, userId: 'u', msUntilLock: 9000 },
      }),
      logout: vi.fn(),
    }
    ;(window as unknown as { auth: AuthMock }).auth = auth
    const api: ApiMock = {
      getSetting: vi.fn().mockResolvedValue('bokforare'),
      setSetting: vi.fn(),
      listCompanies: vi.fn().mockReturnValue(new Promise(() => {})),
    }
    ;(window as unknown as { api: ApiMock }).api = api

    renderApp()
    // Vänta in att auth-loading flyter till companies-loading
    await waitFor(() => {
      expect(screen.getByTestId('app-loading')).toBeInTheDocument()
    })
  })
})
