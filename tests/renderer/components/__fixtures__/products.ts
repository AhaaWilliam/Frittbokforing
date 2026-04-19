import type { Product } from '../../../../src/shared/types'

// ── Factory ─────────────────────────────────────────────────────────

export function makeProduct(overrides?: Partial<Product>): Product {
  return {
    id: 1,
    company_id: 1,
    name: 'Konsulttimme',
    description: 'Per timme',
    unit: 'timme',
    default_price_ore: 125000,
    vat_code_id: 2,
    account_id: 3001,
    article_type: 'service',
    is_active: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ── Default fixtures ────────────────────────────────────────────────

export const defaultProducts: Product[] = [
  makeProduct({
    id: 1,
    name: 'Konsulttimme',
    description: 'Per timme',
    unit: 'timme',
    default_price_ore: 125000,
    vat_code_id: 2,
    account_id: 3001,
    article_type: 'service',
  }),
  makeProduct({
    id: 2,
    name: 'Mus',
    description: null,
    unit: 'styck',
    default_price_ore: 12345,
    vat_code_id: 1,
    account_id: 3002,
    article_type: 'goods',
  }),
  makeProduct({
    id: 3,
    name: 'Resa',
    description: 'Reseutlägg',
    unit: 'km',
    default_price_ore: 250,
    vat_code_id: 0,
    account_id: 3003,
    article_type: 'expense',
  }),
]
