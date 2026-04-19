import type { Counterparty } from '../../../../src/shared/types'

// ── Factory ─────────────────────────────────────────────────────────

export function makeCounterparty(
  overrides: Partial<Counterparty> & Pick<Counterparty, 'id' | 'name' | 'type'>,
): Counterparty {
  return {
    company_id: 1,
    org_number: null,
    vat_number: null,
    address_line1: null,
    postal_code: null,
    city: null,
    country: 'SE',
    contact_person: null,
    email: null,
    phone: null,
    default_payment_terms: 30,
    bankgiro: null,
    plusgiro: null,
    bank_account: null,
    bank_clearing: null,
    is_active: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ── Type-specific fixtures (IPC-side filter) ────────────────────────

export const customerFixtures: Counterparty[] = [
  makeCounterparty({
    id: 1,
    name: 'Acme AB',
    type: 'customer',
    org_number: '5566778899',
    default_payment_terms: 30,
  }),
  makeCounterparty({
    id: 2,
    name: 'Beta Corp',
    type: 'customer',
    default_payment_terms: 15,
  }),
]

export const supplierFixtures: Counterparty[] = [
  makeCounterparty({
    id: 3,
    name: 'Leverantör Ett AB',
    type: 'supplier',
    default_payment_terms: 30,
  }),
  makeCounterparty({
    id: 4,
    name: 'Leverantör Två AB',
    type: 'supplier',
    default_payment_terms: 10,
  }),
]
