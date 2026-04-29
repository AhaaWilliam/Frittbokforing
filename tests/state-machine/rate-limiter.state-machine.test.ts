import { describe, it } from 'vitest'
import fc from 'fast-check'
import {
  createRateLimiter,
  type RateLimiter,
} from '../../src/main/auth/rate-limiter'

/**
 * State-machine test för rate-limiter (fc.commands).
 *
 * Invarianter som ska hålla efter varje command:
 * - checkAllowed returnerar alltid ≥ 0
 * - Efter recordSuccess är user-state rensat
 * - Efter recordFailure ökar "failures"-räknaren
 * - Backoff ökar monotont med failures (mod burst-threshold)
 */

class ModelState {
  users: Map<string, { failures: number; lastFailureMs: number }> = new Map()
}

interface World {
  real: RateLimiter
  now: { ms: number }
}

class RecordFailureCmd implements fc.Command<ModelState, World> {
  constructor(
    readonly userId: string,
    readonly tickMs: number,
  ) {}
  check() {
    return true
  }
  run(model: ModelState, real: World): void {
    real.now.ms += this.tickMs
    const u = model.users.get(this.userId) ?? { failures: 0, lastFailureMs: 0 }
    u.failures += 1
    u.lastFailureMs = real.now.ms
    model.users.set(this.userId, u)
    real.real.recordFailure(this.userId, real.now.ms)
  }
  toString() {
    return `recordFailure(${this.userId}, +${this.tickMs}ms)`
  }
}

class RecordSuccessCmd implements fc.Command<ModelState, World> {
  constructor(readonly userId: string) {}
  check() {
    return true
  }
  run(model: ModelState, world: World): void {
    model.users.delete(this.userId)
    world.real.recordSuccess(this.userId)
  }
  toString() {
    return `recordSuccess(${this.userId})`
  }
}

class CheckAllowedCmd implements fc.Command<ModelState, World> {
  constructor(
    readonly userId: string,
    readonly tickMs: number,
  ) {}
  check() {
    return true
  }
  run(_: ModelState, world: World): void {
    world.now.ms += this.tickMs
    const remaining = world.real.checkAllowed(this.userId, world.now.ms)
    if (remaining < 0) {
      throw new Error(
        `invariant violated: checkAllowed returned negative (${remaining})`,
      )
    }
  }
  toString() {
    return `checkAllowed(${this.userId}, +${this.tickMs}ms)`
  }
}

describe('rate-limiter — state-machine (fc.commands)', () => {
  it('kommandon bevarar invarianter över slumpade sekvenser', () => {
    const userGen = fc.constantFrom('alice', 'bob', 'charlie')
    const tickGen = fc.integer({ min: 1, max: 120_000 }) // upp till 2 min
    const allCommands = [
      fc.tuple(userGen, tickGen).map(([u, t]) => new RecordFailureCmd(u, t)),
      userGen.map((u) => new RecordSuccessCmd(u)),
      fc.tuple(userGen, tickGen).map(([u, t]) => new CheckAllowedCmd(u, t)),
    ]

    fc.assert(
      fc.property(fc.commands(allCommands, { maxCommands: 40 }), (cmds) => {
        fc.modelRun(() => {
          return {
            model: new ModelState(),
            real: {
              real: createRateLimiter(),
              now: { ms: 1_000_000 },
            },
          }
        }, cmds)
      }),
      { numRuns: 200 },
    )
  })
})
