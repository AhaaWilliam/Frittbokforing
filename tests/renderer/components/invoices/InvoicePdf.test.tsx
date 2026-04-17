// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { InvoiceList } from '../../../../src/renderer/components/invoices/InvoiceList'

const INVOICE_ITEMS = [
  {
    id: 1, invoice_number: 'A0001', invoice_date: '2026-03-15', due_date: '2026-04-14',
    counterparty_name: 'Kund Alpha', net_amount_ore: 10000, vat_amount_ore: 2500,
    total_amount_ore: 12500, paid_amount_ore: 0, status: 'unpaid',
    verification_number: 1, verification_series: 'A',
    invoice_type: 'normal', has_credit_note: 0,
    total_paid: 0, remaining: 12500, payment_terms: 30, credits_invoice_id: null,
    journal_entry_id: 1,
  },
  {
    id: 2, invoice_number: 'A0002', invoice_date: '2026-03-20', due_date: '2026-04-19',
    counterparty_name: 'Kund Beta', net_amount_ore: 20000, vat_amount_ore: 5000,
    total_amount_ore: 25000, paid_amount_ore: 25000, status: 'paid',
    verification_number: 2, verification_series: 'A',
    invoice_type: 'normal', has_credit_note: 0,
    total_paid: 25000, remaining: 0, payment_terms: 30, credits_invoice_id: null,
    journal_entry_id: 2,
  },
  {
    id: 3, invoice_number: '', invoice_date: '2026-03-25', due_date: '2026-04-24',
    counterparty_name: 'Kund Gamma', net_amount_ore: 5000, vat_amount_ore: 1250,
    total_amount_ore: 6250, paid_amount_ore: 0, status: 'draft',
    verification_number: null, verification_series: null,
    invoice_type: 'normal', has_credit_note: 0,
    total_paid: 0, remaining: 6250, payment_terms: 30, credits_invoice_id: null,
    journal_entry_id: null,
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

describe('InvoiceList PDF features', () => {
  it('P1: PDF icon appears for finalized invoices, not for drafts', async () => {
    await renderList()
    await waitFor(() => {
      expect(screen.getByText('Kund Alpha')).toBeDefined()
    })
    // FileDown icons should appear for the 2 finalized rows (unpaid + paid), not for draft
    const pdfButtons = screen.getAllByTitle('Ladda ner PDF')
    expect(pdfButtons).toHaveLength(2)
  })

  it('P2: PDF icon click triggers generate then save', async () => {
    await renderList()
    await waitFor(() => {
      expect(screen.getByText('Kund Alpha')).toBeDefined()
    })

    mockIpcResponse('invoice:generate-pdf', {
      success: true,
      data: { data: 'base64pdfdata' },
    })
    mockIpcResponse('invoice:save-pdf', {
      success: true,
      data: { success: true, filePath: '/tmp/test.pdf' },
    })

    const pdfButtons = screen.getAllByTitle('Ladda ner PDF')
    await userEvent.click(pdfButtons[0])

    await waitFor(() => {
      expect(window.api.generateInvoicePdf).toHaveBeenCalledWith({ invoiceId: 1 })
    })
  })

  it('P3: PDF icon click does not navigate (stopPropagation)', async () => {
    const onNavigate = vi.fn()
    await renderList(onNavigate)
    await waitFor(() => {
      expect(screen.getByText('Kund Alpha')).toBeDefined()
    })

    mockIpcResponse('invoice:generate-pdf', {
      success: true,
      data: { data: 'base64pdfdata' },
    })
    mockIpcResponse('invoice:save-pdf', {
      success: true,
      data: { success: true, filePath: '/tmp/test.pdf' },
    })

    const pdfButtons = screen.getAllByTitle('Ladda ner PDF')
    await userEvent.click(pdfButtons[0])

    // onNavigate should NOT have been called
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('P4: checkbox appears for paid invoices (not just unpaid)', async () => {
    await renderList()
    await waitFor(() => {
      expect(screen.getByText('Kund Beta')).toBeDefined()
    })
    // All non-draft items should have checkboxes: unpaid (id=1) + paid (id=2) = 2
    // Draft (id=3) should NOT have checkbox
    const checkboxes = screen.getAllByRole('checkbox')
    // 1 header checkbox + 2 row checkboxes = 3
    expect(checkboxes).toHaveLength(3)
  })

  it('P5: "Exportera PDF:er" button appears when items selected', async () => {
    await renderList()
    await waitFor(() => {
      expect(screen.getByText('Kund Alpha')).toBeDefined()
    })

    // Select the first finalized invoice
    const checkboxes = screen.getAllByRole('checkbox')
    // checkboxes[0] = header, checkboxes[1] = first row (unpaid), checkboxes[2] = second row (paid)
    await userEvent.click(checkboxes[1])

    await waitFor(() => {
      expect(screen.getByText(/exportera pdf/i)).toBeDefined()
    })
  })

  it('P6: "Bulk-betala" shows only when all selected are payable', async () => {
    await renderList()
    await waitFor(() => {
      expect(screen.getByText('Kund Alpha')).toBeDefined()
    })

    // Select header checkbox (selects all non-draft: unpaid + paid)
    const checkboxes = screen.getAllByRole('checkbox')
    await userEvent.click(checkboxes[0])

    await waitFor(() => {
      // "Exportera PDF:er" should be visible
      expect(screen.getByText(/exportera pdf/i)).toBeDefined()
      // "Bulk-betala" should NOT be visible because 'paid' item is selected
      expect(screen.queryByText(/bulk-betala/i)).toBeNull()
    })
  })

  it('P7: "Bulk-betala" shows when only payable items selected', async () => {
    await renderList()
    await waitFor(() => {
      expect(screen.getByText('Kund Alpha')).toBeDefined()
    })

    // Select only the unpaid invoice
    const checkboxes = screen.getAllByRole('checkbox')
    await userEvent.click(checkboxes[1]) // unpaid row

    await waitFor(() => {
      expect(screen.getByText(/bulk-betala/i)).toBeDefined()
      expect(screen.getByText(/exportera pdf/i)).toBeDefined()
    })
  })

  it('P8: axe-check passes with expanded checkboxes', async () => {
    mockIpcResponse('invoice:list', {
      success: true,
      data: { items: INVOICE_ITEMS, counts: COUNTS },
    })
    const { axeResults } = await renderWithProviders(<InvoiceList onNavigate={vi.fn()} />)
    expect(axeResults?.violations).toEqual([])
  })
})
