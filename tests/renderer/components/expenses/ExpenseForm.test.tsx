// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, screen, act, waitFor } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ExpenseForm } from '../../../../src/renderer/components/expenses/ExpenseForm'
import type { ExpenseLineForm } from '../../../../src/renderer/lib/form-schemas/expense'
import { supplierFixtures } from '../__fixtures__/counterparties'
import { defaultExpenseVatCodes, makeExpenseDraft } from '../__fixtures__/expenses'

// ── Mocks ────────────────────────────────────────────────────────────

// SupplierPicker mock — calls onChange with counterparty-shaped object
const { pickerState } = vi.hoisted(() => ({
  pickerState: { current: null as { id: number; name: string; default_payment_terms: number } | null },
}))

vi.mock('../../../../src/renderer/components/expenses/SupplierPicker', () => ({
  SupplierPicker: ({ onChange }: { onChange: (s: { id: number; name: string; default_payment_terms: number }) => void }) => (
    <button
      type="button"
      data-testid="supplier-picker-mock"
      onClick={() => {
        if (pickerState.current) onChange(pickerState.current)
      }}
    >
      Välj leverantör
    </button>
  ),
}))

// ExpenseLineRow mock — renders minimal row with remove button
vi.mock('../../../../src/renderer/components/expenses/ExpenseLineRow', () => ({
  ExpenseLineRow: ({ line, index, onRemove, onUpdate }: {
    line: ExpenseLineForm; index: number;
    onRemove: (i: number) => void;
    onUpdate: (i: number, u: Partial<ExpenseLineForm>) => void
  }) => (
    <tr data-testid={`line-row-${index}`}>
      <td>{line.description || `Rad ${index + 1}`}</td>
      <td data-testid={`line-price-${index}`}>{line.unit_price_kr}</td>
      <td>
        <button
          type="button"
          data-testid={`remove-line-${index}`}
          onClick={() => onRemove(index)}
        >
          Radera rad
        </button>
        <button
          type="button"
          data-testid={`update-line-${index}`}
          onClick={() => onUpdate(index, { description: 'Uppdaterad', account_number: '5410', unit_price_kr: 99.95, vat_rate: 0.25 })}
        >
          Uppdatera rad
        </button>
      </td>
    </tr>
  ),
}))

// ExpenseTotals mock — renders line count
vi.mock('../../../../src/renderer/components/expenses/ExpenseTotals', () => ({
  ExpenseTotals: ({ lines }: { lines: ExpenseLineForm[] }) => (
    <div data-testid="totals-mock">{lines.length} rader</div>
  ),
}))

// ── Setup ────────────────────────────────────────────────────────────

const supplierA = supplierFixtures.find((s) => s.id === 3)! // terms 30
const supplierB = supplierFixtures.find((s) => s.id === 4)! // terms 10

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
  pickerState.current = {
    id: supplierA.id,
    name: supplierA.name,
    default_payment_terms: supplierA.default_payment_terms,
  }
  setupMockIpc()
  mockIpcResponse('vat-code:list', defaultExpenseVatCodes)
  mockIpcResponse('account:list', [])
  mockIpcResponse('expense:save-draft', { success: true, data: makeExpenseDraft() })
  mockIpcResponse('expense:update-draft', { success: true, data: makeExpenseDraft() })
  mockIpcResponse('expense:delete-draft', { success: true, data: undefined })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

// ── Render helper ────────────────────────────────────────────────────

async function renderForm(expenseId?: number, draftOverrides?: Parameters<typeof makeExpenseDraft>[0]) {
  const draft = expenseId
    ? makeExpenseDraft({ id: expenseId, ...draftOverrides })
    : undefined

  if (expenseId && draft) {
    mockIpcResponse('expense:get-draft', draft)
  }

  const onSave = vi.fn()
  const onCancel = vi.fn()

  // For edit-mode: prefetch draft into query cache so useExpenseDraft returns it
  // immediately (mirrors real app where parent component fetches first).
  const { QueryClient } = await import('@tanstack/react-query')
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  if (expenseId && draft) {
    queryClient.setQueryData(['expense-draft', expenseId], draft)
  }

  const result = await renderWithProviders(
    <ExpenseForm expenseId={expenseId} onSave={onSave} onCancel={onCancel} />,
    { queryClient },
  )

  return { ...result, onSave, onCancel }
}

