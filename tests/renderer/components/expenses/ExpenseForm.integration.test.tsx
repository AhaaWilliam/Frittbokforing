// @vitest-environment jsdom
/**
 * ExpenseForm integration tests — NO mocks of pickers or ExpenseTotals.
 * Real SupplierPicker, ExpenseLineRow, ExpenseTotals render.
 *
 * These tests exercise the full render tree. Heavier IPC mock setup required.
 * Focus: F27-kedjan (form → lines → totals → save-payload).
 *
 * Expense quantity is INTEGER by design (M130) — all tests use integer qty.
 * This is an architectural requirement, not a workaround.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, screen, waitFor, act } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ExpenseForm } from '../../../../src/renderer/components/expenses/ExpenseForm'
import { supplierFixtures } from '../__fixtures__/counterparties'
import { defaultExpenseVatCodes } from '../__fixtures__/expenses'
import { byKr } from '../../utils/format-matchers'

// ── Setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
  setupMockIpc()

  // IPC mocks for real pickers + form hooks
  mockIpcResponse('counterparty:list', { success: true, data: supplierFixtures })
  mockIpcResponse('product:list', { success: true, data: [] })
  mockIpcResponse('vat-code:list', { success: true, data: defaultExpenseVatCodes })
  mockIpcResponse('account:list', { success: true, data: [
    { account_number: '5410', name: 'Förbrukningsinventarier', is_active: true },
    { account_number: '6110', name: 'Kontorsmaterial', is_active: true },
  ] })
  mockIpcResponse('expense:save-draft', { success: true, data: { id: 1 } })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

// ── Helper ───────────────────────────────────────────────────────────

async function renderForm() {
  const onSave = vi.fn()
  const onCancel = vi.fn()

  const result = await renderWithProviders(
    <ExpenseForm onSave={onSave} onCancel={onCancel} />,
    {},
  )

  return { ...result, onSave, onCancel }
}

async function selectSupplier(name: string) {
  const searchInput = screen.getByPlaceholderText('Sök leverantör...')
  await act(async () => {
    fireEvent.focus(searchInput)
  })
  // SupplierPicker has 300ms debounce
  await act(async () => {
    vi.advanceTimersByTime(350)
  })
  await waitFor(() => {
    expect(screen.getByText(name)).toBeDefined()
  })
  await act(async () => {
    fireEvent.click(screen.getByText(name))
  })
}

// ── D1: Full-integration ─────────────────────────────────────────────

describe('ExpenseForm — full integration (no mocks)', () => {
  it('D1.1: end-to-end create med äkta pickers + äkta totals', async () => {
    await renderForm()

    // Select supplier via real SupplierPicker
    await selectSupplier('Leverantör Ett AB')

    // Fill description
    const descInput = screen.getByPlaceholderText(/kontorsmaterial/i)
    await act(async () => {
      fireEvent.change(descInput, { target: { value: 'Testutlägg' } })
    })

    // Add 2 lines
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        fireEvent.click(screen.getByText('Lägg till rad'))
      })
    }

    // Expense qty is integer by design (M130)
    // Line 0: qty=1, price=100 kr → netto 10000, VAT 2500
    // Line 1: qty=2, price=50 kr → netto 10000, VAT 2500
    const numberInputs = screen.getAllByRole('spinbutton')
    // ExpenseLineRow: qty, price per line. With 2 lines: [qty0, price0, qty1, price1]
    if (numberInputs.length >= 4) {
      await act(async () => { fireEvent.change(numberInputs[0], { target: { value: '1' } }) })
      await act(async () => { fireEvent.change(numberInputs[1], { target: { value: '100' } }) })
      await act(async () => { fireEvent.change(numberInputs[2], { target: { value: '2' } }) })
      await act(async () => { fireEvent.change(numberInputs[3], { target: { value: '50' } }) })
    }

    // Select account for each line
    for (let i = 0; i < 2; i++) {
      const accountSelect = screen.getByTestId(`expense-line-${i}-account`)
      await act(async () => {
        fireEvent.change(accountSelect, { target: { value: '5410' } })
      })
    }

    // Fill description inputs for lines
    const textInputs = screen.getAllByRole('textbox')
    // Filter to line description inputs (not the main description, not search, not notes)
    const lineDescInputs = textInputs.filter((el) => {
      const input = el as HTMLInputElement
      return input.type === 'text' && input.placeholder === ''
        && input !== descInput
    })
    for (let i = 0; i < lineDescInputs.length; i++) {
      await act(async () => {
        fireEvent.change(lineDescInputs[i], { target: { value: `Rad ${i + 1}` } })
      })
    }

    // ExpenseTotals (real component) should show:
    // Netto: 10000 + 10000 = 20000
    // VAT: 2500 + 2500 = 5000
    // Total: 25000
    await waitFor(() => {
      expect(screen.getByText(byKr(25000))).toBeDefined()
    })
  })

  it('D1.2: F27-kedja — 3 rader decimalpriser qty=1 → save-payload matchar', async () => {
    await renderForm()

    await selectSupplier('Leverantör Ett AB')

    // Fill description
    const descInput = screen.getByPlaceholderText(/kontorsmaterial/i)
    await act(async () => {
      fireEvent.change(descInput, { target: { value: 'F27-test' } })
    })

    // Add 3 lines
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        fireEvent.click(screen.getByText('Lägg till rad'))
      })
    }

    // All lines: qty=1, price=0.99 kr (expense qty is integer by design, M130)
    // Expected per-rad: net=99 öre, VAT=Math.round(99*0.25)=25 öre
    // Ackumulerad: net=297, VAT=75 (3×25, not 74), total=372
    const numberInputs = screen.getAllByRole('spinbutton')
    for (let i = 0; i < 3; i++) {
      const qtyIdx = i * 2
      const priceIdx = i * 2 + 1
      if (numberInputs[qtyIdx] && numberInputs[priceIdx]) {
        await act(async () => { fireEvent.change(numberInputs[qtyIdx], { target: { value: '1' } }) })
        await act(async () => { fireEvent.change(numberInputs[priceIdx], { target: { value: '0.99' } }) })
      }
    }

    // Select account for each line
    for (let i = 0; i < 3; i++) {
      const accountSelect = screen.getByTestId(`expense-line-${i}-account`)
      await act(async () => {
        fireEvent.change(accountSelect, { target: { value: '5410' } })
      })
    }

    // Fill line descriptions
    const textInputs = screen.getAllByRole('textbox')
    const lineDescInputs = textInputs.filter((el) => {
      const input = el as HTMLInputElement
      return input.type === 'text' && input.placeholder === ''
        && input !== descInput
    })
    for (let i = 0; i < lineDescInputs.length; i++) {
      await act(async () => {
        fireEvent.change(lineDescInputs[i], { target: { value: `Rad ${i + 1}` } })
      })
    }

    // ExpenseTotals renders real values: total = 297 + 75 = 372
    await waitFor(() => {
      expect(screen.getByText(byKr(372))).toBeDefined()
    })

    // Submit and verify payload
    await act(async () => {
      fireEvent.click(screen.getByText('Spara utkast'))
    })

    await waitFor(() => {
      expect(window.api.saveExpenseDraft).toHaveBeenCalledTimes(1)
    })

    const payload = (window.api.saveExpenseDraft as ReturnType<typeof vi.fn>).mock.calls[0][0]
    // Verify F27 chain: all lines unit_price_ore = 99
    expect(payload.lines).toHaveLength(3)
    for (const line of payload.lines) {
      expect(line.unit_price_ore).toBe(99)
    }
  })
})
