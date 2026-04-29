/**
 * Sprint U1 — IPC schema validation for SEPA DD channels.
 */
import { describe, it, expect } from 'vitest'
import {
  SepaDdCreateMandateSchema,
  SepaDdListMandatesSchema,
  SepaDdRevokeMandateSchema,
  SepaDdCreateCollectionSchema,
  SepaDdCreateBatchSchema,
  SepaDdExportPain008Schema,
  SepaDdListCollectionsSchema,
  SepaDdListBatchesSchema,
} from '../src/shared/ipc-schemas'

describe('SepaDdCreateMandateSchema', () => {
  const base = {
    counterparty_id: 1,
    mandate_reference: 'MND-001',
    signature_date: '2025-01-01',
    sequence_type: 'RCUR' as const,
    iban: 'SE4550000000058398257466',
  }

  it('accepts valid input', () => {
    expect(SepaDdCreateMandateSchema.safeParse(base).success).toBe(true)
  })

  it('accepts bic optional', () => {
    expect(
      SepaDdCreateMandateSchema.safeParse({ ...base, bic: 'ESSESESS' }).success,
    ).toBe(true)
  })

  it('rejects invalid sequence_type', () => {
    expect(
      SepaDdCreateMandateSchema.safeParse({ ...base, sequence_type: 'BAD' })
        .success,
    ).toBe(false)
  })

  it('rejects too-long mandate_reference', () => {
    expect(
      SepaDdCreateMandateSchema.safeParse({
        ...base,
        mandate_reference: 'X'.repeat(36),
      }).success,
    ).toBe(false)
  })

  it('rejects empty mandate_reference', () => {
    expect(
      SepaDdCreateMandateSchema.safeParse({ ...base, mandate_reference: '' })
        .success,
    ).toBe(false)
  })

  it('rejects negative counterparty_id', () => {
    expect(
      SepaDdCreateMandateSchema.safeParse({ ...base, counterparty_id: -1 })
        .success,
    ).toBe(false)
  })
})

describe('SepaDdListMandatesSchema', () => {
  it('accepts valid counterparty_id', () => {
    expect(
      SepaDdListMandatesSchema.safeParse({ counterparty_id: 1 }).success,
    ).toBe(true)
  })

  it('rejects missing', () => {
    expect(SepaDdListMandatesSchema.safeParse({}).success).toBe(false)
  })
})

describe('SepaDdRevokeMandateSchema', () => {
  it('accepts valid mandate_id', () => {
    expect(SepaDdRevokeMandateSchema.safeParse({ mandate_id: 1 }).success).toBe(
      true,
    )
  })

  it('rejects 0', () => {
    expect(SepaDdRevokeMandateSchema.safeParse({ mandate_id: 0 }).success).toBe(
      false,
    )
  })
})

describe('SepaDdCreateCollectionSchema', () => {
  const base = {
    fiscal_year_id: 1,
    mandate_id: 1,
    amount_ore: 10000,
    collection_date: '2025-03-01',
  }

  it('accepts valid input', () => {
    expect(SepaDdCreateCollectionSchema.safeParse(base).success).toBe(true)
  })

  it('accepts invoice_id', () => {
    expect(
      SepaDdCreateCollectionSchema.safeParse({ ...base, invoice_id: 5 })
        .success,
    ).toBe(true)
  })

  it('rejects non-integer amount', () => {
    expect(
      SepaDdCreateCollectionSchema.safeParse({ ...base, amount_ore: 10.5 })
        .success,
    ).toBe(false)
  })

  it('rejects negative amount', () => {
    expect(
      SepaDdCreateCollectionSchema.safeParse({ ...base, amount_ore: -100 })
        .success,
    ).toBe(false)
  })
})

describe('SepaDdCreateBatchSchema', () => {
  const base = {
    fiscal_year_id: 1,
    collection_ids: [1, 2, 3],
    payment_date: '2025-04-01',
    account_number: '1930',
  }

  it('accepts valid input', () => {
    expect(SepaDdCreateBatchSchema.safeParse(base).success).toBe(true)
  })

  it('rejects empty collection_ids', () => {
    expect(
      SepaDdCreateBatchSchema.safeParse({ ...base, collection_ids: [] })
        .success,
    ).toBe(false)
  })
})

describe('SepaDdExportPain008Schema', () => {
  it('accepts valid batch_id', () => {
    expect(SepaDdExportPain008Schema.safeParse({ batch_id: 1 }).success).toBe(
      true,
    )
  })

  it('rejects missing', () => {
    expect(SepaDdExportPain008Schema.safeParse({}).success).toBe(false)
  })
})

describe('SepaDdListCollectionsSchema', () => {
  it('accepts valid fiscal_year_id', () => {
    expect(
      SepaDdListCollectionsSchema.safeParse({ fiscal_year_id: 1 }).success,
    ).toBe(true)
  })
  it('rejects missing fiscal_year_id', () => {
    expect(SepaDdListCollectionsSchema.safeParse({}).success).toBe(false)
  })
  it('rejects non-positive fiscal_year_id', () => {
    expect(
      SepaDdListCollectionsSchema.safeParse({ fiscal_year_id: 0 }).success,
    ).toBe(false)
  })
})

describe('SepaDdListBatchesSchema', () => {
  it('accepts valid fiscal_year_id', () => {
    expect(
      SepaDdListBatchesSchema.safeParse({ fiscal_year_id: 5 }).success,
    ).toBe(true)
  })
  it('rejects extra field (strict)', () => {
    expect(
      SepaDdListBatchesSchema.safeParse({ fiscal_year_id: 1, extra: 'x' })
        .success,
    ).toBe(false)
  })
})
