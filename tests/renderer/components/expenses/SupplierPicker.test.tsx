// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import {
  setupMockIpc,
  mockIpcResponse,
  mockIpcPending,
} from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { SupplierPicker } from '../../../../src/renderer/components/expenses/SupplierPicker'
import { supplierFixtures, makeCounterparty } from '../__fixtures__/counterparties'

// ── Setup ───────────────────────────────────────────────────────────

const createdSupplier = makeCounterparty({
  id: 99,
  name: 'Ny Leverantör AB',
  type: 'supplier',
  default_payment_terms: 30,
})

beforeEach(() => {
  setupMockIpc()
  mockIpcResponse('counterparty:list', supplierFixtures)
  // Create-channel mock — required for inline-create tests (4.x)
  mockIpcResponse('counterparty:create', {
    success: true,
    data: createdSupplier,
  })
})

// ── Helpers ─────────────────────────────────────────────────────────

type MockApi = Record<string, ReturnType<typeof vi.fn>>
function getMockApi(): MockApi {
  return (window as unknown as { api: MockApi }).api
}

async function openDropdown() {
  fireEvent.focus(screen.getByLabelText('Sök leverantör'))
  await waitFor(() => {
    expect(screen.getByText('Leverantör Ett AB')).toBeInTheDocument()
  })
}

async function openInlineCreateForm() {
  await openDropdown()
  fireEvent.click(screen.getByText('+ Ny leverantör'))
  expect(screen.getByLabelText('Nytt leverantörsnamn')).toBeInTheDocument()
}

// ── Tests ───────────────────────────────────────────────────────────

