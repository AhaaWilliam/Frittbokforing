// @vitest-environment jsdom
/**
 * App-level auth gate — verifies that the top-level App component shows
 * LockScreen when locked and the authenticated shell only after unlock.
 *
 * Renders the real App component. Mocks:
 *   - window.auth   (the auth IPC channels)
 *   - window.api    (minimal — listCompanies for the inner AuthenticatedApp)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '../../src/renderer/App'

function ok<T>(data: T) {
  return { success: true as const, data }
}

interface AuthMock {
  status: ReturnType<typeof vi.fn>
  listUsers: ReturnType<typeof vi.fn>
  createUser: ReturnType<typeof vi.fn>
  login: ReturnType<typeof vi.fn>
  loginWithRecovery: ReturnType<typeof vi.fn>
  logout: ReturnType<typeof vi.fn>
  changePassword: ReturnType<typeof vi.fn>
  rotateRecoveryKey: ReturnType<typeof vi.fn>
  renameUser: ReturnType<typeof vi.fn>
  deleteUser: ReturnType<typeof vi.fn>
  touch: ReturnType<typeof vi.fn>
}

let authMock: AuthMock

beforeEach(() => {
  authMock = {
    status: vi.fn(),
    listUsers: vi.fn().mockResolvedValue(ok([])),
    createUser: vi.fn(),
    login: vi.fn(),
    loginWithRecovery: vi.fn(),
    logout: vi.fn().mockResolvedValue(ok({ ok: true })),
    changePassword: vi.fn(),
    rotateRecoveryKey: vi.fn(),
    renameUser: vi.fn(),
    deleteUser: vi.fn(),
    touch: vi.fn(),
  }
  ;(window as unknown as { auth: AuthMock }).auth = authMock
  // Minimum window.api so AuthenticatedApp can hit useCompanies without crashing.
  ;(window as unknown as { api: { listCompanies: () => Promise<unknown> } }).api =
    {
      listCompanies: vi.fn().mockResolvedValue(ok([])),
    }
})

function renderApp() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>,
  )
}

describe('App auth gate', () => {
  it('shows loading initially', async () => {
    // Never resolve status → stays in loading.
    authMock.status.mockImplementation(() => new Promise(() => {}))
    renderApp()
    expect(screen.getByTestId('app-loading')).toBeInTheDocument()
  })

  it('shows LockScreen when auth is locked', async () => {
    authMock.status.mockResolvedValue(
      ok({ locked: true, userId: null, timeoutMs: 900000, msUntilLock: 900000 }),
    )
    renderApp()
    // LockScreen's empty-state lands on the create form (no users).
    await waitFor(() =>
      expect(screen.getByTestId('lockscreen-name')).toBeInTheDocument(),
    )
  })

  it('transitions to authenticated shell after successful login', async () => {
    const user = userEvent.setup()
    const alice = {
      id: '11111111-1111-1111-1111-111111111111',
      displayName: 'Alice',
      createdAt: '2026-04-19T10:00:00Z',
    }
    authMock.status.mockResolvedValue(
      ok({ locked: true, userId: null, timeoutMs: 900000, msUntilLock: 900000 }),
    )
    authMock.listUsers.mockResolvedValue(ok([alice]))
    authMock.login.mockResolvedValue(ok({ user: alice }))

    renderApp()
    await user.click(await screen.findByRole('button', { name: 'Alice' }))
    await user.type(screen.getByTestId('lockscreen-password'), 'pw12345')
    await user.click(screen.getByTestId('lockscreen-submit'))

    // After unlock, the inner app tries to load companies. Since we stubbed
    // listCompanies with empty, OnboardingWizard renders.
    await waitFor(() =>
      expect(screen.queryByTestId('lockscreen-password')).toBeNull(),
    )
  })

  it('skips lock screen entirely if status returns unlocked', async () => {
    authMock.status.mockResolvedValue(
      ok({ locked: false, userId: 'abc', timeoutMs: 900000, msUntilLock: 900000 }),
    )
    renderApp()
    // Goes directly past loading into the authenticated app.
    await waitFor(() => {
      expect(screen.queryByTestId('lockscreen-password')).toBeNull()
      expect(screen.queryByTestId('lockscreen-name')).toBeNull()
    })
  })
})
