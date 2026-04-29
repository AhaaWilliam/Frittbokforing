import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import {
  ARGON2ID_DEFAULTS,
  deriveKey,
  generateMasterKey,
  sealMasterKey,
  openEnvelope,
  constantTimeEqual,
  type Envelope,
} from '../../src/main/auth/crypto'

// Speed up tests — production uses ARGON2ID_DEFAULTS (64 MiB, t=3, p=4 ≈ 200ms).
// Tests use a small set to keep the suite under ~1s total.
const FAST_KDF = {
  memorySize: 1024,
  iterations: 1,
  parallelism: 1,
  hashLength: 32,
} as const

describe('crypto — Argon2id KDF', () => {
  it('derives a 32-byte key', async () => {
    const key = await deriveKey(
      Buffer.from('hemligt'),
      crypto.randomBytes(16),
      FAST_KDF,
    )
    expect(key.length).toBe(32)
  })

  it('is deterministic for same inputs', async () => {
    const salt = crypto.randomBytes(16)
    const a = await deriveKey(Buffer.from('pw'), salt, FAST_KDF)
    const b = await deriveKey(Buffer.from('pw'), salt, FAST_KDF)
    expect(a.equals(b)).toBe(true)
  })

  it('changes output when salt differs', async () => {
    const a = await deriveKey(
      Buffer.from('pw'),
      crypto.randomBytes(16),
      FAST_KDF,
    )
    const b = await deriveKey(
      Buffer.from('pw'),
      crypto.randomBytes(16),
      FAST_KDF,
    )
    expect(a.equals(b)).toBe(false)
  })

  it('changes output when secret differs', async () => {
    const salt = crypto.randomBytes(16)
    const a = await deriveKey(Buffer.from('pw-a'), salt, FAST_KDF)
    const b = await deriveKey(Buffer.from('pw-b'), salt, FAST_KDF)
    expect(a.equals(b)).toBe(false)
  })

  it('rejects salt of wrong length', async () => {
    await expect(
      deriveKey(Buffer.from('pw'), Buffer.alloc(8), FAST_KDF),
    ).rejects.toThrow(/salt must be 16 bytes/)
  })
})

describe('crypto — master key generation', () => {
  it('returns 32 random bytes', () => {
    const k = generateMasterKey()
    expect(k.length).toBe(32)
  })

  it('is different every call (astronomically)', () => {
    const a = generateMasterKey()
    const b = generateMasterKey()
    expect(a.equals(b)).toBe(false)
  })
})

