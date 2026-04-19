import { describe, it, expect } from 'vitest'
import {
  generateRecoveryKey,
  normalizeAndValidate,
  recoveryKeyToSecret,
  RECOVERY_KEY_WORD_COUNT,
} from '../../src/main/auth/recovery-key'

describe('recovery-key — generation', () => {
  it('produces a 24-word phrase', () => {
    const phrase = generateRecoveryKey()
    expect(phrase.split(' ')).toHaveLength(RECOVERY_KEY_WORD_COUNT)
  })

  it('produces a different phrase each call', () => {
    const a = generateRecoveryKey()
    const b = generateRecoveryKey()
    expect(a).not.toBe(b)
  })

  it('generated phrase passes validation', () => {
    const phrase = generateRecoveryKey()
    expect(normalizeAndValidate(phrase)).toBe(phrase)
  })

  it('generated phrase produces 32-byte entropy', () => {
    const phrase = generateRecoveryKey()
    const secret = recoveryKeyToSecret(phrase)
    expect(secret.length).toBe(32)
  })
})

describe('recovery-key — normalization', () => {
  it('accepts canonical lowercase single-space format', () => {
    const phrase = generateRecoveryKey()
    expect(normalizeAndValidate(phrase)).toBe(phrase)
  })

  it('normalizes mixed case', () => {
    const phrase = generateRecoveryKey()
    const upper = phrase.toUpperCase()
    expect(normalizeAndValidate(upper)).toBe(phrase)
  })

  it('normalizes extra internal whitespace', () => {
    const phrase = generateRecoveryKey()
    const messy = phrase.split(' ').join('   ')
    expect(normalizeAndValidate(messy)).toBe(phrase)
  })

  it('normalizes leading/trailing whitespace', () => {
    const phrase = generateRecoveryKey()
    expect(normalizeAndValidate('  ' + phrase + '\n')).toBe(phrase)
  })

  it('normalizes tabs and newlines between words', () => {
    const phrase = generateRecoveryKey()
    const mixed = phrase.split(' ').join('\t\n ')
    expect(normalizeAndValidate(mixed)).toBe(phrase)
  })
})

describe('recovery-key — validation rejection', () => {
  it('rejects phrase with wrong word count (too few)', () => {
    expect(normalizeAndValidate('abandon ability able about')).toBeNull()
  })

  it('rejects phrase with wrong word count (too many)', () => {
    const phrase = generateRecoveryKey()
    expect(normalizeAndValidate(phrase + ' abandon')).toBeNull()
  })

  it('rejects phrase with word not in BIP-39 wordlist', () => {
    const phrase = generateRecoveryKey()
    const words = phrase.split(' ')
    words[0] = 'notinwordlist'
    expect(normalizeAndValidate(words.join(' '))).toBeNull()
  })

  it('rejects phrase with wrong checksum (valid words, wrong order)', () => {
    const phrase = generateRecoveryKey()
    const words = phrase.split(' ')
    // Swap two words — checksum won't match
    ;[words[0], words[1]] = [words[1], words[0]]
    expect(normalizeAndValidate(words.join(' '))).toBeNull()
  })

  it('rejects empty string', () => {
    expect(normalizeAndValidate('')).toBeNull()
  })

  it('rejects whitespace-only string', () => {
    expect(normalizeAndValidate('   \n\t  ')).toBeNull()
  })
})

describe('recovery-key — entropy roundtrip', () => {
  it('same phrase always produces same entropy (deterministic)', () => {
    const phrase = generateRecoveryKey()
    const a = recoveryKeyToSecret(phrase)
    const b = recoveryKeyToSecret(phrase)
    expect(a.equals(b)).toBe(true)
  })

  it('different phrases produce different entropy', () => {
    const a = recoveryKeyToSecret(generateRecoveryKey())
    const b = recoveryKeyToSecret(generateRecoveryKey())
    expect(a.equals(b)).toBe(false)
  })
})
