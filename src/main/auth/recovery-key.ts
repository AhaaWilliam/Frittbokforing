// Recovery-key: BIP-39 24-word mnemonic (256 bits entropy) via @scure/bip39.
//
// Användaren får en recovery-key en gång vid user-creation. Den lagras aldrig
// av oss. Om lösenordet glöms kan recovery-key användas för att låsa upp
// DB-master-nyckeln K (via `recoveryBlob` i keys.json — se ADR 004 §2).

import { generateMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

const ENTROPY_BITS = 256
const EXPECTED_WORD_COUNT = 24

/** Generate a fresh 24-word recovery phrase (256 bits of entropy). */
export function generateRecoveryKey(): string {
  return generateMnemonic(wordlist, ENTROPY_BITS)
}

/**
 * Validate a user-entered recovery phrase. Returns the normalized phrase
 * (lowercase, single-space-separated) if valid, or null if invalid.
 *
 * Handles common transcription errors: extra whitespace, mixed case, leading/
 * trailing whitespace. Rejects: wrong word count, words not in BIP-39
 * wordlist, or phrases that fail BIP-39 checksum validation.
 */
export function normalizeAndValidate(input: string): string | null {
  const normalized = input.trim().toLowerCase().split(/\s+/).join(' ')
  const words = normalized.split(' ')
  if (words.length !== EXPECTED_WORD_COUNT) return null
  if (!validateMnemonic(normalized, wordlist)) return null
  return normalized
}

/**
 * Convert a validated recovery phrase to its raw 32-byte entropy.
 * This entropy is used as the "secret" input to crypto.deriveKey — treating
 * the recovery key as high-entropy password material.
 *
 * Throws if the phrase is invalid. Callers should validate first via
 * normalizeAndValidate.
 */
export function recoveryKeyToSecret(phrase: string): Buffer {
  const entropy = mnemonicToEntropy(phrase, wordlist)
  return Buffer.from(entropy)
}

export const RECOVERY_KEY_WORD_COUNT = EXPECTED_WORD_COUNT
