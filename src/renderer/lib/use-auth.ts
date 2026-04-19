import { useCallback, useEffect, useState } from 'react'
import type { AuthStatus, UserMeta } from '../electron'

type State =
  | { kind: 'loading' }
  | { kind: 'locked' }
  | { kind: 'unlocked'; userId: string }
  | { kind: 'error'; message: string }

interface UseAuth {
  state: State
  /** Called by LockScreen after a successful login/create. */
  onUnlocked: (user: UserMeta) => void
  /** Lock the session (wraps window.auth.logout). */
  logout: () => Promise<void>
  /** Re-poll the backend for status (used by the sentinel touch-loop). */
  refresh: () => Promise<void>
}

/**
 * Tracks the renderer's view of auth state.
 *
 * - On mount: queries `auth.status()` once.
 * - On LockScreen unlock: transitions to 'unlocked' immediately (optimistic)
 *   so the UI swaps without waiting for another IPC roundtrip.
 * - On visibility change / window focus: re-polls. Covers auto-lock (if the
 *   user has been away and the 15-min timer fired, the renderer returns to
 *   LockScreen on the next focus event).
 */
export function useAuth(): UseAuth {
  const [state, setState] = useState<State>({ kind: 'loading' })

  const refresh = useCallback(async () => {
    const res = await window.auth.status()
    if (!res.success) {
      setState({ kind: 'error', message: res.error })
      return
    }
    setState(fromStatus(res.data))
  }, [])

  useEffect(() => {
    let cancelled = false
    window.auth.status().then((res) => {
      if (cancelled) return
      if (res.success) {
        setState(fromStatus(res.data))
      } else {
        setState({ kind: 'error', message: res.error })
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisibility)
    }
  }, [refresh])

  const onUnlocked = useCallback((user: UserMeta) => {
    setState({ kind: 'unlocked', userId: user.id })
  }, [])

  const logout = useCallback(async () => {
    await window.auth.logout()
    setState({ kind: 'locked' })
  }, [])

  return { state, onUnlocked, logout, refresh }
}

function fromStatus(s: AuthStatus): State {
  if (s.locked || !s.userId) return { kind: 'locked' }
  return { kind: 'unlocked', userId: s.userId }
}