// ── C1: Rendering ────────────────────────────────────────────────────

describe('ExpenseForm — rendering', () => {
  it('C1.1: create-mode → tomma fält, ingen delete-knapp', async () => {
    await renderForm()

    expect(screen.getByText('Spara utkast')).toBeDefined()
    expect(screen.getByText('Avbryt')).toBeDefined()
    expect(screen.queryByText('Ta bort')).toBeNull()
    expect(screen.getByTestId('totals-mock')).toBeDefined()
  })

  it('C1.2: edit-mode → förifyllt, delete-knapp synlig', async () => {
    await renderForm(42)

    expect(screen.getByText('Ta bort')).toBeDefined()
    expect(screen.getByText('Spara utkast')).toBeDefined()
    // Draft description rendered
    expect(screen.getByDisplayValue('Kontorsmaterial')).toBeDefined()
  })
})

// ── C2: Cascading supplier→terms+dueDate ─────────────────────────────

describe('ExpenseForm — cascading supplier→terms+dueDate', () => {
  it('C2.1: välj supplierA (terms 30) med expenseDate 2026-01-01 → dueDate 2026-01-31', async () => {
    await renderForm()

    // expenseDate defaults to todayLocal() = 2026-01-01 (vi.setSystemTime)
    await act(async () => {
      fireEvent.click(screen.getByTestId('supplier-picker-mock'))
    })

    expect(screen.getByDisplayValue('2026-01-31')).toBeDefined()
  })

  it('C2.2: byt supplierA → supplierB (terms 10) → dueDate 2026-01-11', async () => {
    await renderForm()

    // First select supplierA
    await act(async () => {
      fireEvent.click(screen.getByTestId('supplier-picker-mock'))
    })
    expect(screen.getByDisplayValue('2026-01-31')).toBeDefined()

    // Switch to supplierB (terms 10)
    pickerState.current = {
      id: supplierB.id,
      name: supplierB.name,
      default_payment_terms: supplierB.default_payment_terms,
    }
    await act(async () => {
      fireEvent.click(screen.getByTestId('supplier-picker-mock'))
    })

    expect(screen.getByDisplayValue('2026-01-11')).toBeDefined()
  })

  it('C2.3: manuell dueDate-override + supplierbyte → override skrivs över', async () => {
    await renderForm()

    // Select supplier → dueDate cascaded
    await act(async () => {
      fireEvent.click(screen.getByTestId('supplier-picker-mock'))
    })
    expect(screen.getByDisplayValue('2026-01-31')).toBeDefined()

    // dueDate is readOnly, but cascading from supplier always overrides
    // Switch supplier to confirm cascade always wins
    pickerState.current = {
      id: supplierB.id,
      name: supplierB.name,
      default_payment_terms: supplierB.default_payment_terms,
    }
    await act(async () => {
      fireEvent.click(screen.getByTestId('supplier-picker-mock'))
    })
    // Dokumenterar avsiktligt beteende: cascading alltid, ingen dirty-check
    expect(screen.getByDisplayValue('2026-01-11')).toBeDefined()
  })
})

// ── C3: Cascading datum→dueDate ──────────────────────────────────────

describe('ExpenseForm — cascading datum→dueDate', () => {
  it('C3.1: kund vald, ändra expenseDate → dueDate uppdateras', async () => {
    await renderForm()

    // Select supplier first (terms 30)
    await act(async () => {
      fireEvent.click(screen.getByTestId('supplier-picker-mock'))
    })
    expect(screen.getByDisplayValue('2026-01-31')).toBeDefined()

    // Change expenseDate to 2026-02-01
    const dateInput = screen.getByDisplayValue('2026-01-01')
    await act(async () => {
      fireEvent.change(dateInput, { target: { value: '2026-02-01' } })
    })

    // dueDate: 2026-02-01 + 30 = 2026-03-03
    expect(screen.getByDisplayValue('2026-03-03')).toBeDefined()
  })

  it('C3.2: ingen kund, ändra expenseDate → dueDate uppdateras (default terms 30)', async () => {
    await renderForm()

    // Don't select supplier — paymentTerms defaults to 30
    const dateInput = screen.getByDisplayValue('2026-01-01')
    await act(async () => {
      fireEvent.change(dateInput, { target: { value: '2026-03-01' } })
    })

    // dueDate: 2026-03-01 + 30 = 2026-03-31
    expect(screen.getByDisplayValue('2026-03-31')).toBeDefined()
  })
})

