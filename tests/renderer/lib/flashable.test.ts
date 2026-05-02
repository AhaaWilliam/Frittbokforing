import { describe, it, expect, beforeEach } from 'vitest'
import {
  markFlashable,
  consumeFlashable,
  _resetFlashableForTests,
} from '../../../src/renderer/lib/flashable'

/**
 * VS-45 — flashable tracker invariants.
 */
describe('flashable tracker', () => {
  beforeEach(() => {
    _resetFlashableForTests()
  })

  it('consumeFlashable returnerar false för okänt id', () => {
    expect(consumeFlashable('expense', 1)).toBe(false)
  })

  it('markerad item returnerar true ENA gången', () => {
    markFlashable('expense', 42)
    expect(consumeFlashable('expense', 42)).toBe(true)
    // Andra anropet — markeringen är förbrukad.
    expect(consumeFlashable('expense', 42)).toBe(false)
  })

  it('separerar kind från id', () => {
    markFlashable('invoice', 1)
    expect(consumeFlashable('expense', 1)).toBe(false)
    expect(consumeFlashable('invoice', 1)).toBe(true)
  })

  it('stöder flera markeringar samtidigt', () => {
    markFlashable('expense', 1)
    markFlashable('expense', 2)
    markFlashable('manualEntry', 3)
    expect(consumeFlashable('expense', 1)).toBe(true)
    expect(consumeFlashable('expense', 2)).toBe(true)
    expect(consumeFlashable('manualEntry', 3)).toBe(true)
  })

  it('förfaller efter TTL', () => {
    const realNow = Date.now
    let now = 1_000_000
    Date.now = () => now
    try {
      markFlashable('expense', 99)
      now += 6_000 // > TTL_MS (5_000)
      expect(consumeFlashable('expense', 99)).toBe(false)
    } finally {
      Date.now = realNow
    }
  })
})
