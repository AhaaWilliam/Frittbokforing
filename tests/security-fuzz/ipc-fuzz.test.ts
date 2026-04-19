import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  SaveDraftInputSchema,
  SaveExpenseDraftSchema,
  CreateCounterpartyInputSchema,
  PayInvoiceInputSchema,
} from '../../src/shared/ipc-schemas'

/**
 * IPC-fuzz: generera random payloads och verifiera att Zod alltid returnerar
 * definitivt beslut (success eller fail) utan att kasta okontrollerat.
 *
 * Invarianter:
 * 1. safeParse returnerar aldrig undefined — alltid {success: true|false}
 * 2. Om success === false finns minst ett issue med path och message
 * 3. Ingen ReDoS: parsing slutför inom ≤1000ms även för patologisk input
 */

function anyJson(): fc.Arbitrary<unknown> {
  return fc.anything({
    maxDepth: 3,
    maxKeys: 5,
    values: [
      fc.string({ maxLength: 50 }),
      fc.integer(),
      fc.float({ noNaN: true }),
      fc.boolean(),
      fc.constant(null),
    ],
  })
}

describe('IPC fuzz — Zod-scheman hanterar alla input utan att kasta', () => {
  it('SaveDraftInputSchema', () => {
    fc.assert(
      fc.property(anyJson(), (input) => {
        const r = SaveDraftInputSchema.safeParse(input)
        expect(r).toHaveProperty('success')
        if (!r.success) {
          expect(r.error.issues.length).toBeGreaterThan(0)
          for (const issue of r.error.issues) {
            expect(typeof issue.message).toBe('string')
            expect(Array.isArray(issue.path)).toBe(true)
          }
        }
      }),
      { numRuns: 500 },
    )
  })

  it('SaveExpenseDraftSchema', () => {
    fc.assert(
      fc.property(anyJson(), (input) => {
        const r = SaveExpenseDraftSchema.safeParse(input)
        expect(r).toHaveProperty('success')
      }),
      { numRuns: 500 },
    )
  })

  it('CreateCounterpartyInputSchema', () => {
    fc.assert(
      fc.property(anyJson(), (input) => {
        const r = CreateCounterpartyInputSchema.safeParse(input)
        expect(r).toHaveProperty('success')
      }),
      { numRuns: 500 },
    )
  })

  it('PayInvoiceInputSchema', () => {
    fc.assert(
      fc.property(anyJson(), (input) => {
        const r = PayInvoiceInputSchema.safeParse(input)
        expect(r).toHaveProperty('success')
      }),
      { numRuns: 500 },
    )
  })

  it('prototype pollution-payloads blockeras av .strict()', () => {
    const pollutions = [
      { __proto__: { polluted: true } },
      { constructor: { prototype: { polluted: true } } },
      { 'x-proto': { polluted: true } },
    ]
    for (const p of pollutions) {
      const r = SaveDraftInputSchema.safeParse(p)
      expect(r.success).toBe(false)
      // Ingen sidoeffekt — en neutral object som inte prototypeades
      expect(
        ({} as Record<string, unknown>).polluted,
      ).toBeUndefined()
    }
  })

  it('djupa nested objects (bomb) hanteras utan crash eller timeout', () => {
    let deep: unknown = 'leaf'
    for (let i = 0; i < 100; i++) deep = { nested: deep }
    const start = Date.now()
    const r = SaveDraftInputSchema.safeParse(deep)
    const elapsed = Date.now() - start
    expect(r.success).toBe(false)
    expect(elapsed).toBeLessThan(1000) // ingen ReDoS
  })

  it('långa strängar (potentiell ReDoS) parsas snabbt', () => {
    const longStr = 'A'.repeat(100_000)
    const start = Date.now()
    const r = SaveDraftInputSchema.safeParse({ notes: longStr })
    const elapsed = Date.now() - start
    // notes-fältet kan ha max-length; vi bara verifierar att parse slutför
    expect(r).toHaveProperty('success')
    expect(elapsed).toBeLessThan(500)
  })
})