describe('crypto — envelope sealing and opening', () => {
  it('roundtrips: seal with password, open with same password', async () => {
    const K = generateMasterKey()
    const pw = Buffer.from('correct-horse-battery-staple')
    const env = await sealMasterKey(K, pw, FAST_KDF)
    const recovered = await openEnvelope(env, pw)
    expect(recovered.equals(K)).toBe(true)
  })

  it('rejects wrong password with auth-tag error', async () => {
    const K = generateMasterKey()
    const env = await sealMasterKey(K, Buffer.from('right'), FAST_KDF)
    await expect(openEnvelope(env, Buffer.from('wrong'))).rejects.toThrow()
  })

  it('produces different envelopes for same (K, password) each call (salt+iv random)', async () => {
    const K = generateMasterKey()
    const pw = Buffer.from('pw')
    const a = await sealMasterKey(K, pw, FAST_KDF)
    const b = await sealMasterKey(K, pw, FAST_KDF)
    expect(a.salt).not.toBe(b.salt)
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
    // But both open to the same K.
    const ra = await openEnvelope(a, pw)
    const rb = await openEnvelope(b, pw)
    expect(ra.equals(K)).toBe(true)
    expect(rb.equals(K)).toBe(true)
  })

  it('detects tampering of ciphertext', async () => {
    const K = generateMasterKey()
    const pw = Buffer.from('pw')
    const env = await sealMasterKey(K, pw, FAST_KDF)
    const blob = Buffer.from(env.ciphertext, 'base64')
    blob[0] ^= 0xff // flip one bit
    const tampered: Envelope = {
      ...env,
      ciphertext: blob.toString('base64'),
    }
    await expect(openEnvelope(tampered, pw)).rejects.toThrow()
  })

  it('detects tampering of auth tag', async () => {
    const K = generateMasterKey()
    const pw = Buffer.from('pw')
    const env = await sealMasterKey(K, pw, FAST_KDF)
    const blob = Buffer.from(env.ciphertext, 'base64')
    blob[blob.length - 1] ^= 0xff // flip last byte of tag
    const tampered: Envelope = {
      ...env,
      ciphertext: blob.toString('base64'),
    }
    await expect(openEnvelope(tampered, pw)).rejects.toThrow()
  })

  it('detects tampering of salt (wrong KDF output → wrong key → auth-tag fails)', async () => {
    const K = generateMasterKey()
    const pw = Buffer.from('pw')
    const env = await sealMasterKey(K, pw, FAST_KDF)
    const badSalt = crypto.randomBytes(16).toString('base64')
    await expect(openEnvelope({ ...env, salt: badSalt }, pw)).rejects.toThrow()
  })

  it('rejects malformed ciphertext (too short)', async () => {
    const env: Envelope = {
      salt: crypto.randomBytes(16).toString('base64'),
      iv: crypto.randomBytes(12).toString('base64'),
      ciphertext: Buffer.alloc(4).toString('base64'),
      kdf: FAST_KDF,
    }
    await expect(openEnvelope(env, Buffer.from('x'))).rejects.toThrow(
      /malformed/,
    )
  })

  it('supports two envelopes sealing the same K (password + recovery-key pattern)', async () => {
    const K = generateMasterKey()
    const pw = Buffer.from('my-password')
    const rk = Buffer.from(
      'abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual adapt add',
    )
    const pwEnv = await sealMasterKey(K, pw, FAST_KDF)
    const rkEnv = await sealMasterKey(K, rk, FAST_KDF)
    // Both unlock the same K.
    expect((await openEnvelope(pwEnv, pw)).equals(K)).toBe(true)
    expect((await openEnvelope(rkEnv, rk)).equals(K)).toBe(true)
    // Cross-key does NOT unlock.
    await expect(openEnvelope(pwEnv, rk)).rejects.toThrow()
    await expect(openEnvelope(rkEnv, pw)).rejects.toThrow()
  })

  it('persists KDF params in envelope for forward-compat', async () => {
    const K = generateMasterKey()
    const env = await sealMasterKey(K, Buffer.from('pw'), FAST_KDF)
    expect(env.kdf).toEqual(FAST_KDF)
  })

  it('uses OWASP-recommended defaults when not specified', () => {
    expect(ARGON2ID_DEFAULTS.memorySize).toBe(65536) // 64 MiB
    expect(ARGON2ID_DEFAULTS.iterations).toBe(3)
    expect(ARGON2ID_DEFAULTS.parallelism).toBe(4)
    expect(ARGON2ID_DEFAULTS.hashLength).toBe(32)
  })
})

describe('crypto — constant-time comparison', () => {
  it('returns true for equal buffers', () => {
    const a = Buffer.from([1, 2, 3, 4])
    const b = Buffer.from([1, 2, 3, 4])
    expect(constantTimeEqual(a, b)).toBe(true)
  })

  it('returns false for differing buffers of same length', () => {
    const a = Buffer.from([1, 2, 3, 4])
    const b = Buffer.from([1, 2, 3, 5])
    expect(constantTimeEqual(a, b)).toBe(false)
  })

  it('returns false for different-length buffers without throwing', () => {
    const a = Buffer.from([1, 2, 3])
    const b = Buffer.from([1, 2, 3, 4])
    expect(constantTimeEqual(a, b)).toBe(false)
  })
})
