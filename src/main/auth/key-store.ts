// Key store — singleton that holds the unlocked DB master key in memory
// together with auto-lock state (ADR 004 §7).
//
// Lifecycle:
//   locked → (login with correct secret via auth-service) → unlocked
//   unlocked → (inactivity > timeout OR explicit lock) → locked (K zeroed)
//
// Contract:
// - Only main process holds this. Renderer sees only {locked, userId?}.
// - The key is NEVER exposed over IPC.
// - `touch()` is called on every IPC call to reset the inactivity timer.
// - `onLock` listeners fire when the store transitions to locked — db.ts
//   should close its handle in response.

export interface KeyStore {
  isLocked(): boolean
  getKey(): Buffer
  getUserId(): string | null
  /** Unlock with a userId + master key. Starts the auto-lock timer. */
  unlock(userId: string, masterKey: Buffer): void
  /** Explicitly lock. Zeros the stored key and notifies listeners. */
  lock(): void
  /** Reset the inactivity timer. Called per-IPC. No-op when locked. */
  touch(): void
  /** Current auto-lock timeout in ms. */
  getTimeoutMs(): number
  /** Change the inactivity timeout. Applies on next touch. */
  setTimeoutMs(ms: number): void
  /** Milliseconds until auto-lock fires, or null when locked. Never negative. */
  msUntilLock(): number | null
  /** Register a listener for lock transitions. Returns an unsubscribe fn. */
  onLock(listener: () => void): () => void
}

export interface KeyStoreOptions {
  /** Inactivity timeout in milliseconds. Default: 15 minutes. */
  timeoutMs?: number
  /** Injected scheduler — for tests. Defaults to setTimeout/clearTimeout. */
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000

export function createKeyStore(opts: KeyStoreOptions = {}): KeyStore {
  const setTimer =
    opts.setTimer ??
    ((fn, ms) => setTimeout(fn, ms) as unknown as NodeJS.Timeout)
  const clearTimer =
    opts.clearTimer ?? ((h) => clearTimeout(h as NodeJS.Timeout))

  let timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let key: Buffer | null = null
  let userId: string | null = null
  let timerHandle: unknown = null
  let armedAt: number | null = null
  const listeners = new Set<() => void>()

  function armTimer(): void {
    if (timerHandle !== null) clearTimer(timerHandle)
    armedAt = Date.now()
    timerHandle = setTimer(() => {
      lockInternal()
    }, timeoutMs)
  }

  function lockInternal(): void {
    if (key) {
      key.fill(0)
      key = null
    }
    userId = null
    armedAt = null
    if (timerHandle !== null) {
      clearTimer(timerHandle)
      timerHandle = null
    }
    // Fire listeners synchronously. Failures in one listener must not block others.
    for (const l of listeners) {
      try {
        l()
      } catch {
        // swallow — lock must always complete
      }
    }
  }

  return {
    isLocked() {
      return key === null
    },
    getKey() {
      if (!key) throw new Error('key store is locked')
      return key
    },
    getUserId() {
      return userId
    },
    unlock(newUserId, masterKey) {
      if (masterKey.length !== 32) {
        throw new Error('masterKey must be 32 bytes')
      }
      if (key) key.fill(0)
      key = Buffer.from(masterKey) // copy — caller may wipe theirs
      userId = newUserId
      armTimer()
    },
    lock() {
      lockInternal()
    },
    touch() {
      if (key === null) return
      armTimer()
    },
    getTimeoutMs() {
      return timeoutMs
    },
    setTimeoutMs(ms) {
      if (ms <= 0) throw new Error('timeoutMs must be > 0')
      timeoutMs = ms
      if (key !== null) armTimer()
    },
    msUntilLock() {
      if (key === null || armedAt === null) return null
      const elapsed = Date.now() - armedAt
      const remaining = timeoutMs - elapsed
      return remaining > 0 ? remaining : 0
    },
    onLock(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
