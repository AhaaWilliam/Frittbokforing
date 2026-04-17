// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { InvoiceList } from '../../../../src/renderer/components/invoices/InvoiceList'

const INVOICE_ITEMS = [
  {
    id: 1, invoice_number: '1', invoice_date: '2026-03-15', due_date: '2026-04-14',
    counterparty_name: 'Kund Alpha', net_amount_ore: 10000, vat_amount_ore: 2500,
    total_amount_ore: 12500, paid_amount_ore: 0, status: 'unpaid',
    verification_number: 1, verification_series: 'A',
    invoice_type: 'normal', has_credit_note: 0,
  },
  {
    id: 2, invoice_number: '2', invoice_date: '2026-03-20', due_date: '2026-04-19',
    counterparty_name: 'Kund Beta', net_amount_ore: 20000, vat_amount_ore: 5000,
    total_amount_ore: 25000, paid_amount_ore: 25000, status: 'paid',
    verification_number: 2, verification_series: 'A',
    invoice_type: 'normal', has_credit_note: 0,
  },
  {
    id: 3, invoice_number: '', invoice_date: '2026-03-25', due_date: '2026-04-24',
    counterparty_name: 'Kund Gamma', net_amount_ore: 5000, vat_amount_ore: 1250,
    total_amount_ore: 6250, paid_amount_ore: 0, status: 'draft',
    verification_number: null, verification_series: null,
    invoice_type: 'normal', has_credit_note: 0,
  },
]

const COUNTS = { total: 3, draft: 1, unpaid: 1, partial: 0, paid: 1, overdue: 0 }

function renderList(onNavigate = vi.fn()) {
  mockIpcResponse('invoice:list', {
    success: true,
    data: { items: INVOICE_ITEMS, counts: COUNTS },
  })
  return renderWithProviders(<InvoiceList onNavigate={onNavigate} />, { axeCheck: false }) // M133 exempt — dedicated axe test below
}

beforeEach(() => {
  setupMockIpc()
  vi.setSystemTime(new Date('2026-06-15T10:00:00'))
})

describe('InvoiceList', () => {
  it('axe-check passes', async () => {
    mockIpcResponse('invoice:list', {
      success: true,
      data: { items: INVOICE_ITEMS, counts: COUNTS },
    })
    const { axeResults } = await renderWithProviders(<InvoiceList onNavigate={vi.fn()} />)
    expect(axeResults?.violations).toEqual([])
  })

  it('renders invoice rows', async () => {
    await renderList()
    await waitFor(() => {
      expect(screen.getByText('Kund Alpha')).toBeDefined()
      expect(screen.getByText('Kund Beta')).toBeDefined()
    })
  })

  it('shows status filter tabs with counts', async () => {
    await renderList()
    await waitFor(() => {
      expect(screen.getByText(/alla/i)).toBeDefined()
    })
  })

  it('empty state when no invoices', async () => {
    mockIpcResponse('invoice:list', {
      success: true,
      data: { items: [], counts: { total: 0, draft: 0, unpaid: 0, partial: 0, paid: 0, overdue: 0 } },
    })
    await renderWithProviders(<InvoiceList onNavigate={vi.fn()} />, { axeCheck: false }) // M133 exempt
    await waitFor(() => {
      expect(screen.getByText(/inga fakturor/i)).toBeDefined()
    })
  })

  it('row click navigates to view for finalized invoice', async () => {
    const onNavigate = vi.fn()
    await renderList(onNavigate)
    await waitFor(() => {
      expect(screen.getByText('Kund Alpha')).toBeDefined()
    })
    await userEvent.click(screen.getByText('Kund Alpha'))
    expect(onNavigate).toHaveBeenCalledWith({ view: 1 })
  })

  it('row click navigates to edit for draft invoice', async () => {
    const onNavigate = vi.fn()
    await renderList(onNavigate)
    await waitFor(() => {
      expect(screen.getByText('Kund Gamma')).toBeDefined()
    })
    await userEvent.click(screen.getByText('Kund Gamma'))
    expect(onNavigate).toHaveBeenCalledWith({ edit: 3 })
  })

  it('credited invoice shows credit note badge', async () => {
    const creditedItems = [
      { ...INVOICE_ITEMS[0], has_credit_note: 1 },
    ]
    mockIpcResponse('invoice:list', {
      success: true,
      data: { items: creditedItems, counts: { ...COUNTS, total: 1 } },
    })
    await renderWithProviders(<InvoiceList onNavigate={vi.fn()} />, { axeCheck: false }) // M133 exempt
    await waitFor(() => {
      expect(screen.getByText(/krediterad/i)).toBeDefined()
    })
  })

  // Sprint 57 C3: Pagination-integration
  describe('Pagination (S57 C3)', () => {
    it('tom lista visar "Visar 0–0 av 0", båda knappar disabled', async () => {
      mockIpcResponse('invoice:list', {
        success: true,
        data: {
          items: [],
          counts: { total: 0, draft: 0, unpaid: 0, partial: 0, paid: 0, overdue: 0 },
          total_items: 0,
        },
      })
      await renderWithProviders(<InvoiceList onNavigate={vi.fn()} />, { axeCheck: false })
      await waitFor(() => {
        expect(screen.getByTestId('pag-invoices-summary').textContent).toBe(
          'Visar 0–0 av 0 fakturor',
        )
      })
      expect(screen.getByTestId('pag-invoices-prev')).toBeDisabled()
      expect(screen.getByTestId('pag-invoices-next')).toBeDisabled()
    })

    it('selection-bevarande över page-byte (M112 regression-skydd)', async () => {
      mockIpcResponse('invoice:list', {
        success: true,
        data: {
          items: INVOICE_ITEMS,
          counts: COUNTS,
          total_items: 127,
        },
      })
      await renderWithProviders(<InvoiceList onNavigate={vi.fn()} />, { axeCheck: false })

      await waitFor(() => {
        expect(screen.getByText('Kund Alpha')).toBeDefined()
      })

      // Välj raden för id=1 (Kund Alpha, unpaid)
      const checkboxes = screen.getAllByRole('checkbox')
      // [0] = select-all i thead, [1..] = per rad (selectable)
      const rowCheckboxes = checkboxes.slice(1)
      await userEvent.click(rowCheckboxes[0])
      expect(screen.getByText('1 valda')).toBeDefined()

      // Klick nästa sida
      await userEvent.click(screen.getByTestId('pag-invoices-next'))
      // Efter page-byte: "X valda" ska fortfarande visas
      await waitFor(() => {
        expect(screen.getByText('1 valda')).toBeDefined()
      })

      // Tillbaka till page 0 — checkbox ska fortfarande vara checked
      await userEvent.click(screen.getByTestId('pag-invoices-prev'))
      await waitFor(() => {
        const firstRowCheckbox = screen.getAllByRole('checkbox')[1] as HTMLInputElement
        expect(firstRowCheckbox.checked).toBe(true)
      })
    })

    it('tabellen visar pagineringsknappar med korrekt position', async () => {
      mockIpcResponse('invoice:list', {
        success: true,
        data: {
          items: INVOICE_ITEMS,
          counts: COUNTS,
          total_items: 127,
        },
      })
      await renderWithProviders(<InvoiceList onNavigate={vi.fn()} />, { axeCheck: false })
      await waitFor(() => {
        // sida 1 av 3 (127 / 50 = 3 sidor)
        expect(screen.getByTestId('pag-invoices-position').textContent).toBe('Sida 1 / 3')
      })
    })
  })
})
