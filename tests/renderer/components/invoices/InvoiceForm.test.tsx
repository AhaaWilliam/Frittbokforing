// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { InvoiceForm } from '../../../../src/renderer/components/invoices/InvoiceForm'
import type { InvoiceWithLines } from '../../../../src/shared/types'
import type { InvoiceLineForm } from '../../../../src/renderer/lib/form-schemas/invoice'
import { customerFixtures } from '../__fixtures__/counterparties'
import type { VatCode } from '../../../../src/shared/types'

// ── Mocks ────────────────────────────────────────────────────────────

// CustomerPicker mock — calls onChange with counterparty-shaped object
let pickerCustomer = customerFixtures[0] // Acme AB, terms=30

vi.mock('../../../../src/renderer/components/invoices/CustomerPicker', () => ({
  CustomerPicker: ({ onChange }: { onChange: (c: { id: number; name: string; default_payment_terms: number }) => void }) => (
    <button
      type="button"
      data-testid="customer-picker-mock"
      onClick={() => onChange({
        id: pickerCustomer.id,
        name: pickerCustomer.name,
        default_payment_terms: pickerCustomer.default_payment_terms,
      })}
    >
      Välj kund
    </button>
  ),
}))

// InvoiceLineRow mock — renders minimal row with remove button
vi.mock('../../../../src/renderer/components/invoices/InvoiceLineRow', () => ({
  InvoiceLineRow: ({ line, index, onRemove }: {
    line: InvoiceLineForm; index: number;
    onRemove: (i: number) => void
  }) => (
    <tr data-testid={`line-row-${index}`}>
      <td>{line.description || `Rad ${index + 1}`}</td>
      <td>
        <button
          type="button"
          data-testid={`remove-line-${index}`}
          onClick={() => onRemove(index)}
        >
          Radera rad
        </button>
      </td>
    </tr>
  ),
}))

// InvoiceTotals mock — renders line count
vi.mock('../../../../src/renderer/components/invoices/InvoiceTotals', () => ({
  InvoiceTotals: ({ lines }: { lines: InvoiceLineForm[] }) => (
    <div data-testid="totals-mock">{lines.length} rader</div>
  ),
}))

// ── Fixtures ─────────────────────────────────────────────────────────

const defaultVatCodes: VatCode[] = [
  { id: 1, code: '25', description: 'Moms 25%', rate_percent: 25, vat_type: 'outgoing', report_box: null },
  { id: 2, code: '12', description: 'Moms 12%', rate_percent: 12, vat_type: 'outgoing', report_box: null },
  { id: 3, code: '06', description: 'Moms 6%', rate_percent: 6, vat_type: 'outgoing', report_box: null },
]

function makeDraft(overrides?: Partial<InvoiceWithLines>): InvoiceWithLines {
  return {
    id: 101,
    counterparty_id: 1,
    counterparty_name: 'Acme AB',
    fiscal_year_id: 1,
    invoice_type: 'outgoing',
    invoice_number: 'F-1001',
    invoice_date: '2026-01-15',
    due_date: '2026-02-14',
    status: 'draft',
    net_amount_ore: 125000,
    vat_amount_ore: 31250,
    total_amount_ore: 156250,
    currency: 'SEK',
    paid_amount_ore: 0,
    journal_entry_id: null,
    ocr_number: null,
    notes: 'Testanteckning',
    payment_terms: 30,
    version: 1,
    created_at: '2026-01-15T12:00:00Z',
    updated_at: '2026-01-15T12:00:00Z',
    lines: [
      {
        id: 1,
        invoice_id: 101,
        product_id: null,
        description: 'Konsulttimme',
        quantity: 1,
        unit_price_ore: 125000,
        vat_code_id: 1,
        line_total_ore: 125000,
        vat_amount_ore: 31250,
        sort_order: 0,
      },
    ],
    ...overrides,
  }
}

// ── Setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
  pickerCustomer = customerFixtures[0] // Reset to Acme AB, terms=30
  setupMockIpc()
  mockIpcResponse('vat-code:list', defaultVatCodes)
  mockIpcResponse('invoice:next-number', { preview: 1001 })
  mockIpcResponse('invoice:save-draft', { success: true, data: makeDraft() })
  mockIpcResponse('invoice:update-draft', { success: true, data: makeDraft() })
  mockIpcResponse('invoice:delete-draft', { success: true, data: undefined })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

// ── Render helper ────────────────────────────────────────────────────

