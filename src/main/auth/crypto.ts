// Cryptographic primitives for local authentication (ADR 004).
//
// Scope:
// - Argon2id KDF for password/recovery-key stretching (via hash-wasm, no native dep)
// - AES-256-GCM envelope encryption of the DB master key (via Node crypto)
// - DB master-key generation (32 bytes random)
//
// NON-goals:
// - DB open/close (db.ts)
// - Keys.json filesystem layout (user-vault.ts)
// - Recovery-key mnemonic encoding (recovery-key.ts)
//
// All functions here are pure given their inputs (Argon2id is deterministic
// per params+salt). No filesystem, no globals, no clock. Easy to test.

import crypto from 'node:crypto'
import { argon2id } from 'hash-wasm'

/** OWASP 2024 Argon2id defaults — see ADR 004. */
export const ARGON2ID_DEFAULTS = {
  memorySize: 65536, // 64 MiB in KiB
  iterations: 3,
  parallelism: 4,
  hashLength: 32, // bytes — matches AES-256 key size
} as const

export interface KdfParams {
  /** Memory cost in KiB. OWASP minimum: 19456 (19 MiB); our default: 65536 (64 MiB). */
  memorySize: number
  /** Time cost (iterations). */
  iterations: number
  /** Parallelism (lanes). */
  parallelism: number
  /** Output key length in bytes. Must match AES-key size downstream (32 for AES-256). */
  hashLength: number
}

/** Output of envelope encryption — what gets persisted in keys.json. */
export interface Envelope {
  /** Base64-encoded 16-byte salt used for KDF. */
  salt: string
  /** Base64-encoded 12-byte IV used for AES-GCM. */
  iv: string
  /** Base64-encoded ciphertext + 16-byte auth tag concatenated. */
  ciphertext: string
  /** KDF params used — persisted so future parameter upgrades are backward-compatible. */
  kdf: KdfParams
}

const SALT_BYTES = 16
const IV_BYTES = 12
const GCM_TAG_BYTES = 16
const MASTER_KEY_BYTES = 32

/**
 * Derive a 32-byte key from a secret (password or recovery-key) using Argon2id.
 * The secret is passed as Buffer so the caller can wipe it after use.
 */
export async function deriveKey(
  secret: Buffer,
  salt: Buffer,
  params: KdfParams = ARGON2ID_DEFAULTS,
): Promise<Buffer> {
  if (salt.length !== SALT_BYTES) {
    throw new Error(`salt must be ${SALT_BYTES} bytes, got ${salt.length}`)
  }
  const hex = await argon2id({
    password: secret,
    salt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memorySize,
    hashLength: params.hashLength,
    outputType: 'hex',
  })
  return Buffer.from(hex, 'hex')
}

/** Generate a fresh 32-byte DB master key K. */
export function generateMasterKey(): Buffer {
  return crypto.randomBytes(MASTER_KEY_BYTES)
}

/**
 * Seal the master key K with a secret. The secret is stretched via Argon2id
 * using a fresh random salt, then used as AES-256-GCM key to encrypt K
 * with a fresh random IV. Returns an Envelope that can be persisted as JSON.
 */
export async function sealMasterKey(
  masterKey: Buffer,
  secret: Buffer,
  params: KdfParams = ARGON2ID_DEFAULTS,
): Promise<Envelope> {
  if (masterKey.length !== MASTER_KEY_BYTES) {
    throw new Error(`masterKey must be ${MASTER_KEY_BYTES} bytes`)
  }
  const salt = crypto.randomBytes(SALT_BYTES)
  const iv = crypto.randomBytes(IV_BYTES)
  const derived = await deriveKey(secret, salt, params)
  const cipher = crypto.createCipheriv('aes-256-gcm', derived, iv)
  const enc = Buffer.concat([cipher.update(masterKey), cipher.final()])
  const tag = cipher.getAuthTag()
  derived.fill(0)
  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ciphertext: Buffer.concat([enc, tag]).toString('base64'),
    kdf: params,
  }
}

/**
 * Open a sealed envelope with the given secret. Returns the recovered master
 * key, or throws if the secret is wrong (auth-tag verification fails).
 * Caller must wipe the returned buffer when done.
 */
export async function openEnvelope(
  envelope: Envelope,
  secret: Buffer,
): Promise<Buffer> {
  const salt = Buffer.from(envelope.salt, 'base64')
  const iv = Buffer.from(envelope.iv, 'base64')
  const blob = Buffer.from(envelope.ciphertext, 'base64')
  if (blob.length < GCM_TAG_BYTES + 1) {
    throw new Error('envelope ciphertext malformed')
  }
  const enc = blob.subarray(0, blob.length - GCM_TAG_BYTES)
  const tag = blob.subarray(blob.length - GCM_TAG_BYTES)
  const derived = await deriveKey(secret, salt, envelope.kdf)
  const decipher = crypto.createDecipheriv('aes-256-gcm', derived, iv)
  decipher.setAuthTag(tag)
  try {
    const plain = Buffer.concat([decipher.update(enc), decipher.final()])
    return plain
  } finally {
    derived.fill(0)
  }
}

/**
 * Constant-time comparison for equal-length buffers. Use when comparing
 * derived keys or master-key material to avoid timing side-channels.
 */
export function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