// ── C4: Cascading paymentTerms-handler (expense-specifik) ────────────

describe('ExpenseForm — cascading paymentTerms', () => {
  it('C4.1: välj supplierA (terms 30), ändra paymentTerms manuellt till 15 → dueDate uppdateras', async () => {
    await renderForm()

    await act(async () => {
      fireEvent.click(screen.getByTestId('supplier-picker-mock'))
    })
    expect(screen.getByDisplayValue('2026-01-31')).toBeDefined()

    // Change paymentTerms to 15 via select
    const termsSelect = screen.getByDisplayValue('30 dagar')
    await act(async () => {
      fireEvent.change(termsSelect, { target: { value: '15' } })
    })

    // dueDate: 2026-01-01 + 15 = 2026-01-16
    expect(screen.getByDisplayValue('2026-01-16')).toBeDefined()
  })

  it('C4.2: paymentTerms-ändring utan leverantör → dueDate uppdateras (expenseDate + nya terms)', async () => {
    await renderForm()

    // Don't select supplier. Change terms to 60
    const termsSelect = screen.getByDisplayValue('30 dagar')
    await act(async () => {
      fireEvent.change(termsSelect, { target: { value: '60' } })
    })

    // dueDate: 2026-01-01 + 60 = 2026-03-02
    expect(screen.getByDisplayValue('2026-03-02')).toBeDefined()
  })
})

// ── C5: Cascading edit-mode initial render ───────────────────────────

describe('ExpenseForm — cascading edit-mode', () => {
  it('C5.1: edit-mode med draft där due_date ≠ expense_date + terms → draft-värden bevaras', async () => {
    // Draft has custom due_date that doesn't match expense_date + payment_terms
    await renderForm(42, {
      expense_date: '2025-12-15',
      due_date: '2026-02-28', // Custom, not 2025-12-15 + 30 = 2026-01-14
      payment_terms: 30,
    })

    // Draft's custom due_date should be preserved, not recalculated
    expect(screen.getByDisplayValue('2026-02-28')).toBeDefined()
  })
})

// ── C6: Cascading DST-edge ──────────────────────────────────────────

describe('ExpenseForm — cascading DST-edge', () => {
  it('C6.1: 2026-03-29 (DST-start) + 30 dagar → 2026-04-28', async () => {
    vi.setSystemTime(new Date('2026-03-29T10:00:00+01:00'))

    await renderForm()

    // Select supplier with terms 30
    await act(async () => {
      fireEvent.click(screen.getByTestId('supplier-picker-mock'))
    })

    // expenseDate = 2026-03-29, terms = 30 → dueDate = 2026-04-28
    expect(screen.getByDisplayValue('2026-04-28')).toBeDefined()
  })
})

// ── C7: Line-hantering ──────────────────────────────────────────────

describe('ExpenseForm — line-hantering', () => {
  it('C7.1: lägg till rad → totals-mock visar +1', async () => {
    await renderForm()

    // Initially 0 lines
    expect(screen.getByTestId('totals-mock').textContent).toBe('0 rader')

    // Click add line
    await act(async () => {
      fireEvent.click(screen.getByText('Lägg till rad'))
    })

    expect(screen.getByTestId('totals-mock').textContent).toBe('1 rader')
  })

  it('C7.2: ta bort rad → totals-mock -1', async () => {
    await renderForm()

    // Add two lines
    await act(async () => {
      fireEvent.click(screen.getByText('Lägg till rad'))
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Lägg till rad'))
    })
    expect(screen.getByTestId('totals-mock').textContent).toBe('2 rader')

    // Remove first line
    await act(async () => {
      fireEvent.click(screen.getByTestId('remove-line-0'))
    })

    expect(screen.getByTestId('totals-mock').textContent).toBe('1 rader')
  })

  it('C7.3: uppdatera rad → line-state uppdateras', async () => {
    await renderForm()

    // Add a line
    await act(async () => {
      fireEvent.click(screen.getByText('Lägg till rad'))
    })

    // Update line via mock button
    await act(async () => {
      fireEvent.click(screen.getByTestId('update-line-0'))
    })

    // Line description should be updated
    expect(screen.getByText('Uppdaterad')).toBeDefined()
    // Price updated to 99.95
    expect(screen.getByTestId('line-price-0').textContent).toBe('99.95')
  })
})