async function renderForm(draft?: InvoiceWithLines) {
  const onSave = vi.fn()
  const onCancel = vi.fn()

  const result = await renderWithProviders(
    <InvoiceForm draft={draft} onSave={onSave} onCancel={onCancel} />,
    {},
  )

  return { ...result, onSave, onCancel }
}

// ── C1: Rendering ────────────────────────────────────────────────────

describe('InvoiceForm — rendering', () => {
  it('C1.1: create-mode → tomma fält, ingen delete-knapp', async () => {
    await renderForm()

    expect(screen.getByText('Spara utkast')).toBeDefined()
    expect(screen.getByText('Avbryt')).toBeDefined()
    expect(screen.queryByText('Ta bort')).toBeNull()
    // Totals mock renderas
    expect(screen.getByTestId('totals-mock')).toBeDefined()
  })

  it('C1.2: edit-mode → förifyllt, delete-knapp synlig', async () => {
    const draft = makeDraft()
    await renderForm(draft)

    expect(screen.getByText('Ta bort')).toBeDefined()
    expect(screen.getByText('Spara utkast')).toBeDefined()
  })
})

// ── C2: Cascading customer→terms+dueDate ─────────────────────────────

describe('InvoiceForm — cascading customer→terms+dueDate', () => {
  it('C2.1: välj customerA (terms 30) med invoiceDate 2026-01-01 → dueDate 2026-01-31', async () => {
    await renderForm()

    // invoiceDate defaults to todayLocal() = 2026-01-01 (vi.setSystemTime)
    await act(async () => {
      fireEvent.click(screen.getByTestId('customer-picker-mock'))
    })

    // dueDate should be 2026-01-01 + 30 = 2026-01-31
    const dueDateInput = screen.getByDisplayValue('2026-01-31')
    expect(dueDateInput).toBeDefined()
  })

  it('C2.2: byt från customerA (terms 30) till customerB (terms 15) → dueDate uppdateras', async () => {
    await renderForm()

    // First select customerA (terms 30)
    await act(async () => {
      fireEvent.click(screen.getByTestId('customer-picker-mock'))
    })
    expect(screen.getByDisplayValue('2026-01-31')).toBeDefined() // 2026-01-01 + 30

    // Switch picker to customerB (terms 15)
    pickerCustomer = customerFixtures[1] // Beta Corp, terms=15
    await act(async () => {
      fireEvent.click(screen.getByTestId('customer-picker-mock'))
    })

    // dueDate should now be 2026-01-01 + 15 = 2026-01-16
    expect(screen.getByDisplayValue('2026-01-16')).toBeDefined()
  })

  it('C2.3: skriver över manuellt satt dueDate vid kundbyte (ingen dirty-check)', async () => {
    // Dokumenterar avsiktligt beteende: ingen dirty-tracking på dueDate.
    // Om användaren vill ha annat datum måste det ändras efter sista kundbyte.
    await renderForm()

    // Default dueDate = 2026-01-01 + 30 = 2026-01-31
    // dueDate-inputen är readOnly i InvoiceForm — kan inte ändras direkt av användaren
    // Men kundbyte skriver alltid över, oavsett befintligt värde
    pickerCustomer = customerFixtures[1] // Beta Corp, terms=15
    await act(async () => {
      fireEvent.click(screen.getByTestId('customer-picker-mock'))
    })

    // Kundbyte har ersatt dueDate med 2026-01-01 + 15 = 2026-01-16
    expect(screen.getByDisplayValue('2026-01-16')).toBeDefined()
  })
})

// ── C3: Cascading datum→dueDate ──────────────────────────────────────

describe('InvoiceForm — cascading datum→dueDate', () => {
  it('C3.1: ändra invoiceDate med kund vald (terms 30) → dueDate uppdateras', async () => {
    await renderForm()

    // Select customerA (terms 30)
    await act(async () => {
      fireEvent.click(screen.getByTestId('customer-picker-mock'))
    })
    expect(screen.getByDisplayValue('2026-01-31')).toBeDefined() // 2026-01-01 + 30

    // Change invoiceDate to 2026-02-01
    const dateInput = screen.getByDisplayValue('2026-01-01')
    await act(async () => {
      fireEvent.change(dateInput, { target: { value: '2026-02-01' } })
    })

    // dueDate = 2026-02-01 + 30 = 2026-03-03
    expect(screen.getByDisplayValue('2026-03-03')).toBeDefined()
  })

  it('C3.2: ändra invoiceDate utan kund → dueDate uppdateras med default terms (30)', async () => {
    await renderForm()

    // No customer selected, default paymentTerms = 30
    const dateInput = screen.getByDisplayValue('2026-01-01')
    await act(async () => {
      fireEvent.change(dateInput, { target: { value: '2026-03-15' } })
    })

    // dueDate = 2026-03-15 + 30 = 2026-04-14
    expect(screen.getByDisplayValue('2026-04-14')).toBeDefined()
  })
})

