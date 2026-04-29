// Per-user exponential-backoff rate limiter for failed login attempts.
//
// In-memory only — intentional. Persisted lockout state could itself be a
// DoS vector (corrupt file → user locked out). Restart resets the counter,
// which is acceptable: full app restart requires filesystem access the
// attacker already has.
//
// Delay schedule: 0s, 1s, 2s, 4s, 8s, 16s, 32s, 60s (cap).
// After 10 failed attempts within a 10-minute rolling window, enforce a
// forced 60s cooldown regardless of backoff schedule.

export interface RateLimiter {
  /** Returns 0 if allowed, otherwise ms remaining until next attempt. */
  checkAllowed(userId: string, nowMs: number): number
  /** Call after a failed attempt. */
  recordFailure(userId: string, nowMs: number): void
  /** Call after a successful attempt — resets state for this user. */
  recordSuccess(userId: string): void
  /** For tests — inspect current state without mutation. */
  peek(userId: string): { failures: number; nextAllowedMs: number } | undefined
}

interface State {
  failures: number
  nextAllowedMs: number
  recentFailureTimestamps: number[] // for sliding-window count
}

const BACKOFF_SCHEDULE_MS = [
  0, 1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000,
] as const
const BURST_THRESHOLD = 10
const BURST_WINDOW_MS = 10 * 60 * 1000 // 10 min
const BURST_COOLDOWN_MS = 60_000

export function createRateLimiter(): RateLimiter {
  const states = new Map<string, State>()

  function getState(userId: string): State {
    let s = states.get(userId)
    if (!s) {
      s = { failures: 0, nextAllowedMs: 0, recentFailureTimestamps: [] }
      states.set(userId, s)
    }
    return s
  }

  return {
    checkAllowed(userId, nowMs) {
      const s = states.get(userId)
      if (!s) return 0
      const remaining = s.nextAllowedMs - nowMs
      return remaining > 0 ? remaining : 0
    },

    recordFailure(userId, nowMs) {
      const s = getState(userId)
      s.failures += 1

      // Trim timestamps outside sliding window, then push current.
      s.recentFailureTimestamps = s.recentFailureTimestamps.filter(
        (t) => nowMs - t < BURST_WINDOW_MS,
      )
      s.recentFailureTimestamps.push(nowMs)

      // Normal backoff: clamp index to last slot.
      const idx = Math.min(s.failures, BACKOFF_SCHEDULE_MS.length - 1)
      const backoffDelay = BACKOFF_SCHEDULE_MS[idx]

      // Burst cooldown if threshold exceeded.
      const burstDelay =
        s.recentFailureTimestamps.length >= BURST_THRESHOLD
          ? BURST_COOLDOWN_MS
          : 0

      s.nextAllowedMs = nowMs + Math.max(backoffDelay, burstDelay)
    },

    recordSuccess(userId) {
      states.delete(userId)
    },

    peek(userId) {
      const s = states.get(userId)
      if (!s) return undefined
      return { failures: s.failures, nextAllowedMs: s.nextAllowedMs }
    },
  }
}
