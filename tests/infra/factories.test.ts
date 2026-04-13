import { describe, it, expect, beforeEach } from 'vitest'
import {
  makeCustomer,
  makeSupplier,
  makeArticle,
  makeArticleFormInput,
  makeInvoice,
  makeExpense,
  makeInvoiceLine,
  makeExpenseLine,
  resetFactoryCounter,
} from '../fixtures/factories'
import { todayLocal } from '../../src/shared/date-utils'

describe('factories', () => {
  beforeEach(() => {
    resetFactoryCounter()
  })

  it('returns correct defaults per entity', () => {
    const customer = makeCustomer()
    expect(customer.country).toBe('SE')
    expect(customer.id).toBeGreaterThan(0)
    expect(customer.type).toBe('customer')
    expect(customer.default_payment_terms).toBe(30)

    const supplier = makeSupplier()
    expect(supplier.type).toBe('supplier')

    const invoice = makeInvoice()
    expect(invoice.invoice_date).toBe(todayLocal())
    expect(invoice.currency).toBe('SEK')

    // M12: amounts in öre (integer, not decimal)
    const article = makeArticle()
    expect(article.default_price_ore).toBe(100000)
    expect(Number.isInteger(article.default_price_ore)).toBe(true)

    // M78: ArticleFormInput returns string variants
    const formInput = makeArticleFormInput()
    expect(typeof formInput.default_price_ore).toBe('string')
    expect(formInput.default_price_ore).toBe('100000')

    // Lines produce valid amounts
    const line = makeInvoiceLine()
    expect(Number.isInteger(line.unit_price_ore)).toBe(true)
    const eLine = makeExpenseLine()
    expect(Number.isInteger(eLine.unit_price_ore)).toBe(true)

    const expense = makeExpense()
    expect(expense.status).toBe('draft')
  })

  it('propagates overrides while keeping other defaults', () => {
    const customer = makeCustomer({ name: 'Foo AB' })
    expect(customer.name).toBe('Foo AB')
    expect(customer.country).toBe('SE') // default preserved
    expect(customer.type).toBe('customer') // default preserved

    const invoice = makeInvoice({ status: 'unpaid', total_amount_ore: 99900 })
    expect(invoice.status).toBe('unpaid')
    expect(invoice.total_amount_ore).toBe(99900)
    expect(invoice.currency).toBe('SEK') // default preserved
  })

  it('resetFactoryCounter restores deterministic IDs', () => {
    const a1 = makeCustomer()
    const a2 = makeCustomer()

    resetFactoryCounter()

    const b1 = makeCustomer()
    const b2 = makeCustomer()

    expect(b1.id).toBe(a1.id)
    expect(b2.id).toBe(a2.id)
  })
})
