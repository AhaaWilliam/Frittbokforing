import { describe, it, expect } from 'vitest'
import {
  CustomerFormStateSchema,
  CUSTOMER_DEFAULTS,
  transformCustomerForm,
  type CustomerFormState,
} from '../../../../src/renderer/lib/form-schemas/customer'

function makeForm(overrides?: Partial<CustomerFormState>): CustomerFormState {
  return { ...CUSTOMER_DEFAULTS, name: 'Acme AB', ...overrides }
}

describe('CustomerFormStateSchema', () => {
  it('CUSTOMER_DEFAULTS validerar (förutom tomt namn)', () => {
    const r = CustomerFormStateSchema.safeParse({
      ...CUSTOMER_DEFAULTS,
      name: 'X',
    })
    expect(r.success).toBe(true)
  })

  it('tomt namn → fel "Namn är obligatoriskt"', () => {
    const r = CustomerFormStateSchema.safeParse(CUSTOMER_DEFAULTS)
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('Namn är obligatoriskt')
    }
  })

  it('namn > 200 tecken → fel', () => {
    const r = CustomerFormStateSchema.safeParse({
      ...CUSTOMER_DEFAULTS,
      name: 'a'.repeat(201),
    })
    expect(r.success).toBe(false)
  })

  it('giltig e-post accepteras', () => {
    const r = CustomerFormStateSchema.safeParse(makeForm({ email: 'a@b.se' }))
    expect(r.success).toBe(true)
  })

  it('tom e-post accepteras (optional)', () => {
    const r = CustomerFormStateSchema.safeParse(makeForm({ email: '' }))
    expect(r.success).toBe(true)
  })

  it('whitespace-only e-post accepteras (.trim är 0)', () => {
    const r = CustomerFormStateSchema.safeParse(makeForm({ email: '   ' }))
    expect(r.success).toBe(true)
  })

  it('ogiltig e-post → fel', () => {
    const r = CustomerFormStateSchema.safeParse(makeForm({ email: 'no-at' }))
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.message).toBe('Ogiltig e-postadress')
    }
  })

  it('type: enum begränsad till customer/supplier/both', () => {
    const r = CustomerFormStateSchema.safeParse(
      makeForm({ type: 'invalid' as 'customer' }),
    )
    expect(r.success).toBe(false)
  })
})

describe('transformCustomerForm', () => {
  it('trimmar namn', () => {
    const out = transformCustomerForm(makeForm({ name: '  Acme  ' }))
    expect(out.name).toBe('Acme')
  })

  it('tom org_number → null', () => {
    const out = transformCustomerForm(makeForm({ org_number: '' }))
    expect(out.org_number).toBeNull()
  })

  it('whitespace-only fält → null', () => {
    const out = transformCustomerForm(
      makeForm({ vat_number: '   ', email: '  ', phone: '\t' }),
    )
    expect(out.vat_number).toBeNull()
    expect(out.email).toBeNull()
    expect(out.phone).toBeNull()
  })

  it('country default till "Sverige" vid tomt', () => {
    const out = transformCustomerForm(makeForm({ country: '' }))
    expect(out.country).toBe('Sverige')
  })

  it('default_payment_terms passas igenom som number', () => {
    const out = transformCustomerForm(makeForm({ default_payment_terms: 14 }))
    expect(out.default_payment_terms).toBe(14)
  })

  it('alla bank-fält trims och null:as när tomma', () => {
    const out = transformCustomerForm(makeForm())
    expect(out.bankgiro).toBeNull()
    expect(out.plusgiro).toBeNull()
    expect(out.bank_account).toBeNull()
    expect(out.bank_clearing).toBeNull()
  })
})
