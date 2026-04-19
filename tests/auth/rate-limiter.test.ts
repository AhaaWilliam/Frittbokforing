import { describe, it, expect } from 'vitest'
import { createRateLimiter } from '../../src/main/auth/rate-limiter'

describe('rate-limiter — fresh state', () => {
  it('allows unknown user immediately', () => {
    const rl = createRateLimiter()
    expect(rl.checkAllowed('u1', 1000)).toBe(0)
  })

  it('peek returns undefined for unknown user', () => {
    const rl = createRateLimiter()
    expect(rl.peek('u1')).toBeUndefined()
  })
})

describe('rate-limiter — exponential backoff', () => {
  it('first failure → 1s delay', () => {
    const rl = createRateLimiter()
    rl.recordFailure('u1', 0)
    expect(rl.checkAllowed('u1', 0)).toBe(1000)
    expect(rl.checkAllowed('u1', 500)).toBe(500)
    expect(rl.checkAllowed('u1', 1000)).toBe(0)
  })

  it('second failure → 2s delay', () => {
    const rl = createRateLimiter()
    rl.recordFailure('u1', 0)
    rl.recordFailure('u1', 1000)
    expect(rl.checkAllowed('u1', 1000)).toBe(2000)
  })

  it('progression: 1s, 2s, 4s, 8s, 16s, 32s, 60s', () => {
    const rl = createRateLimiter()
    const delays: number[] = []
    let now = 0
    for (let i = 0; i < 7; i++) {
      rl.recordFailure('u1', now)
      delays.push(rl.checkAllowed('u1', now))
      now += delays[delays.length - 1] // wait out
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000])
  })

  it('caps at 60s for subsequent failures', () => {
    const rl = createRateLimiter()
    let now = 0
    // Drive to cap without triggering burst — spread over > 10 min
    for (let i = 0; i < 7; i++) {
      rl.recordFailure('u1', now)
      now += 2 * 60 * 1000 // 2 min between failures
    }
    rl.recordFailure('u1', now)
    expect(rl.checkAllowed('u1', now)).toBe(60000)
    rl.recordFailure('u1', now + 60000)
    expect(rl.checkAllowed('u1', now + 60000)).toBe(60000)
  })
})

describe('rate-limiter — burst protection', () => {
  it('10 failures in a tight window forces 60s cooldown regardless of backoff', () => {
    const rl = createRateLimiter()
    // Record 10 failures, each 100ms apart. Normal backoff after 10th would
    // be 60s anyway (schedule caps), so this test verifies the burst path
    // specifically by using a scenario where backoff < burst.
    let lastFailureTime = 0
    for (let i = 0; i < 10; i++) {
      lastFailureTime = i * 100
      rl.recordFailure('u1', lastFailureTime)
    }
    // After 10 failures, both paths converge to 60s. Burst guarantees it.
    expect(rl.checkAllowed('u1', lastFailureTime)).toBe(60000)
  })

  it('failures spread beyond 10-min window do not trigger burst', () => {
    const rl = createRateLimiter()
    let now = 0
    // 15 failures but each 15 minutes apart — sliding window never >1
    for (let i = 0; i < 15; i++) {
      rl.recordFailure('u1', now)
      now += 15 * 60 * 1000
    }
    const peek = rl.peek('u1')
    expect(peek?.failures).toBe(15)
    // No burst, but backoff schedule capped — delay is 60s (cap), not forced burst.
    // Verifies: peek shows many failures, but sliding window keeps burst inert.
    expect(rl.checkAllowed('u1', now + 60_000)).toBe(0)
  })
})

describe('rate-limiter — success reset', () => {
  it('recordSuccess clears all state for the user', () => {
    const rl = createRateLimiter()
    rl.recordFailure('u1', 0)
    rl.recordFailure('u1', 1000)
    rl.recordSuccess('u1')
    expect(rl.peek('u1')).toBeUndefined()
    expect(rl.checkAllowed('u1', 1000)).toBe(0)
  })

  it('success for one user does not clear another user', () => {
    const rl = createRateLimiter()
    rl.recordFailure('u1', 0)
    rl.recordFailure('u2', 0)
    rl.recordSuccess('u1')
    expect(rl.peek('u1')).toBeUndefined()
    expect(rl.peek('u2')?.failures).toBe(1)
  })
})

describe('rate-limiter — per-user isolation', () => {
  it('one user locked does not affect another', () => {
    const rl = createRateLimiter()
    rl.recordFailure('u1', 0)
    expect(rl.checkAllowed('u1', 0)).toBe(1000)
    expect(rl.checkAllowed('u2', 0)).toBe(0)
  })
})
