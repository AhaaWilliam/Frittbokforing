// @vitest-environment jsdom
/**
 * Sprint 70 — VardagPageIncome senaste-fakturor-list (read-only).
 *
 * Sprint 22 var pure placeholder; Sprint 70 visar 5 senaste finaliserade
 * fakturor med Pill-status, due_date (overdue-token), och total_amount_ore.
 * Quick-fakturering save är fortfarande ute (kräver produktbeslut).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { VardagPageIncome } from '../../../../src/renderer/modes/vardag/VardagPageIncome'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import type { InvoiceListItem } from '../../../../src/shared/types'

function makeInvoice(overrides: Partial<InvoiceListItem>): InvoiceListItem {
  return {
    id: 1,
    invoice_type: 'customer_invoice',
    invoice_number: '1',
    invoice_date: '2026-04-15',
    due_date: '2026-05-15',
    net_amount_ore: 100000,
    vat_amount_ore: 25000,
    total_amount_ore: 125000,
    status: 'unpaid',
    payment_terms: 30,
    counterparty_name: 'Acme AB',
    verification_number: 1,
    journal_entry_id: 1,
    credits_invoice_id: null,
    has_credit_note: 0,
    total_paid: 0,
    remaining: 125000,
    ...overrides,
  }
}

function listResp(items: InvoiceListItem[]) {
  return {
    success: true as const,
    data: {
      items,
      total_items: items.length,
      counts: {
        total: items.length,
        draft: 0,
        unpaid: 0,
        partial: 0,
        paid: 0,
        overdue: 0,
      },
    },
  }
}

describe('VardagPageIncome', () => {
  beforeEach(() => {
    setupMockIpc()
  })

  it('rubriksätter sidan + visar fallback-länken', async () => {
    mockIpcResponse('invoice:list', listResp([]))
    await renderWithProviders(<VardagPageIncome />)
    expect(screen.getByText('Skicka faktura')).toBeInTheDocument()
    expect(screen.getByTestId('income-fallback-link')).toBeInTheDocument()
  })

  it('visar empty-state när inga finaliserade fakturor finns', async () => {
    mockIpcResponse('invoice:list', listResp([]))
    await renderWithProviders(<VardagPageIncome />)
    expect(await screen.findByTestId('income-empty')).toBeInTheDocument()
    expect(screen.getByText(/Inga skickade fakturor ännu/)).toBeInTheDocument()
  })

  it('renderar fakturalista med kund + status + belopp', async () => {
    mockIpcResponse(
      'invoice:list',
      listResp([
        makeInvoice({
          id: 1,
          counterparty_name: 'Acme AB',
          status: 'unpaid',
          total_amount_ore: 125000,
        }),
        makeInvoice({
          id: 2,
          counterparty_name: 'Beta HB',
          status: 'paid',
          total_amount_ore: 50000,
        }),
      ]),
    )
    await renderWithProviders(<VardagPageIncome />)
    expect(await screen.findByTestId('income-list')).toBeInTheDocument()
    expect(screen.getByText('Acme AB')).toBeInTheDocument()
    expect(screen.getByText('Beta HB')).toBeInTheDocument()
    expect(screen.getByText('Obetald')).toBeInTheDocument()
    expect(screen.getByText('Betald')).toBeInTheDocument()
  })

  it('filtrerar bort drafts (visar bara skickade)', async () => {
    mockIpcResponse(
      'invoice:list',
      listResp([
        makeInvoice({ id: 1, counterparty_name: 'Draft AB', status: 'draft' }),
        makeInvoice({ id: 2, counterparty_name: 'Sent AB', status: 'unpaid' }),
      ]),
    )
    await renderWithProviders(<VardagPageIncome />)
    expect(await screen.findByText('Sent AB')).toBeInTheDocument()
    expect(screen.queryByText('Draft AB')).not.toBeInTheDocument()
  })

  it('overdue-status får text-status-overdue klass på due_date', async () => {
    mockIpcResponse(
      'invoice:list',
      listResp([
        makeInvoice({
          id: 1,
          counterparty_name: 'Late AB',
          status: 'overdue',
          due_date: '2026-04-01',
        }),
      ]),
    )
    const { container } = await renderWithProviders(<VardagPageIncome />)
    const overdueText = container.querySelector('.text-status-overdue')
    expect(overdueText).not.toBeNull()
    expect(overdueText?.textContent).toContain('2026-04-01')
  })
})