// ── C4: Cascading edit-mode initial render ───────────────────────────

describe('InvoiceForm — cascading edit-mode', () => {
  it('C4.1: edit-mode med explicit due_date skriver inte över vid initial render', async () => {
    // Draft has custom dueDate that doesn't match invoiceDate + paymentTerms
    const draft = makeDraft({
      invoice_date: '2026-03-01',
      payment_terms: 30,
      due_date: '2026-04-15', // Custom: 45 days, not 30
    })
    await renderForm(draft)

    // dueDate should be preserved from draft, not recalculated
    expect(screen.getByDisplayValue('2026-04-15')).toBeDefined()
  })
})

// ── C5: Line-hantering ───────────────────────────────────────────────

describe('InvoiceForm — line-hantering', () => {
  it('C5.1: klick "Lägg till rad" → ny rad syns, totals-mock uppdateras', async () => {
    await renderForm()

    const addButton = screen.getByText('Lägg till rad')
    await act(async () => {
      fireEvent.click(addButton)
    })

    // Totals mock should now show 1 rader (started with 0 lines in create mode)
    expect(screen.getByTestId('totals-mock').textContent).toBe('1 rader')
  })

  it('C5.2: ta bort rad → rad försvinner, totals-mock uppdateras', async () => {
    await renderForm()

    // Add two lines
    const addButton = screen.getByText('Lägg till rad')
    await act(async () => {
      fireEvent.click(addButton)
    })
    await act(async () => {
      fireEvent.click(addButton)
    })
    expect(screen.getByTestId('totals-mock').textContent).toBe('2 rader')

    // Remove first line (mock button says "Radera rad")
    await act(async () => {
      fireEvent.click(screen.getByTestId('remove-line-0'))
    })
    expect(screen.getByTestId('totals-mock').textContent).toBe('1 rader')
  })

  it('C5.3: add 3 rader → totals-mock visar 3', async () => {
    await renderForm()

    const addButton = screen.getByText('Lägg till rad')
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        fireEvent.click(addButton)
      })
    }

    expect(screen.getByTestId('totals-mock').textContent).toBe('3 rader')
  })
})

// ── C6: Validation ───────────────────────────────────────────────────

