// @vitest-environment jsdom
/**
 * InvoiceForm integration tests — NO mocks of pickers or InvoiceTotals.
 * Real CustomerPicker, InvoiceLineRow, ArticlePicker, InvoiceTotals render.
 *
 * These tests exercise the full render tree. Heavier IPC mock setup required.
 * Focus: F27-kedjan (form → lines → totals → save-payload).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, screen, waitFor, act } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { InvoiceForm } from '../../../../src/renderer/components/invoices/InvoiceForm'
import { customerFixtures } from '../__fixtures__/counterparties'
import { formatKr } from '../../../../src/renderer/lib/format'
import type { VatCode, InvoiceWithLines } from '../../../../src/shared/types'

// ── Fixtures ─────────────────────────────────────────────────────────

const defaultVatCodes: VatCode[] = [
  { id: 1, code: '25', description: 'Moms 25%', rate_percent: 25, vat_type: 'outgoing', report_box: null },
  { id: 2, code: '12', description: 'Moms 12%', rate_percent: 12, vat_type: 'outgoing', report_box: null },
  { id: 3, code: '06', description: 'Moms 6%', rate_percent: 6, vat_type: 'outgoing', report_box: null },
  { id: 4, code: '00', description: 'Momsfri', rate_percent: 0, vat_type: 'exempt', report_box: null },
]

function makeSaveDraftResponse(): { success: true; data: InvoiceWithLines } {
  return {
    success: true,
    data: {
      id: 101,
      counterparty_id: 1,
      counterparty_name: 'Acme AB',
      fiscal_year_id: 1,
      invoice_type: 'outgoing',
      invoice_number: 'F-1001',
      invoice_date: '2026-01-01',
      due_date: '2026-01-31',
      status: 'draft',
      net_amount_ore: 0,
      vat_amount_ore: 0,
      total_amount_ore: 0,
      currency: 'SEK',
      paid_amount_ore: 0,
      journal_entry_id: null,
      ocr_number: null,
      notes: null,
      payment_terms: 30,
      version: 1,
      created_at: '2026-01-01T12:00:00Z',
      updated_at: '2026-01-01T12:00:00Z',
      lines: [],
    },
  }
}

// ── Setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
  setupMockIpc()

  // IPC mocks for real pickers + form hooks
  mockIpcResponse('counterparty:list', customerFixtures)
  mockIpcResponse('product:list', []) // No products in picker for simplicity
  mockIpcResponse('vat-code:list', defaultVatCodes)
  mockIpcResponse('invoice:next-number', { preview: 1001 })
  mockIpcResponse('invoice:save-draft', makeSaveDraftResponse())
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
    <InvoiceForm onSave={onSave} onCancel={onCancel} />,
    { axeCheck: false },
  )

  return { ...result, onSave, onCancel }
}

/** NBSP-safe text matcher for formatKr output */
function byKr(ore: number) {
  const formatted = formatKr(ore)
  const escaped = formatted.replace(/[\s\u00a0]/g, '[\\s\\u00a0]')
  return new RegExp(`^${escaped}$`)
}

// ── D1: Full-integration ─────────────────────────────────────────────

describe('InvoiceForm — full integration (no mocks)', () => {
  it('D1.1: F27-kedja — reella totaler visas med äkta InvoiceTotals', async () => {
    await renderForm()

    // Select customer via real CustomerPicker: focus → dropdown → click
    const searchInput = screen.getByPlaceholderText('Sök kund...')
    await act(async () => {
      fireEvent.focus(searchInput)
    })

    // CustomerPicker has 300ms debounce — advance timers
    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    // Wait for customer list to appear
    await waitFor(() => {
      expect(screen.getByText('Acme AB')).toBeDefined()
    })

    // Select Acme AB
    await act(async () => {
      fireEvent.click(screen.getByText('Acme AB'))
    })

    // Add a line and fill it with valid data via the inputs
    await act(async () => {
      fireEvent.click(screen.getByText('Lägg till rad'))
    })

    // Find the description input and fill it
    // InvoiceLineRow renders inputs — look for the description text input
    const descInputs = screen.getAllByRole('textbox')
    // The last added textbox that isn't the notes textarea or search
    // Find by placeholder or by inspecting the row
    const rows = screen.getAllByRole('row')
    // The line row should have input fields
    // Let's fill in via more targeted selectors
    const descInput = descInputs.find(
      (el) => el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'text'
        && el !== searchInput
    )

    if (descInput) {
      await act(async () => {
        fireEvent.change(descInput, { target: { value: 'Konsulttimme' } })
      })
    }

    // Find price input (type=number)
    const numberInputs = screen.getAllByRole('spinbutton')
    // First spinbutton in the line row is typically quantity, second is price
    if (numberInputs.length >= 2) {
      // Set quantity
      await act(async () => {
        fireEvent.change(numberInputs[0], { target: { value: '1' } })
      })
      // Set price (kr)
      await act(async () => {
        fireEvent.change(numberInputs[1], { target: { value: '0.99' } })
      })
    }

    // InvoiceTotals should now show real totals (not mock)
    // With qty=1, price_kr=0.99, vat=0.25:
    // netto = toOre(1 * 0.99) = 99 öre
    // VAT = Math.round(99 * 0.25) = 25 öre
    // total = 124 öre
    // Note: 0,99 kr appears in both line-row sum AND Netto, so check total (unique)
    await waitFor(() => {
      expect(screen.getByText(byKr(124))).toBeDefined() // Total (unique)
    })
  })

  it('D1.2: F27-kedja — 3 identiska rader 0.99 kr → ackumulerad VAT = 75 öre', async () => {
    await renderForm()

    // Select customer
    const searchInput = screen.getByPlaceholderText('Sök kund...')
    await act(async () => {
      fireEvent.focus(searchInput)
    })
    await act(async () => {
      vi.advanceTimersByTime(350)
    })
    await waitFor(() => {
      expect(screen.getByText('Acme AB')).toBeDefined()
    })
    await act(async () => {
      fireEvent.click(screen.getByText('Acme AB'))
    })

    // Add 3 lines
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        fireEvent.click(screen.getByText('Lägg till rad'))
      })
    }

    // Fill each line with qty=1, price=0.99
    const numberInputs = screen.getAllByRole('spinbutton')
    // Each line has 2 spinbuttons (quantity + price)
    // Total: 6 spinbuttons for 3 lines
    for (let i = 0; i < 3; i++) {
      const qtyIdx = i * 2
      const priceIdx = i * 2 + 1
      if (numberInputs[qtyIdx] && numberInputs[priceIdx]) {
        await act(async () => {
          fireEvent.change(numberInputs[qtyIdx], { target: { value: '1' } })
        })
        await act(async () => {
          fireEvent.change(numberInputs[priceIdx], { target: { value: '0.99' } })
        })
      }
    }

    // Verify F27-kedja via InvoiceTotals:
    // Per rad: netto=99, VAT=Math.round(99*0.25)=Math.round(24.75)=25
    // Ackumulerat: netto=297, VAT=75 (not 74), total=372
    await waitFor(() => {
      expect(screen.getByText(byKr(297))).toBeDefined() // Netto
      expect(screen.getByText(byKr(75))).toBeDefined()  // VAT (25+25+25, not 74)
      expect(screen.getByText(byKr(372))).toBeDefined() // Total
    })
  })
})
