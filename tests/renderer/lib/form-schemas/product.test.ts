import { describe, it, expect } from 'vitest'
import {
  ProductFormStateSchema,
  PRODUCT_DEFAULTS,
  transformProductForm,
  type ProductFormState,
} from '../../../../src/renderer/lib/form-schemas/product'

function makeForm(overrides?: Partial<ProductFormState>): ProductFormState {
  return {
    ...PRODUCT_DEFAULTS,
    name: 'Konsulttimme',
    vat_code_id: 1,
    account_id: 3010,
    ...overrides,
  }
}

describe('ProductFormStateSchema', () => {
  it('giltig form passerar', () => {
    expect(ProductFormStateSchema.safeParse(makeForm()).success).toBe(true)
  })

  it('tomt namn → fel', () => {
    const r = ProductFormStateSchema.safeParse(makeForm({ name: '' }))
    expect(r.success).toBe(false)
  })

  it('namn > 200 tecken → fel', () => {
    const r = ProductFormStateSchema.safeParse(
      makeForm({ name: 'a'.repeat(201) }),
    )
    expect(r.success).toBe(false)
  })

  it('article_type begränsas till service/goods/expense', () => {
    const r = ProductFormStateSchema.safeParse(
      makeForm({ article_type: 'invalid' as 'service' }),
    )
    expect(r.success).toBe(false)
  })

  it('unit begränsas till valid lista', () => {
    const r = ProductFormStateSchema.safeParse(
      makeForm({ unit: 'box' as 'styck' }),
    )
    expect(r.success).toBe(false)
  })

  it('vat_code_id=0 → fel "Välj en momskod"', () => {
    const r = ProductFormStateSchema.safeParse(makeForm({ vat_code_id: 0 }))
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('Välj en momskod')
    }
  })

  it('account_id=0 → fel "Välj ett konto"', () => {
    const r = ProductFormStateSchema.safeParse(makeForm({ account_id: 0 }))
    expect(r.success).toBe(false)
  })

  it('_priceKr tom sträng accepteras', () => {
    const r = ProductFormStateSchema.safeParse(makeForm({ _priceKr: '' }))
    expect(r.success).toBe(true)
  })

  it('_priceKr giltig decimal accepteras', () => {
    const r = ProductFormStateSchema.safeParse(makeForm({ _priceKr: '149.50' }))
    expect(r.success).toBe(true)
  })

  it('_priceKr negativ → fel', () => {
    const r = ProductFormStateSchema.safeParse(makeForm({ _priceKr: '-10' }))
    expect(r.success).toBe(false)
  })

  it('_priceKr text-skräp → fel', () => {
    const r = ProductFormStateSchema.safeParse(
      makeForm({ _priceKr: 'abc' }),
    )
    expect(r.success).toBe(false)
  })
})

describe('transformProductForm', () => {
  it('trimmar namn och beskrivning', () => {
    const out = transformProductForm(
      makeForm({ name: '  Foo  ', description: '  Bar  ' }),
    )
    expect(out.name).toBe('Foo')
    expect(out.description).toBe('Bar')
  })

  it('tom description → null', () => {
    const out = transformProductForm(makeForm({ description: '' }))
    expect(out.description).toBeNull()
  })

  it('_priceKr "199.50" → default_price_ore=19950', () => {
    const out = transformProductForm(makeForm({ _priceKr: '199.50' }))
    expect(out.default_price_ore).toBe(19950)
  })

  it('_priceKr tom → default_price_ore=0', () => {
    const out = transformProductForm(makeForm({ _priceKr: '' }))
    expect(out.default_price_ore).toBe(0)
  })

  it('article_type/unit passas igenom', () => {
    const out = transformProductForm(
      makeForm({ article_type: 'goods', unit: 'styck' }),
    )
    expect(out.article_type).toBe('goods')
    expect(out.unit).toBe('styck')
  })
})