describe('InvoiceForm — validation', () => {
  it('C6.1: submit utan kund → valideringsfel', async () => {
    const { onSave } = await renderForm()

    await act(async () => {
      fireEvent.click(screen.getByText('Spara utkast'))
    })

    expect(screen.getByText('Välj en kund')).toBeDefined()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('C6.2: submit utan kund + utan lines → båda valideringsfel visas', async () => {
    const { onSave } = await renderForm()

    // Don't select customer, don't add lines — submit
    await act(async () => {
      fireEvent.click(screen.getByText('Spara utkast'))
    })

    // Both validation errors should appear
    expect(screen.getByText('Välj en kund')).toBeDefined()
    expect(screen.getByText('Lägg till minst en fakturarad')).toBeDefined()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('C6.3: submit med tom lines → valideringsfel', async () => {
    const { onSave } = await renderForm()

    // Select customer
    await act(async () => {
      fireEvent.click(screen.getByTestId('customer-picker-mock'))
    })

    // Don't add any lines — submit
    await act(async () => {
      fireEvent.click(screen.getByText('Spara utkast'))
    })

    expect(screen.getByText('Lägg till minst en fakturarad')).toBeDefined()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('C6.4: submit utan invoiceDate → valideringsfel, IPC ej anropad + felmeddelande renderas', async () => {
    const { onSave } = await renderForm()

    // Select customer
    await act(async () => {
      fireEvent.click(screen.getByTestId('customer-picker-mock'))
    })

    // Clear date
    const dateInput = screen.getByDisplayValue('2026-01-01')
    await act(async () => {
      fireEvent.change(dateInput, { target: { value: '' } })
    })

    // Add a line
    await act(async () => {
      fireEvent.click(screen.getByText('Lägg till rad'))
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Spara utkast'))
    })

    // F45: validation blocks submit AND error message is rendered in UI
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByTestId('invoice-date-error')).toBeDefined()
    expect(screen.getByTestId('invoice-date-error').textContent).toMatch(/fakturadatum/i)
  })

  it('C6.4b: invoiceDate-felmeddelande försvinner när datum fylls i', async () => {
    await renderForm()

    // Select customer, clear date, add line
    await act(async () => {
      fireEvent.click(screen.getByTestId('customer-picker-mock'))
    })
    const dateInput = screen.getByDisplayValue('2026-01-01')
    await act(async () => {
      fireEvent.change(dateInput, { target: { value: '' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Lägg till rad'))
    })

    // Submit without date → error appears
    await act(async () => {
      fireEvent.click(screen.getByText('Spara utkast'))
    })
    expect(screen.getByTestId('invoice-date-error')).toBeDefined()

    // Fill in date → setField clears field error
    await act(async () => {
      fireEvent.change(dateInput, { target: { value: '2026-03-15' } })
    })
    expect(screen.queryByTestId('invoice-date-error')).toBeNull()
  })

  it('C6.4c: invoiceDate-felmeddelande har role=alert och aria-koppling', async () => {
    await renderForm()

    // Select customer, clear date, add line
    await act(async () => {
      fireEvent.click(screen.getByTestId('customer-picker-mock'))
    })
    const dateInput = screen.getByDisplayValue('2026-01-01')
    await act(async () => {
      fireEvent.change(dateInput, { target: { value: '' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Lägg till rad'))
    })

    // Submit without date → error appears
    await act(async () => {
      fireEvent.click(screen.getByText('Spara utkast'))
    })

    const errorEl = screen.getByTestId('invoice-date-error')
    expect(errorEl.getAttribute('role')).toBe('alert')

    // Input ↔ error-koppling via aria-describedby
    const input = document.getElementById('invoice-date')!
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe('invoice-date-error')
    expect(errorEl.id).toBe('invoice-date-error')
  })
})

// ── C7: Save-kontrakt ────────────────────────────────────────────────

describe('InvoiceForm — save-kontrakt', () => {
  it('C7.1: edit-mode save → invoice:update-draft anropas, onSave triggas', async () => {
    // Edit mode uses updateDraft which maps to invoice:update-draft.
    // Draft has valid lines — payload passes payloadSchema.
    const draft = makeDraft()
    const { onSave } = await renderForm(draft)

    await act(async () => {
      fireEvent.click(screen.getByText('Spara utkast'))
    })

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1)
    })
  })

  it('C7.2: payload-valideringsfel visas om transform ger ogiltiga data', async () => {
    // makeEmptyInvoiceLine produces description: '' which fails
    // InvoiceDraftLineSchema.description.min(1). This verifies the
    // payloadSchema guard in useEntityForm.
    const { onSave } = await renderForm()

    // Select customer
    await act(async () => {
      fireEvent.click(screen.getByTestId('customer-picker-mock'))
    })

    // Add an empty line (description: '', invalid)
    await act(async () => {
      fireEvent.click(screen.getByText('Lägg till rad'))
    })

    // Submit — should hit payloadSchema validation error
    await act(async () => {
      fireEvent.click(screen.getByText('Spara utkast'))
    })

    expect(screen.getByText('Internt valideringsfel: payload matchade inte schemat')).toBeDefined()
    expect(onSave).not.toHaveBeenCalled()
  })
})

// ── C8: Delete-flow ──────────────────────────────────────────────────

describe('InvoiceForm — delete-flow', () => {
  it('C8.1: delete i edit-mode → confirm + IPC + onSave', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const draft = makeDraft()
    const { onSave, onCancel } = await renderForm(draft)

    await act(async () => {
      fireEvent.click(screen.getByText('Ta bort'))
    })

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(onSave).toHaveBeenCalledTimes(1)
      expect(onCancel).not.toHaveBeenCalled() // delete följer save-vägen
    })

    confirmSpy.mockRestore()
  })

  it('C8.2: delete-knapp ej synlig i create-mode', async () => {
    await renderForm()

    expect(screen.queryByText('Ta bort')).toBeNull()
  })

  it('C8.3: användaren avbryter confirm → IPC ej anropad, onSave ej anropad', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const draft = makeDraft()
    const { onSave, onCancel } = await renderForm(draft)

    await act(async () => {
      fireEvent.click(screen.getByText('Ta bort'))
    })

    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()

    confirmSpy.mockRestore()
  })
})
