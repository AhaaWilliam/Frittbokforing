// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import {
  setupMockIpc,
  mockIpcResponse,
  mockIpcPending,
} from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { CustomerPicker } from '../../../../src/renderer/components/invoices/CustomerPicker'
import { customerFixtures } from '../__fixtures__/counterparties'

// ── Setup ───────────────────────────────────────────────────────────

beforeEach(() => {
  setupMockIpc()
  mockIpcResponse('counterparty:list', { success: true, data: customerFixtures })
})

// ── Helpers ─────────────────────────────────────────────────────────

async function openDropdown() {
  fireEvent.focus(screen.getByLabelText('Sök kund'))
  await waitFor(() => {
    expect(screen.getByText('Acme AB')).toBeInTheDocument()
  })
}

// ── Tests ───────────────────────────────────────────────────────────

describe('CustomerPicker', () => {
  // ── Rendering (3) ─────────────────────────────────────────────────

  describe('Rendering', () => {
    it('1.1 renders search input when value is null', async () => {
      await renderWithProviders(
        <CustomerPicker value={null} onChange={vi.fn()} />,
      )
      const input = screen.getByLabelText('Sök kund')
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('type', 'text')
    })

    it('1.2 renders customer name as span when value is set', async () => {
      await renderWithProviders(
        <CustomerPicker
          value={{ id: 1, name: 'Acme AB' }}
          onChange={vi.fn()}
        />,
      )
      expect(screen.getByText('Acme AB')).toBeInTheDocument()
      // Search input is not rendered in the value branch
      expect(screen.queryByLabelText('Sök kund')).not.toBeInTheDocument()
    })

    it('1.3 dropdown lists customer-type entries', async () => {
      await renderWithProviders(
        <CustomerPicker value={null} onChange={vi.fn()} />,
      )
      await openDropdown()

      expect(screen.getByText('Acme AB')).toBeInTheDocument()
      expect(screen.getByText('Beta Corp')).toBeInTheDocument()
      // Org number shown for Acme AB (fixture has org_number)
      expect(screen.getByText('5566778899')).toBeInTheDocument()
    })
  })

  // ── onChange (4) ──────────────────────────────────────────────────

  describe('onChange', () => {
    it('2.1 selecting customer triggers onChange with correct args', async () => {
      const onChange = vi.fn()
      await renderWithProviders(
        <CustomerPicker value={null} onChange={onChange} />,
      )
      await openDropdown()

      fireEvent.click(screen.getByText('Acme AB'))

      expect(onChange).toHaveBeenCalledOnce()
      expect(onChange).toHaveBeenCalledWith({
        id: 1,
        name: 'Acme AB',
        default_payment_terms: 30,
      })
    })

    it('2.2 selecting customer with different payment_terms', async () => {
      const onChange = vi.fn()
      await renderWithProviders(
        <CustomerPicker value={null} onChange={onChange} />,
      )
      await openDropdown()

      fireEvent.click(screen.getByText('Beta Corp'))

      expect(onChange).toHaveBeenCalledWith({
        id: 2,
        name: 'Beta Corp',
        default_payment_terms: 15,
      })
    })

    it('2.3 rerender with new value from parent displays new name', async () => {
      const onChange = vi.fn()
      const { rerender } = await renderWithProviders(
        <CustomerPicker
          value={{ id: 1, name: 'Acme AB' }}
          onChange={onChange}
        />,
      )
      expect(screen.getByText('Acme AB')).toBeInTheDocument()

      rerender(
        <CustomerPicker
          value={{ id: 2, name: 'Beta Corp' }}
          onChange={onChange}
        />,
      )
      expect(screen.getByText('Beta Corp')).toBeInTheDocument()
      expect(screen.queryByText('Acme AB')).not.toBeInTheDocument()
    })

    it('2.4 onChange is not called on mount or parent rerender', async () => {
      const onChange = vi.fn()
      const { rerender } = await renderWithProviders(
        <CustomerPicker value={null} onChange={onChange} />,
      )
      expect(onChange).not.toHaveBeenCalled()

      rerender(
        <CustomerPicker
          value={{ id: 1, name: 'Acme AB' }}
          onChange={onChange}
        />,
      )
      expect(onChange).not.toHaveBeenCalled()
    })
  })

  // ── Async / empty (2) ────────────────────────────────────────────

  describe('Async/empty states', () => {
    it('3.1 empty list from IPC renders no dropdown items', async () => {
      mockIpcResponse('counterparty:list', { success: true, data: [] })
      await renderWithProviders(
        <CustomerPicker value={null} onChange={vi.fn()} />,
      )
      fireEvent.focus(screen.getByLabelText('Sök kund'))

      // CustomerPicker only renders <ul> when customers.length > 0
      expect(screen.queryByRole('list')).not.toBeInTheDocument()
    })

    it('3.2 pending IPC data renders no items without crash', async () => {
      mockIpcPending('counterparty:list')
      await renderWithProviders(
        <CustomerPicker value={null} onChange={vi.fn()} />,
      )
      fireEvent.focus(screen.getByLabelText('Sök kund'))

      // Data is undefined (never resolves), dropdown does not render
      expect(screen.queryByRole('list')).not.toBeInTheDocument()
    })
  })

  // ── Keyboard navigation (WAI-ARIA 1.2 combobox) ──────────────────────

  describe('Keyboard', () => {
    it('4.1 ArrowDown + Enter selects first customer', async () => {
      const onChange = vi.fn()
      await renderWithProviders(
        <CustomerPicker value={null} onChange={onChange} />,
      )
      await openDropdown()
      const input = screen.getByLabelText('Sök kund')

      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onChange).toHaveBeenCalledWith({
        id: 1,
        name: 'Acme AB',
        default_payment_terms: 30,
      })
    })

    it('4.2 ArrowDown ×2 + Enter selects second customer', async () => {
      const onChange = vi.fn()
      await renderWithProviders(
        <CustomerPicker value={null} onChange={onChange} />,
      )
      await openDropdown()
      const input = screen.getByLabelText('Sök kund')

      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ id: 2, name: 'Beta Corp' }),
      )
    })

    it('4.3 Escape stänger dropdown', async () => {
      await renderWithProviders(
        <CustomerPicker value={null} onChange={vi.fn()} />,
      )
      await openDropdown()
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      const input = screen.getByLabelText('Sök kund')

      fireEvent.keyDown(input, { key: 'Escape' })

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
      })
    })

    it('4.4 aria-activedescendant matchar aktiv option id', async () => {
      await renderWithProviders(
        <CustomerPicker value={null} onChange={vi.fn()} />,
      )
      await openDropdown()
      const input = screen.getByLabelText('Sök kund') as HTMLInputElement

      fireEvent.keyDown(input, { key: 'ArrowDown' })
      const activeId = input.getAttribute('aria-activedescendant')
      expect(activeId).toBeTruthy()
      const activeEl = document.getElementById(activeId!)
      expect(activeEl).toHaveAttribute('role', 'option')
      expect(activeEl).toHaveAttribute('aria-selected', 'true')
    })
  })
})
