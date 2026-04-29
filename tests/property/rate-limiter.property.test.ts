import { describe, it } from 'vitest'
import fc from 'fast-check'
import { createRateLimiter } from '../../src/main/auth/rate-limiter'

/**
 * Property-based tester för rate-limiter (auth).
 * Schedule: 0, 1s, 2s, 4s, 8s, 16s, 32s, 60s (cap).
 * Burst: 10 fails / 10min → 60s cooldown.
 */

const userIdGen = fc.string({ minLength: 1, maxLength: 20 })
const nowMsGen = fc.integer({ min: 0, max: 2 ** 40 })

describe('rate-limiter — property invarianter', () => {
  it('initial state: checkAllowed returnerar 0 för okänd user', () => {
    fc.assert(
      fc.property(userIdGen, nowMsGen, (u, t) => {
        const rl = createRateLimiter()
        return rl.checkAllowed(u, t) === 0
      }),
      { numRuns: 500 },
    )
  })

  it('recordSuccess → checkAllowed === 0 (resets oavsett historik)', () => {
    fc.assert(
      fc.property(
        userIdGen,
        fc.integer({ min: 1, max: 20 }),
        nowMsGen,
        (u, fails, t) => {
          const rl = createRateLimiter()
          for (let i = 0; i < fails; i++) rl.recordFailure(u, t + i * 100)
          rl.recordSuccess(u)
          return rl.checkAllowed(u, t + fails * 100 + 100) === 0
        },
      ),
      { numRuns: 300 },
    )
  })

  it('checkAllowed returnerar alltid ≥ 0', () => {
    fc.assert(
      fc.property(
        userIdGen,
        fc.integer({ min: 0, max: 15 }),
        nowMsGen,
        (u, fails, t) => {
          const rl = createRateLimiter()
          for (let i = 0; i < fails; i++) rl.recordFailure(u, t + i * 100)
          const r = rl.checkAllowed(u, t + fails * 100 + 1)
          return r >= 0
        },
      ),
      { numRuns: 500 },
    )
  })

  it('efter N failures, delay följer backoff-schema (N ≤ 7)', () => {
    const schedule = [0, 1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000]
    fc.assert(
      fc.property(userIdGen, fc.integer({ min: 1, max: 7 }), (u, n) => {
        const rl = createRateLimiter()
        const start = 1_000_000
        // Record N failures close together
        for (let i = 0; i < n; i++) rl.recordFailure(u, start + i)
        const remaining = rl.checkAllowed(u, start + n) // i.e. 1ns later
        const expected = schedule[Math.min(n, schedule.length - 1)]
        // Allow off-by-few ms due to internal nowMs used for computation
        return remaining >= expected - n && remaining <= expected
      }),
      { numRuns: 300 },
    )
  })

  it('olika users isolerade — success på A påverkar inte B', () => {
    fc.assert(
      fc.property(
        userIdGen,
        userIdGen,
        fc.integer({ min: 1, max: 5 }),
        nowMsGen,
        (a, b, n, t) => {
          fc.pre(a !== b)
          const rl = createRateLimiter()
          for (let i = 0; i < n; i++) rl.recordFailure(a, t + i * 100)
          rl.recordSuccess(a)
          return rl.checkAllowed(b, t + n * 100 + 1) === 0 // b orört
        },
      ),
      { numRuns: 300 },
    )
  })

  it('checkAllowed är idempotent — flera anrop utan tid-ändring ger samma värde', () => {
    fc.assert(
      fc.property(
        userIdGen,
        fc.integer({ min: 0, max: 8 }),
        nowMsGen,
        (u, n, t) => {
          const rl = createRateLimiter()
          for (let i = 0; i < n; i++) rl.recordFailure(u, t + i * 100)
          const after = t + n * 100 + 1000
          return rl.checkAllowed(u, after) === rl.checkAllowed(u, after)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('burst-threshold: 10 fails inom 10min → ≥60s cooldown', () => {
    fc.assert(
      fc.property(nowMsGen, (t) => {
        const rl = createRateLimiter()
        // 10 failures inom 1 sekund — definitivt inom 10min-fönstret
        for (let i = 0; i < 10; i++) rl.recordFailure('u', t + i)
        const remaining = rl.checkAllowed('u', t + 11)
        // Efter 10 fails: backoff = 60s, burst = 60s → max(60s, 60s) = 60s
        return remaining >= 60_000 - 11
      }),
      { numRuns: 100 },
    )
  })
})
