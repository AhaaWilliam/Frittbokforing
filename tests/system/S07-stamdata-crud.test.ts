/**
 * S07 — Stamdata: Kund/leverantörs-CRUD, artiklar, priser, kontoplan.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from 'vitest'
import {
  createTemplateDb,
  createSystemTestContext,
  destroyContext,
  destroyTemplateDb,
  seedCustomer,
  seedSupplier,
  seedProduct,
  seedAndFinalizeInvoice,
  seedAndFinalizeExpense,
  seedManualEntry,
  getVatCode25Out,
  type SystemTestContext,
} from './helpers/system-test-context'

let ctx: SystemTestContext

beforeAll(() => {
  createTemplateDb()
})
afterAll(() => {
  destroyTemplateDb()
})
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-15T10:00:00'))
  ctx = createSystemTestContext()
})
afterEach(() => {
  destroyContext(ctx)
  vi.useRealTimers()
})

describe('Stamdata — CRUD och affärsregler', () => {
  it('S07-01: kundcykel — skapa → uppdatera → inaktivera', () => {
    const customer = seedCustomer(ctx, { name: 'Uppdatera AB' })
    expect(customer.id).toBeGreaterThan(0)

    // Uppdatera
    const updateResult = ctx.counterpartyService.updateCounterparty(ctx.db, {
      id: customer.id,
      name: 'Uppdaterad AB',
      city: 'Stockholm',
    })
    expect(updateResult.success).toBe(true)

    // Inaktivera
    const deactivateResult = ctx.counterpartyService.deactivateCounterparty(
      ctx.db,
      customer.id,
    )
    expect(deactivateResult.success).toBe(true)

    // Verify inactive
    const fetched = ctx.counterpartyService.getCounterparty(ctx.db, customer.id)
    expect(fetched?.is_active).toBe(0)
  })

  it('S07-02: leverantör syns inte i kundlista', () => {
    seedCustomer(ctx, { name: 'Kundföretag' })
    seedSupplier(ctx, { name: 'Leverantörsföretag' })

    const customers = ctx.counterpartyService.listCounterparties(ctx.db, {
      type: 'customer',
    })
    const suppliers = ctx.counterpartyService.listCounterparties(ctx.db, {
      type: 'supplier',
    })

    expect(customers.some((c: any) => c.name === 'Kundföretag')).toBe(true)
    expect(customers.some((c: any) => c.name === 'Leverantörsföretag')).toBe(
      false,
    )
    expect(suppliers.some((s: any) => s.name === 'Leverantörsföretag')).toBe(
      true,
    )
  })

  it('S07-03: produkt med kundspecifika priser', () => {
    const product = seedProduct(ctx, { default_price: 10000 })
    const customerA = seedCustomer(ctx, { name: 'Kund A' })
    const customerB = seedCustomer(ctx, { name: 'Kund B' })

    // Sätt kundpris 80 kr för kund A
    ctx.productService.setCustomerPrice(ctx.db, {
      product_id: product.id,
      counterparty_id: customerA.id,
      price: 8000,
    })

    // Kund A → 80 kr
    const priceA = ctx.productService.getPriceForCustomer(ctx.db, {
      product_id: product.id,
      counterparty_id: customerA.id,
    })
    expect(priceA.price).toBe(8000)
    expect(priceA.source).toBe('customer')

    // Kund B → 100 kr (default)
    const priceB = ctx.productService.getPriceForCustomer(ctx.db, {
      product_id: product.id,
      counterparty_id: customerB.id,
    })
    expect(priceB.price).toBe(10000)
    expect(priceB.source).toBe('default')

    // Ta bort kundpris → kund A → 100 kr
    ctx.productService.removeCustomerPrice(ctx.db, {
      product_id: product.id,
      counterparty_id: customerA.id,
    })
    const priceAfter = ctx.productService.getPriceForCustomer(ctx.db, {
      product_id: product.id,
      counterparty_id: customerA.id,
    })
    expect(priceAfter.price).toBe(10000)
    expect(priceAfter.source).toBe('default')
  })

  it('S07-04: systemkonton kan inte inaktiveras', () => {
    const result = ctx.accountService.toggleAccountActive(ctx.db, {
      account_number: '1930',
    })
    expect(result.success).toBe(false)
  })

  it('S07-05: konto med journal_entry_lines kan inte inaktiveras', () => {
    // Bokför med konto 6210
    seedManualEntry(
      ctx,
      [
        { account_number: '6210', debit_amount: 10000, credit_amount: 0 },
        { account_number: '1930', debit_amount: 0, credit_amount: 10000 },
      ],
      { entryDate: '2026-03-15' },
    )

    const result = ctx.accountService.toggleAccountActive(ctx.db, {
      account_number: '6210',
    })
    expect(result.success).toBe(false)
  })

  it('S07-07: sök i kund/leverantörslistor', () => {
    seedCustomer(ctx, { name: 'Acme Corporation' })
    seedCustomer(ctx, { name: 'Beta Industries' })
    seedSupplier(ctx, { name: 'Gamma Supplies' })

    const searchAcme = ctx.counterpartyService.listCounterparties(ctx.db, {
      search: 'Acme',
    })
    expect(searchAcme.length).toBe(1)
    expect(searchAcme[0].name).toBe('Acme Corporation')

    const allCustomers = ctx.counterpartyService.listCounterparties(ctx.db, {
      type: 'customer',
    })
    expect(allCustomers.length).toBeGreaterThanOrEqual(2)
  })
})
