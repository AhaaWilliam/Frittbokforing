/**
 * IPC schema validation tests for payment batch export channels.
 */
import { describe, it, expect } from 'vitest'
import {
  PaymentBatchValidateExportSchema,
  PaymentBatchExportPain001Schema,
  CreateCounterpartyInputSchema,
} from '../src/shared/ipc-schemas'

describe('PaymentBatchValidateExportSchema', () => {
  it('accepts valid batch_id', () => {
    expect(
      PaymentBatchValidateExportSchema.safeParse({ batch_id: 1 }).success,
    ).toBe(true)
  })

  it('rejects missing batch_id', () => {
    expect(PaymentBatchValidateExportSchema.safeParse({}).success).toBe(false)
  })
})

describe('PaymentBatchExportPain001Schema', () => {
  it('accepts valid batch_id', () => {
    expect(
      PaymentBatchExportPain001Schema.safeParse({ batch_id: 1 }).success,
    ).toBe(true)
  })

  it('rejects negative batch_id', () => {
    expect(
      PaymentBatchExportPain001Schema.safeParse({ batch_id: -1 }).success,
    ).toBe(false)
  })
})

describe('CreateCounterpartyInputSchema — payment fields', () => {
  const base = {
    company_id: 1,
    name: 'Test AB',
    type: 'supplier' as const,
  }

  it('accepts bankgiro with hyphen', () => {
    expect(
      CreateCounterpartyInputSchema.safeParse({
        ...base,
        bankgiro: '1234-5678',
      }).success,
    ).toBe(true)
  })

  it('accepts bankgiro without hyphen', () => {
    expect(
      CreateCounterpartyInputSchema.safeParse({ ...base, bankgiro: '12345678' })
        .success,
    ).toBe(true)
  })

  it('rejects bankgiro with letters', () => {
    expect(
      CreateCounterpartyInputSchema.safeParse({
        ...base,
        bankgiro: '1234-ABCD',
      }).success,
    ).toBe(false)
  })

  it('accepts plusgiro', () => {
    expect(
      CreateCounterpartyInputSchema.safeParse({ ...base, plusgiro: '12345678' })
        .success,
    ).toBe(true)
  })

  it('accepts bank_clearing (4 digits)', () => {
    expect(
      CreateCounterpartyInputSchema.safeParse({
        ...base,
        bank_clearing: '1234',
      }).success,
    ).toBe(true)
  })

  it('rejects bank_clearing with wrong length', () => {
    expect(
      CreateCounterpartyInputSchema.safeParse({ ...base, bank_clearing: '123' })
        .success,
    ).toBe(false)
  })

  it('accepts null for all payment fields', () => {
    expect(
      CreateCounterpartyInputSchema.safeParse({
        ...base,
        bankgiro: null,
        plusgiro: null,
        bank_account: null,
        bank_clearing: null,
      }).success,
    ).toBe(true)
  })
})
