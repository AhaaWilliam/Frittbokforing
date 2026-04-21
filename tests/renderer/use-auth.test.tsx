// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import { useAuth } from '../../src/renderer/lib/use-auth'
import type { UserMeta } from '../../src/renderer/electron'

function ok<T>(data: T) {
  return { success: true as const, data }
}
function fail(code: string, error: string) {
  return { success: false as const, code, error }
}

interface AuthMock {
  status: ReturnType<typeof vi.fn>
  logout: ReturnType<typeof vi.fn>
  listUsers: ReturnType<typeof vi.fn>
  [key: string]: unknown
}

let authMock: AuthMock

beforeEach(() => {
  authMock = {
    status: vi.fn(),
    logout: vi.fn().mockResolvedValue(ok({ ok: true })),
    listUsers: vi.fn(),
  }
  ;(window as unknown as { auth: AuthMock }).auth = authMock
})

function Probe({
  onRender,
}: {
  onRender: (auth: ReturnType<typeof useAuth>) => void
}) {
  const auth = useAuth()
  onRender(auth)
  return null
}

describe('useAuth — initial state', () => {
  it('starts in loading, resolves to locked on empty status', async () => {
    authMock.status.mockResolvedValue(
      ok({ locked: true, userId: null, timeoutMs: 900000, msUntilLock: 900000 }),
    )
    const states: string[] = []
    render(<Probe onRender={(a) => states.push(a.state.kind)} />)
    expect(states[0]).toBe('loading')
    await waitFor(() =>
      expect(states[states.length - 1]).toBe('locked'),
    )
  })

  it('resolves to unlocked when status returns a userId', async () => {
    authMock.status.mockResolvedValue(
      ok({ locked: false, userId: 'abc', timeoutMs: 900000, msUntilLock: 900000 }),
    )
    let last = null as ReturnType<typeof useAuth> | null
    render(<Probe onRender={(a) => (last = a)} />)
    await waitFor(() => expect(last?.state.kind).toBe('unlocked'))
    expect(
      last?.state.kind === 'unlocked' ? last.state.userId : null,
    ).toBe('abc')
  })

  it('sets error state when status IPC fails', async () => {
    authMock.status.mockResolvedValue(fail('UNEXPECTED_ERROR', 'fs broken'))
    let last = null as ReturnType<typeof useAuth> | null
    render(<Probe onRender={(a) => (last = a)} />)
    await waitFor(() => expect(last?.state.kind).toBe('error'))
    expect(
      last?.state.kind === 'error' ? last.state.message : null,
    ).toBe('fs broken')
  })
})

describe('useAuth — onUnlocked transitions optimistically', () => {
  it('sets state to unlocked when onUnlocked is called', async () => {
    authMock.status.mockResolvedValue(
      ok({ locked: true, userId: null, timeoutMs: 900000, msUntilLock: 900000 }),
    )
    let last = null as ReturnType<typeof useAuth> | null
    render(<Probe onRender={(a) => (last = a)} />)
    await waitFor(() => expect(last?.state.kind).toBe('locked'))

    const user: UserMeta = {
      id: '11111111-1111-1111-1111-111111111111',
      displayName: 'Alice',
      createdAt: '2026-04-19T10:00:00.000Z',
    }
    act(() => last!.onUnlocked(user))
    expect(last!.state.kind).toBe('unlocked')
  })
})

describe('useAuth — logout', () => {
  it('calls window.auth.logout and returns to locked', async () => {
    authMock.status.mockResolvedValue(
      ok({ locked: false, userId: 'abc', timeoutMs: 900000, msUntilLock: 900000 }),
    )
    let last = null as ReturnType<typeof useAuth> | null
    render(<Probe onRender={(a) => (last = a)} />)
    await waitFor(() => expect(last?.state.kind).toBe('unlocked'))
    await act(async () => {
      await last!.logout()
    })
    expect(authMock.logout).toHaveBeenCalled()
    expect(last!.state.kind).toBe('locked')
  })
})

describe('useAuth — visibility re-poll (auto-lock recovery)', () => {
  it('re-polls status on visibilitychange=visible', async () => {
    authMock.status.mockResolvedValueOnce(
      ok({ locked: false, userId: 'abc', timeoutMs: 900000, msUntilLock: 900000 }),
    )
    let last = null as ReturnType<typeof useAuth> | null
    render(<Probe onRender={(a) => (last = a)} />)
    await waitFor(() => expect(last?.state.kind).toBe('unlocked'))
    expect(authMock.status).toHaveBeenCalledTimes(1)

    // Simulate auto-lock happening in main between visibilities.
    authMock.status.mockResolvedValueOnce(
      ok({ locked: true, userId: null, timeoutMs: 900000, msUntilLock: 900000 }),
    )
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(last?.state.kind).toBe('locked'))
    expect(authMock.status).toHaveBeenCalledTimes(2)
  })
})