// ── C8: Validation ──────────────────────────────────────────────────

describe('ExpenseForm — validation', () => {
  it('C8.1: submit utan supplier → valideringsfel', async () => {
    await renderForm()

    // Add a line so lines validation passes
    await act(async () => {
      fireEvent.click(screen.getByText('Lägg till rad'))
    })

    // Fill description
    const descInput = screen.getByPlaceholderText(/kontorsmaterial/i)
    await act(async () => {
      fireEvent.change(descInput, { target: { value: 'Test' } })
    })

    // Submit without selecting supplier
    await act(async () => {
      fireEvent.click(screen.getByText('Spara utkast'))
    })

    expect(screen.getByText('Välj en leverantör')).toBeDefined()
    expect(window.api.saveExpenseDraft).not.toHaveBeenCalled()
  })

  it('C8.2: submit utan expenseDate → valideringsfel, IPC ej anropad + felmeddelande renderas', async () => {
    await renderForm()

    // Select supplier
    await act(async () => {
      fireEvent.click(screen.getByTestId('supplier-picker-mock'))
    })

    // Clear date
    const dateInput = screen.getByDisplayValue('2026-01-01')
    await act(async () => {
      fireEvent.change(dateInput, { target: { value: '' } })
    })

    // Fill description and add line
    const descInput = screen.getByPlaceholderText(/kontorsmaterial/i)
    await act(async () => {
      fireEvent.change(descInput, { target: { value: 'Test' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Lägg till rad'))
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Spara utkast'))
    })

    // F45: validation blocks submit AND error message is rendered in UI
    expect(window.api.saveExpenseDraft).not.toHaveBeenCalled()
    expect(screen.getByTestId('expense-date-error')).toBeDefined()
    expect(screen.getByTestId('expense-date-error').textContent).toMatch(/datum/i)
  })

  it('C8.2b: expenseDate-felmeddelande försvinner när datum fylls i', async () => {
    await renderForm()

    // Select supplier, clear date, fill description, add line
    await act(async () => {
      fireEvent.click(screen.getByTestId('supplier-picker-mock'))
    })
    const dateInput = screen.getByDisplayValue('2026-01-01')
    await act(async () => {
      fireEvent.change(dateInput, { target: { value: '' } })
    })
    const descInput = screen.getByPlaceholderText(/kontorsmaterial/i)
    await act(async () => {
      fireEvent.change(descInput, { target: { value: 'Test' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Lägg till rad'))
    })

    // Submit without date → error appears
    await act(async () => {
      fireEvent.click(screen.getByText('Spara utkast'))
    })
    expect(screen.getByTestId('expense-date-error')).toBeDefined()

    // Fill in date → setField clears field error
    await act(async () => {
      fireEvent.change(dateInput, { target: { value: '2026-03-15' } })
    })
    expect(screen.queryByTestId('expense-date-error')).toBeNull()
  })

  it('C8.2c: expenseDate-felmeddelande har role=alert och aria-koppling', async () => {
    await renderForm()

    // Select supplier, clear date, fill description, add line
    await act(async () => {
      fireEvent.click(screen.getByTestId('supplier-picker-mock'))
    })
    const dateInput = screen.getByDisplayValue('2026-01-01')
    await act(async () => {
      fireEvent.change(dateInput, { target: { value: '' } })
    })
    const descInput = screen.getByPlaceholderText(/kontorsmaterial/i)
    await act(async () => {
      fireEvent.change(descInput, { target: { value: 'Test' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Lägg till rad'))
    })

    // Submit without date → error appears
    await act(async () => {
      fireEvent.click(screen.getByText('Spara utkast'))
    })

    const errorEl = screen.getByTestId('expense-date-error')
    expect(errorEl.getAttribute('role')).toBe('alert')

    // Input ↔ error-koppling via aria-describedby
    const input = document.getElementById('expense-date')!
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe('expense-date-error')
    expect(errorEl.id).toBe('expense-date-error')
  })

  it('C8.3: submit utan description → valideringsfel', async () => {
    await renderForm()

    // Select supplier, add line, but leave description empty
    await act(async () => {
      fireEvent.click(screen.getByTestId('supplier-picker-mock'))
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Lägg till rad'))
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Spara utkast'))
    })

    expect(screen.getByText('Ange en beskrivning')).toBeDefined()
    expect(window.api.saveExpenseDraft).not.toHaveBeenCalled()
  })

  it('C8.4: submit med tom lines → valideringsfel', async () => {
    await renderForm()

    // Select supplier
    await act(async () => {
      fireEvent.click(screen.getByTestId('supplier-picker-mock'))
    })

    // Fill description
    const descInput = screen.getByPlaceholderText(/kontorsmaterial/i)
    await act(async () => {
      fireEvent.change(descInput, { target: { value: 'Test' } })
    })

    // Submit without adding lines
    await act(async () => {
      fireEvent.click(screen.getByText('Spara utkast'))
    })

    expect(screen.getByText('Lägg till minst en kostnadsrad')).toBeDefined()
    expect(window.api.saveExpenseDraft).not.toHaveBeenCalled()
  })
})

// ── C9: Save-kontrakt ───────────────────────────────────────────────

describe('ExpenseForm — save-kontrakt', () => {
  it('C9.1: create-mode → expense:save-draft anropas med korrekt payload', async () => {
    await renderForm()

    // Select supplier
    await act(async () => {
      fireEvent.click(screen.getByTestId('supplier-picker-mock'))
    })

    // Fill description
    const descInput = screen.getByPlaceholderText(/kontorsmaterial/i)
    await act(async () => {
      fireEvent.change(descInput, { target: { value: 'Kontorsmaterial' } })
    })

    // Add a line and update it with valid values (description + account + price)
    await act(async () => {
      fireEvent.click(screen.getByText('Lägg till rad'))
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('update-line-0'))
    })

    // Submit
    await act(async () => {
      fireEvent.click(screen.getByText('Spara utkast'))
    })

    expect(window.api.saveExpenseDraft).toHaveBeenCalledTimes(1)
    const payload = (window.api.saveExpenseDraft as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(payload.counterparty_id).toBe(supplierA.id)
    expect(payload.description).toBe('Kontorsmaterial')
    // unit_price_ore: toOre(99.95) = 9995
    expect(payload.lines[0].unit_price_ore).toBe(9995)
    expect(payload.fiscal_year_id).toBe(1)
  })

  it('C9.2: edit-mode save → expense:update-draft med draft.id', async () => {
    await renderForm(42)

    // Submit existing draft
    await act(async () => {
      fireEvent.click(screen.getByText('Spara utkast'))
    })

    expect(window.api.updateExpenseDraft).toHaveBeenCalledTimes(1)
    const payload = (window.api.updateExpenseDraft as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(payload.id).toBe(42)
  })
})

// ── C10: Delete-flow ────────────────────────────────────────────────

describe('ExpenseForm — delete-flow', () => {
  it('C10.1: delete confirm=true → expense:delete-draft + onSave() + onCancel not-called', async () => {
    const { onSave, onCancel } = await renderForm(42)

    // Click "Ta bort" to open confirm dialog
    await act(async () => {
      fireEvent.click(screen.getByText('Ta bort'))
    })

    // Confirm dialog should appear
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    // Click confirm button in dialog
    await act(async () => {
      fireEvent.click(screen.getAllByText('Ta bort').find(
        (el) => el.closest('[role="alertdialog"]'),
      )!)
    })

    await waitFor(() => {
      expect(window.api.deleteExpenseDraft).toHaveBeenCalledTimes(1)
      expect(onSave).toHaveBeenCalledTimes(1)
      expect(onCancel).not.toHaveBeenCalled()
    })
  })

  it('C10.2: delete confirm=false → IPC ej anropad, onSave ej anropad', async () => {
    const { onSave } = await renderForm(42)

    // Click "Ta bort" to open confirm dialog
    await act(async () => {
      fireEvent.click(screen.getByText('Ta bort'))
    })

    // Confirm dialog should appear
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    // Click cancel in the dialog (not the form's Avbryt)
    const dialog = screen.getByRole('alertdialog')
    await act(async () => {
      fireEvent.click(dialog.querySelector('button')!)
    })

    // Dialog closed, no IPC call
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(window.api.deleteExpenseDraft).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('C10.3: delete-knapp ej synlig i create-mode', async () => {
    await renderForm()

    expect(screen.queryByText('Ta bort')).toBeNull()
  })
})