describe('SupplierPicker', () => {
  // ── Rendering (3) ─────────────────────────────────────────────────

  describe('Rendering', () => {
    it('1.1 renders search input when value is null', async () => {
      await renderWithProviders(
        <SupplierPicker value={null} onChange={vi.fn()} />,
      )
      const input = screen.getByLabelText('Sök leverantör')
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('type', 'text')
    })

    it('1.2 renders supplier name as span when value is set', async () => {
      await renderWithProviders(
        <SupplierPicker
          value={{ id: 3, name: 'Leverantör Ett AB' }}
          onChange={vi.fn()}
        />,
      )
      expect(screen.getByText('Leverantör Ett AB')).toBeInTheDocument()
      expect(
        screen.queryByLabelText('Sök leverantör'),
      ).not.toBeInTheDocument()
    })

    it('1.3 dropdown lists supplier-type entries', async () => {
      await renderWithProviders(
        <SupplierPicker value={null} onChange={vi.fn()} />,
      )
      await openDropdown()

      expect(screen.getByText('Leverantör Ett AB')).toBeInTheDocument()
      expect(screen.getByText('Leverantör Två AB')).toBeInTheDocument()
    })
  })

  // ── onChange (4) ──────────────────────────────────────────────────

  describe('onChange', () => {
    it('2.1 selecting supplier triggers onChange with correct args', async () => {
      const onChange = vi.fn()
      await renderWithProviders(
        <SupplierPicker value={null} onChange={onChange} />,
      )
      await openDropdown()

      fireEvent.click(screen.getByText('Leverantör Ett AB'))

      expect(onChange).toHaveBeenCalledOnce()
      expect(onChange).toHaveBeenCalledWith({
        id: 3,
        name: 'Leverantör Ett AB',
        default_payment_terms: 30,
      })
    })

    it('2.2 selecting supplier with different payment_terms', async () => {
      const onChange = vi.fn()
      await renderWithProviders(
        <SupplierPicker value={null} onChange={onChange} />,
      )
      await openDropdown()

      fireEvent.click(screen.getByText('Leverantör Två AB'))

      expect(onChange).toHaveBeenCalledWith({
        id: 4,
        name: 'Leverantör Två AB',
        default_payment_terms: 10,
      })
    })

    it('2.3 rerender with new value from parent displays new name', async () => {
      const onChange = vi.fn()
      const { rerender } = await renderWithProviders(
        <SupplierPicker
          value={{ id: 3, name: 'Leverantör Ett AB' }}
          onChange={onChange}
        />,
      )
      expect(screen.getByText('Leverantör Ett AB')).toBeInTheDocument()

      rerender(
        <SupplierPicker
          value={{ id: 4, name: 'Leverantör Två AB' }}
          onChange={onChange}
        />,
      )
      expect(screen.getByText('Leverantör Två AB')).toBeInTheDocument()
      expect(
        screen.queryByText('Leverantör Ett AB'),
      ).not.toBeInTheDocument()
    })

    it('2.4 onChange is not called on mount or parent rerender', async () => {
      const onChange = vi.fn()
      const { rerender } = await renderWithProviders(
        <SupplierPicker value={null} onChange={onChange} />,
      )
      expect(onChange).not.toHaveBeenCalled()

      rerender(
        <SupplierPicker
          value={{ id: 3, name: 'Leverantör Ett AB' }}
          onChange={onChange}
        />,
      )
      expect(onChange).not.toHaveBeenCalled()
    })
  })

  // ── Async / empty (1) ────────────────────────────────────────────

  describe('Async/empty states', () => {
    it('3.1 empty list from IPC shows no supplier items', async () => {
      mockIpcResponse('counterparty:list', [])
      await renderWithProviders(
        <SupplierPicker value={null} onChange={vi.fn()} />,
      )
      fireEvent.focus(screen.getByLabelText('Sök leverantör'))

      // SupplierPicker shows dropdown (for "+ Ny leverantör") but no supplier items
      await waitFor(() => {
        expect(screen.getByText('+ Ny leverantör')).toBeInTheDocument()
      })
      expect(
        screen.queryByText('Leverantör Ett AB'),
      ).not.toBeInTheDocument()
    })
  })

  // ── Inline-skapa (4) ─────────────────────────────────────────────

  describe('Inline-skapa', () => {
    it('4.1 "+ Ny leverantör" button visible in dropdown', async () => {
      await renderWithProviders(
        <SupplierPicker value={null} onChange={vi.fn()} />,
      )
      fireEvent.focus(screen.getByLabelText('Sök leverantör'))

      expect(
        await screen.findByText('+ Ny leverantör'),
      ).toBeInTheDocument()
    })

    it('4.2 create sends correct IPC payload', async () => {
      const onChange = vi.fn()
      await renderWithProviders(
        <SupplierPicker value={null} onChange={onChange} />,
      )
      await openInlineCreateForm()

      const nameInput = screen.getByLabelText('Nytt leverantörsnamn')
      fireEvent.change(nameInput, { target: { value: 'Ny Leverantör AB' } })
      fireEvent.click(screen.getByText('Skapa'))

      await waitFor(() => {
        expect(getMockApi().createCounterparty).toHaveBeenCalledWith({
          name: 'Ny Leverantör AB',
          type: 'supplier',
          org_number: null,
        })
      })
    })

    it('4.3 after successful create, onChange is called with new supplier', async () => {
      const onChange = vi.fn()
      await renderWithProviders(
        <SupplierPicker value={null} onChange={onChange} />,
      )
      await openInlineCreateForm()

      fireEvent.change(screen.getByLabelText('Nytt leverantörsnamn'), {
        target: { value: 'Ny Leverantör AB' },
      })
      fireEvent.click(screen.getByText('Skapa'))

      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith({
          id: 99,
          name: 'Ny Leverantör AB',
          default_payment_terms: 30,
        })
      })
    })

    it('4.4 create error: onChange not called, no crash', async () => {
      // Override create mock to return IPC error
      mockIpcResponse('counterparty:create', {
        success: false,
        error: 'Motpart med detta namn finns redan',
        code: 'DUPLICATE_NAME',
      })
      const onChange = vi.fn()
      await renderWithProviders(
        <SupplierPicker value={null} onChange={onChange} />,
      )
      await openInlineCreateForm()

      fireEvent.change(screen.getByLabelText('Nytt leverantörsnamn'), {
        target: { value: 'Duplicate AB' },
      })
      fireEvent.click(screen.getByText('Skapa'))

      // Wait for the mutation to settle (API was called)
      await waitFor(() => {
        expect(getMockApi().createCounterparty).toHaveBeenCalled()
      })

      // Error swallowed by catch — onChange never called
      expect(onChange).not.toHaveBeenCalled()
      // Component still renders (no crash)
      expect(
        screen.getByLabelText('Nytt leverantörsnamn'),
      ).toBeInTheDocument()
    })
  })

  // ── Disabled (1) ──────────────────────────────────────────────────

  describe('Disabled', () => {
    it('5.1 disabled prop disables the search input', async () => {
      await renderWithProviders(
        <SupplierPicker value={null} onChange={vi.fn()} disabled />,
      )
      expect(screen.getByLabelText('Sök leverantör')).toBeDisabled()
    })
  })
})
