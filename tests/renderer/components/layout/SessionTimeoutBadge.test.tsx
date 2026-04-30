// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SessionTimeoutBadge } from '../../../../src/renderer/components/layout/SessionTimeoutBadge'

interface AuthMock {
  status: ReturnType<typeof vi.fn>
}

function setupAuthMock(msUntilLock: number, locked = false) {
  const auth: AuthMock = {
    status: vi.fn().mockResolvedValue({
      success: true,
      data: { locked, msUntilLock },
    }),
  }
  ;(window as unknown as { auth: AuthMock }).auth = auth
  return auth
}

beforeEach(() => {
  vi.useRealTimers()
})

afterEach(() => {
  delete (window as unknown as { auth?: unknown }).auth
})

describe('SessionTimeoutBadge', () => {
  it('döljer sig när msUntilLock > 5 min', async () => {
    setupAuthMock(10 * 60 * 1000) // 10 min
    render(<SessionTimeoutBadge />)
    // En tick för att låta poll() resolva
    await new Promise((r) => setTimeout(r, 10))
    expect(
      screen.queryByTestId('session-timeout-badge'),
    ).not.toBeInTheDocument()
  })

  it('visar varning när msUntilLock < 5 min', async () => {
    setupAuthMock(3 * 60 * 1000) // 3 min
    render(<SessionTimeoutBadge />)
    await waitFor(() => {
      expect(screen.getByTestId('session-timeout-badge')).toBeInTheDocument()
    })
    expect(screen.getByText(/3/)).toBeInTheDocument()
    expect(screen.getByText(/minuter/)).toBeInTheDocument()
  })

  it('singular "minut" vid msUntilLock = 1 min', async () => {
    setupAuthMock(60 * 1000)
    render(<SessionTimeoutBadge />)
    await waitFor(() => {
      expect(screen.getByText(/minut$/)).toBeInTheDocument()
    })
  })

  it('locked=true → ingen badge', async () => {
    setupAuthMock(0, true)
    render(<SessionTimeoutBadge />)
    await new Promise((r) => setTimeout(r, 10))
    expect(
      screen.queryByTestId('session-timeout-badge'),
    ).not.toBeInTheDocument()
  })

  it('window.auth saknas → no-op (test-env utan preload)', async () => {
    delete (window as unknown as { auth?: unknown }).auth
    render(<SessionTimeoutBadge />)
    await new Promise((r) => setTimeout(r, 10))
    expect(
      screen.queryByTestId('session-timeout-badge'),
    ).not.toBeInTheDocument()
  })

  it('badge har role="status" + aria-live="polite"', async () => {
    setupAuthMock(2 * 60 * 1000)
    render(<SessionTimeoutBadge />)
    await waitFor(() => {
      const badge = screen.getByTestId('session-timeout-badge')
      expect(badge).toHaveAttribute('role', 'status')
      expect(badge).toHaveAttribute('aria-live', 'polite')
    })
  })
})
