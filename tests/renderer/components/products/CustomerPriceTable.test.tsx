// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { CustomerPriceTable } from '../../../../src/renderer/components/products/CustomerPriceTable'
import type { CustomerPrice } from '../../../../src/shared/types'

beforeEach(() => {
  setupMockIpc()
  mockIpcResponse('counterparty:list', { success: true, data: [] })
})

const samplePrices: CustomerPrice[] = [
  { counterparty_id: 1, counterparty_name: 'Acme AB', price_ore: 12500 },
  { counterparty_id: 2, counterparty_name: 'Beta KB', price_ore: 9000 },
]

describe('CustomerPriceTable', () => {
  it('rendrar tom-state när inga kundpriser', async () => {
    await renderWithProviders(
      <CustomerPriceTable productId={1} customerPrices={[]} unit="st" />,
    )
    expect(screen.getByText(/Inga kundspecifika priser/)).toBeInTheDocument()
  })

  it('rendrar tabell med kundpriser', async () => {
    await renderWithProviders(
      <CustomerPriceTable
        productId={1}
        customerPrices={samplePrices}
        unit="st"
      />,
    )
    expect(screen.getByText('Acme AB')).toBeInTheDocument()
    expect(screen.getByText('Beta KB')).toBeInTheDocument()
    // Båda priserna formaterade
    expect(screen.getAllByText(/\/st/).length).toBe(2)
  })

  it('"+ Lägg till kundpris"-knapp visas default', async () => {
    await renderWithProviders(
      <CustomerPriceTable productId={1} customerPrices={[]} unit="st" />,
    )
    expect(
      screen.getByRole('button', { name: /Lägg till kundpris/ }),
    ).toBeInTheDocument()
  })

  it('klick på "Lägg till" öppnar form', async () => {
    const user = userEvent.setup()
    await renderWithProviders(
      <CustomerPriceTable productId={1} customerPrices={[]} unit="st" />,
    )
    await user.click(screen.getByRole('button', { name: /Lägg till kundpris/ }))
    expect(screen.getByLabelText(/^Kund$/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Pris \(kr\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spara' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Avbryt' })).toBeInTheDocument()
  })

  it('Spara utan kund visar fel', async () => {
    const user = userEvent.setup()
    await renderWithProviders(
      <CustomerPriceTable productId={1} customerPrices={[]} unit="st" />,
    )
    await user.click(screen.getByRole('button', { name: /Lägg till kundpris/ }))
    await user.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(() => {
      expect(screen.getByTestId('customer-price-error')).toHaveTextContent(
        /Välj en kund/,
      )
    })
  })

  it('Avbryt återställer form-state och stänger', async () => {
    const user = userEvent.setup()
    await renderWithProviders(
      <CustomerPriceTable productId={1} customerPrices={[]} unit="st" />,
    )
    await user.click(screen.getByRole('button', { name: /Lägg till kundpris/ }))
    await user.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(screen.queryByLabelText(/^Kund$/)).not.toBeInTheDocument()
    // "Lägg till"-knappen är tillbaka
    expect(
      screen.getByRole('button', { name: /Lägg till kundpris/ }),
    ).toBeInTheDocument()
  })

  it('kund-sökresultat visas och klick väljer kund', async () => {
    mockIpcResponse('counterparty:list', {
      success: true,
      data: [
        {
          id: 5,
          company_id: 1,
          name: 'Foundkund AB',
          type: 'customer',
          org_number: null,
          vat_number: null,
          vat_label: null,
          address_line1: null,
          address_line2: null,
          postal_code: null,
          city: null,
          country: null,
          email: null,
          phone: null,
          bankgiro: null,
          iban: null,
          bic: null,
          bank_country_code: null,
          website: null,
          default_payment_terms: 30,
          notes: null,
          active: 1,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    })
    const user = userEvent.setup()
    await renderWithProviders(
      <CustomerPriceTable productId={1} customerPrices={[]} unit="st" />,
    )
    await user.click(screen.getByRole('button', { name: /Lägg till kundpris/ }))
    await user.type(screen.getByLabelText(/^Kund$/), 'Found')
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Foundkund AB' }),
      ).toBeInTheDocument()
    })
    // Klick på resultatet
    await user.click(screen.getByRole('button', { name: 'Foundkund AB' }))
    // Input får nu fullt namn (selectedCounterpartyId-state)
    expect((screen.getByLabelText(/^Kund$/) as HTMLInputElement).value).toBe(
      'Foundkund AB',
    )
  })
})
