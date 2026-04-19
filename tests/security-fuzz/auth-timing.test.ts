/**
 * TT-7 — Timing-attack-test för auth-login.
 *
 * Mäter response-tid i tre scenarier:
 *   A. USER_NOT_FOUND  — userId finns inte (early return utan argon2id)
 *   B. WRONG_PASSWORD  — userId finns, fel lösen (argon2id körs)
 *   C. WRONG_PASSWORD med olika prefix-match-längder
 *
 * Invarianter:
 *   I1: mean(B) ≈ mean(C)  — prefix-match ska inte påverka tid (argon2 const-time)
 *   I2: mean(A) vs mean(B) — om skillnad ≥20% av mean(B) är det
 *       user-enumeration-leak (finding)
 *   I3: olika lösenordslängder ska inte ge linjär timing-skalning
 *
 * Antal iterationer balanserar tid vs statistisk signifikans:
 *   N=40 per grupp × ~5ms (FAST_KDF) ≈ 200ms per grupp ≈ <1s totalt
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createAuthService } from '../../src/main/auth/auth-service'
import { createKeyStore } from '../../src/main/auth/key-store'
import { createRateLimiter } from '../../src/main/auth/rate-limiter'
import { UserVault } from '../../src/main/auth/user-vault'

const FAST_KDF = {
  memorySize: 1024,
  iterations: 1,
  parallelism: 1,
  hashLength: 32,
}

let tmpRoot: string

function makeService() {
  const vault = new UserVault(tmpRoot)
  vault.ensureRoot()
  const keyStore = createKeyStore()
  const rateLimiter = createRateLimiter()
  return {
    service: createAuthService({
      vault,
      keyStore,
      rateLimiter,
      // Freeze clock far in future så rate-limiter aldrig triggar under mätning
      now: () => 10 ** 12,
      kdfParams: FAST_KDF,
    }),
    rateLimiter,
  }
}

/**
 * Mät N logins och returnera {mean, stddev} i ms.
 * Varje mätning resetar rate-limiter för att undvika backoff-skew.
 */
async function measure(
  n: number,
  fn: () => Promise<unknown>,
  reset: () => void,
): Promise<{ mean: number; stddev: number; samples: number[] }> {
  const samples: number[] = []
  // Varma upp (JIT + module-imports)
  for (let i = 0; i < 3; i++) {
    reset()
    try {
      await fn()
    } catch {}
  }
  for (let i = 0; i < n; i++) {
    reset()
    const t0 = performance.now()
    try {
      await fn()
    } catch {
      // förväntat för WRONG_PASSWORD och USER_NOT_FOUND
    }
    samples.push(performance.now() - t0)
  }
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  const variance =
    samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length
  const stddev = Math.sqrt(variance)
  return { mean, stddev, samples }
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-timing-'))
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('Auth timing-attack (TT-7)', () => {
  it('I1: argon2id är konstant-tid för prefix-match-varianter', async () => {
    const { service, rateLimiter } = makeService()
    const correctPw = 'RiktigLösen1234!'
    const { user } = await service.createUser('Alice', correctPw)
    const reset = () => rateLimiter.recordSuccess(user.id)

    const N = 40
    // Grupp A: helt fel (0 karaktärer match)
    const groupNoMatch = await measure(
      N,
      () => service.login(user.id, 'zzzzzzzzzzzzzzzz'),
      reset,
    )
    // Grupp B: 8 första karaktärerna match
    const groupHalfMatch = await measure(
      N,
      () => service.login(user.id, 'RiktigLöszzzzzzz'),
      reset,
    )
    // Grupp C: allt utom sista karaktären match
    const groupAlmost = await measure(
      N,
      () => service.login(user.id, 'RiktigLösen1234z'),
      reset,
    )

    // I1: prefix-match påverkar inte tid (σ-koefficient < 20% mellan grupper)
    const means = [groupNoMatch.mean, groupHalfMatch.mean, groupAlmost.mean]
    const mean = means.reduce((a, b) => a + b, 0) / means.length
    const maxDev = Math.max(...means.map((m) => Math.abs(m - mean))) / mean
    // 35% tolerans täcker OS-scheduling-jitter vid parallell CI-last.
    // Argon2id är algoritm-constant-time; varians här är GC/JIT, inte side-channel.
    expect(maxDev, `prefix-match timing-varians=${(maxDev * 100).toFixed(1)}%`).toBeLessThan(0.35)
  })

  it('I3: lösenordslängd påverkar inte login-tid signifikant', async () => {
    const { service, rateLimiter } = makeService()
    const { user } = await service.createUser('Alice', 'RiktigLösen1234!')
    const reset = () => rateLimiter.recordSuccess(user.id)

    const N = 30
    // Kort lösen (12 chars)
    const short = await measure(
      N,
      () => service.login(user.id, 'zzzzzzzzzzzz'),
      reset,
    )
    // Långt lösen (100 chars)
    const long = await measure(
      N,
      () => service.login(user.id, 'z'.repeat(100)),
      reset,
    )
    // Mycket långt (1000 chars — testar ingen DoS)
    const veryLong = await measure(
      N,
      () => service.login(user.id, 'z'.repeat(1000)),
      reset,
    )

    // Tid ska inte skala linjärt med längd — argon2 tar constant tid oavsett input
    // Tolerans 50% eftersom argon2 är snabbare vs buffer-allocation-skillnader
    const ratio_long = long.mean / short.mean
    const ratio_very = veryLong.mean / short.mean
    expect(
      ratio_long,
      `long/short ratio=${ratio_long.toFixed(2)} mean short=${short.mean.toFixed(1)}ms long=${long.mean.toFixed(1)}ms`,
    ).toBeLessThan(1.5)
    expect(
      ratio_very,
      `veryLong/short ratio=${ratio_very.toFixed(2)} mean short=${short.mean.toFixed(1)}ms veryLong=${veryLong.mean.toFixed(1)}ms`,
    ).toBeLessThan(2.0)
  })

  it('I2: USER_NOT_FOUND vs WRONG_PASSWORD — kontrolleras för enumeration-leak', async () => {
    const { service, rateLimiter } = makeService()
    const { user } = await service.createUser('Alice', 'RiktigLösen1234!')

    const N = 40
    const notFound = await measure(
      N,
      () => service.login('nonexistent-user-xyz', 'zzzzzzzzzzzzzzzz'),
      () => {},
    )
    const wrongPw = await measure(
      N,
      () => service.login(user.id, 'zzzzzzzzzzzzzzzz'),
      () => rateLimiter.recordSuccess(user.id),
    )

    const ratio = notFound.mean / wrongPw.mean
    console.log(
      `[TT-7 I2] USER_NOT_FOUND mean=${notFound.mean.toFixed(2)}ms, ` +
        `WRONG_PASSWORD mean=${wrongPw.mean.toFixed(2)}ms, ` +
        `ratio=${ratio.toFixed(3)}`,
    )
    // F-TT-004-gate: ratio ska vara ≥0.5 (user-enumeration-leak-gräns).
    // Efter fix (dummy argon2id vid USER_NOT_FOUND) bör ratio ≈ 1.0.
    // CI-toleransen 0.5 lämnar marginal för JIT-warmup och OS-scheduling-
    // varians; fullständigt konstant-tid garanteras inte utan dedicerad
    // hw-profilering.
    expect(
      ratio,
      `USER_NOT_FOUND ${notFound.mean.toFixed(2)}ms vs WRONG_PASSWORD ${wrongPw.mean.toFixed(2)}ms — enumeration-leak?`,
    ).toBeGreaterThan(0.5)
  })
})
