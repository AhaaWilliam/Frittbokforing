// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import {
  setupMockIpc,
  mockIpcResponse,
  mockIpcError,
} from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ArticlePicker } from '../../../../src/renderer/components/invoices/ArticlePicker'
import { defaultProducts, makeProduct } from '../__fixtures__/products'

// ── Helpers ─────────────────────────────────────────────────────────

type MockApi = Record<string, ReturnType<typeof vi.fn>>
function getMockApi(): MockApi {
  return (window as unknown as { api: MockApi }).api
}

async function openDropdown() {
  fireEvent.focus(screen.getByLabelText('Sök artikel'))
  await waitFor(
    () => {
      expect(screen.getByText('Konsulttimme')).toBeInTheDocument()
    },
    { timeout: 2000 },
  )
}

// ── Setup ───────────────────────────────────────────────────────────

beforeEach(() => {
  setupMockIpc()
  mockIpcResponse('product:list', { success: true, data: defaultProducts })
  mockIpcResponse('product:get-price-for-customer', {
    success: true,
    data: { price_ore: 50000, source: 'default' },
  })
})

// ── Tests ───────────────────────────────────────────────────────────

describe('ArticlePicker', () => {
  // ── Grupp 1: Rendering (3) ────────────────────────────────────────

  describe('Rendering', () => {
    it('1.1 renders search input', async () => {
      await renderWithProviders(
        <ArticlePicker counterpartyId={null} onSelect={vi.fn()} />,
      )
      expect(screen.getByLabelText('Sök artikel')).toBeInTheDocument()
    })

    it('1.2 focus opens dropdown with products, prices, and type badges', async () => {
      await renderWithProviders(
        <ArticlePicker counterpartyId={null} onSelect={vi.fn()} />,
      )
      await openDropdown()

      expect(screen.getByText('Konsulttimme')).toBeInTheDocument()
      expect(screen.getByText('Mus')).toBeInTheDocument()
      expect(screen.getByText('Resa')).toBeInTheDocument()
      // Type badges
      expect(screen.getByText('Tjänst')).toBeInTheDocument()
      expect(screen.getByText('Vara')).toBeInTheDocument()
      expect(screen.getByText('Utlägg')).toBeInTheDocument()
    })

    it('1.3 counterpartyId does not trigger price IPC until selection', async () => {
      await renderWithProviders(
        <ArticlePicker counterpartyId={5} onSelect={vi.fn()} />,
      )
      await openDropdown()

      expect(getMockApi().getPriceForCustomer).not.toHaveBeenCalled()
    })
  })

  // ── Grupp 2: Sök + filter (2) ────────────────────────────────────

  describe('Sök + filter', () => {
    it('2.1 typing filters products via debounced IPC call', async () => {
      await renderWithProviders(
        <ArticlePicker counterpartyId={null} onSelect={vi.fn()} />,
      )
      const input = screen.getByLabelText('Sök artikel')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'Mus' } })

      await waitFor(
        () => {
          const calls = getMockApi().listProducts.mock.calls
          const lastCall = calls[calls.length - 1]
          expect(lastCall[0]).toMatchObject({
            search: 'Mus',
            active_only: true,
          })
        },
        { timeout: 2000 },
      )
    })

    it('2.2 outside click closes dropdown', async () => {
      await renderWithProviders(
        <ArticlePicker counterpartyId={null} onSelect={vi.fn()} />,
      )
      await openDropdown()
      expect(screen.getByRole('list')).toBeInTheDocument()

      fireEvent.mouseDown(document.body)

      await waitFor(() => {
        expect(screen.queryByRole('list')).not.toBeInTheDocument()
      })
    })
  })

  // ── Grupp 3: Val utan counterparty (3) ────────────────────────────

  describe('Val utan counterparty', () => {
    it('3.1 selecting Konsulttimme propagates correct payload', async () => {
      const onSelect = vi.fn()
      await renderWithProviders(
        <ArticlePicker counterpartyId={null} onSelect={onSelect} />,
      )
      await openDropdown()

      fireEvent.click(screen.getByText('Konsulttimme'))

      await waitFor(() => {
        expect(onSelect).toHaveBeenCalledTimes(1)
      })
      expect(onSelect).toHaveBeenCalledWith({
        product_id: 1,
        description: 'Per timme',
        unit_price_kr: 1250,
        vat_code_id: 2,
        vat_rate: 0,
        unit: 'timme',
      })
    })

    it('3.2 product with description: null falls back to name', async () => {
      const onSelect = vi.fn()
      await renderWithProviders(
        <ArticlePicker counterpartyId={null} onSelect={onSelect} />,
      )
      await openDropdown()

      fireEvent.click(screen.getByText('Mus'))

      await waitFor(() => {
        expect(onSelect).toHaveBeenCalledTimes(1)
      })
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          product_id: 2,
          description: 'Mus', // fallback via ?? name (rad 97)
        }),
      )
    })

    it('3.3 without counterpartyId, price IPC is never called', async () => {
      const onSelect = vi.fn()
      await renderWithProviders(
        <ArticlePicker counterpartyId={null} onSelect={onSelect} />,
      )
      await openDropdown()

      fireEvent.click(screen.getByText('Konsulttimme'))

      await waitFor(() => {
        expect(onSelect).toHaveBeenCalledTimes(1)
      })
      expect(getMockApi().getPriceForCustomer).not.toHaveBeenCalled()
    })
  })

  // ── Grupp 4: Val med counterparty — kundpris (4) ─────────────────

  describe('Val med counterparty', () => {
    it('4.1 selecting with counterpartyId calls price IPC', async () => {
      const onSelect = vi.fn()
      await renderWithProviders(
        <ArticlePicker counterpartyId={5} onSelect={onSelect} />,
      )
      await openDropdown()

      fireEvent.click(screen.getByText('Konsulttimme'))

      await waitFor(() => {
        expect(getMockApi().getPriceForCustomer).toHaveBeenCalledTimes(1)
      })
      expect(getMockApi().getPriceForCustomer).toHaveBeenCalledWith({
        product_id: 1,
        counterparty_id: 5,
      })
    })

    it('4.2 customer price overrides default price', async () => {
      mockIpcResponse('product:get-price-for-customer', {
        success: true,
        data: { price_ore: 100000, source: 'customer' },
      })
      const onSelect = vi.fn()
      await renderWithProviders(
        <ArticlePicker counterpartyId={5} onSelect={onSelect} />,
      )
      await openDropdown()

      fireEvent.click(screen.getByText('Konsulttimme'))

      await waitFor(() => {
        expect(onSelect).toHaveBeenCalledTimes(1)
      })
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          unit_price_kr: 1000,
        }),
      )
    })

    it('4.3 default-source price result still uses result.price_ore', async () => {
      mockIpcResponse('product:get-price-for-customer', {
        success: true,
        data: { price_ore: 125000, source: 'default' },
      })
      const onSelect = vi.fn()
      await renderWithProviders(
        <ArticlePicker counterpartyId={5} onSelect={onSelect} />,
      )
      await openDropdown()

      fireEvent.click(screen.getByText('Konsulttimme'))

      await waitFor(() => {
        expect(onSelect).toHaveBeenCalledTimes(1)
      })
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          unit_price_kr: 1250,
        }),
      )
    })

    it('4.4 price IPC error falls back to default_price_ore', async () => {
      // getPriceForCustomer is called directly (not via ipcCall),
      // so must reject to trigger the catch block
      mockIpcError(
        'product:get-price-for-customer',
        new Error('Not found'),
      )
      const onSelect = vi.fn()
      await renderWithProviders(
        <ArticlePicker counterpartyId={5} onSelect={onSelect} />,
      )
      await openDropdown()

      fireEvent.click(screen.getByText('Konsulttimme'))

      await waitFor(() => {
        expect(onSelect).toHaveBeenCalledTimes(1)
      })
      // Fallback: toKr(product.default_price_ore) = toKr(125000) = 1250
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          unit_price_kr: 1250,
        }),
      )
    })
  })

  // ── Grupp 5: F27-klass — toKr-konvertering (4) ───────────────────

  describe('F27-klass: toKr-konvertering', () => {
    it('5.1 even price: 125000 öre → 1250 kr', async () => {
      const onSelect = vi.fn()
      await renderWithProviders(
        <ArticlePicker counterpartyId={null} onSelect={onSelect} />,
      )
      await openDropdown()

      fireEvent.click(screen.getByText('Konsulttimme'))

      await waitFor(() => {
        expect(onSelect).toHaveBeenCalledTimes(1)
      })
      expect(onSelect.mock.calls[0][0].unit_price_kr).toBe(1250)
    })

    it('5.2 decimal customer price: 12345 öre → 123.45 kr', async () => {
      mockIpcResponse('product:get-price-for-customer', {
        success: true,
        data: { price_ore: 12345, source: 'customer' },
      })
      const onSelect = vi.fn()
      await renderWithProviders(
        <ArticlePicker counterpartyId={5} onSelect={onSelect} />,
      )
      await openDropdown()

      fireEvent.click(screen.getByText('Konsulttimme'))

      await waitFor(() => {
        expect(onSelect).toHaveBeenCalledTimes(1)
      })
      expect(onSelect.mock.calls[0][0].unit_price_kr).toBe(123.45)
    })

    it('5.3 decimal fallback price: 12345 öre → 123.45 kr via error path', async () => {
      // Use product with default_price_ore: 12345 (Mus)
      // getPriceForCustomer is called directly — must reject
      mockIpcError(
        'product:get-price-for-customer',
        new Error('Not found'),
      )
      const onSelect = vi.fn()
      await renderWithProviders(
        <ArticlePicker counterpartyId={5} onSelect={onSelect} />,
      )
      await openDropdown()

      fireEvent.click(screen.getByText('Mus'))

      await waitFor(() => {
        expect(onSelect).toHaveBeenCalledTimes(1)
      })
      // Mus: default_price_ore: 12345 → toKr(12345) = 123.45
      expect(onSelect.mock.calls[0][0].unit_price_kr).toBe(123.45)
    })

    it('5.4 edge: 99 öre → 0.99 kr (non-100-divisible)', async () => {
      mockIpcResponse('product:list', { success: true, data: [
        makeProduct({ id: 10, name: 'Billig', default_price_ore: 99 }),
      ] })
      const onSelect = vi.fn()
      await renderWithProviders(
        <ArticlePicker counterpartyId={null} onSelect={onSelect} />,
      )
      fireEvent.focus(screen.getByLabelText('Sök artikel'))
      await waitFor(
        () => {
          expect(screen.getByText('Billig')).toBeInTheDocument()
        },
        { timeout: 2000 },
      )

      fireEvent.click(screen.getByText('Billig'))

      await waitFor(() => {
        expect(onSelect).toHaveBeenCalledTimes(1)
      })
      expect(onSelect.mock.calls[0][0].unit_price_kr).toBe(0.99)
    })
  })

  // ── Grupp 6: Empty (1) ───────────────────────────────────────────

  describe('Empty', () => {
    it('6.1 empty product list renders no dropdown', async () => {
      mockIpcResponse('product:list', { success: true, data: [] })
      await renderWithProviders(
        <ArticlePicker counterpartyId={null} onSelect={vi.fn()} />,
      )
      fireEvent.focus(screen.getByLabelText('Sök artikel'))

      // ArticlePicker only renders <ul> when products.length > 0
      expect(screen.queryByRole('list')).not.toBeInTheDocument()
    })
  })

  // ── Grupp 7: Re-val (1) ──────────────────────────────────────────

  describe('Re-val', () => {
    it('7.1 two sequential selections propagate different payloads', async () => {
      const onSelect = vi.fn()
      await renderWithProviders(
        <ArticlePicker counterpartyId={null} onSelect={onSelect} />,
      )
      await openDropdown()

      // First selection
      fireEvent.click(screen.getByText('Konsulttimme'))
      await waitFor(() => {
        expect(onSelect).toHaveBeenCalledTimes(1)
      })

      // Re-open and select different product
      fireEvent.focus(screen.getByLabelText('Sök artikel'))
      await waitFor(
        () => {
          expect(screen.getByText('Mus')).toBeInTheDocument()
        },
        { timeout: 2000 },
      )
      fireEvent.click(screen.getByText('Mus'))

      await waitFor(() => {
        expect(onSelect).toHaveBeenCalledTimes(2)
      })
      expect(onSelect.mock.calls[0][0]).toMatchObject({ product_id: 1 })
      expect(onSelect.mock.calls[1][0]).toMatchObject({ product_id: 2 })
    })
  })
})
