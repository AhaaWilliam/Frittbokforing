// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { InvoiceList } from '../../../../src/renderer/components/invoices/InvoiceList'

const INVOICE_ITEMS = [
  {
    id: 1,
    invoice_number: '1',
    invoice_date: '2026-03-15',
    due_date: '2026-04-14',
    counterparty_name: 'Kund Alpha',
    net_amount_ore: 10000,
    vat_amount_ore: 2500,
    total_amount_ore: 12500,
    paid_amount_ore: 0,
    status: 'unpaid',
    verification_number: 1,
    verification_series: 'A',
    invoice_type: 'normal',
    has_credit_note: 0,
  },
]

const COUNTS = {
  total: 1,
  draft: 0,
  unpaid: 1,
  partial: 0,
  paid: 0,
  overdue: 0,
}

beforeEach(() => {
  setupMockIpc()
  vi.setSystemTime(new Date('2026-06-15T10:00:00'))
  mockIpcResponse('invoice:list', {
    success: true,
    data: { items: INVOICE_ITEMS, counts: COUNTS },
  })
})

describe('InvoiceList URL-state (T2.a)', () => {
  it('URL-init ?invoices_status=unpaid → "Obetald"-filterknapp är aktiv', async () => {
    await renderWithProviders(<InvoiceList onNavigate={vi.fn()} />, {
      initialRoute: '/income?invoices_status=unpaid',
      axeCheck: false, // M133 exempt — dedicated axe test in InvoiceList.test.tsx
    })
    const button = await screen.findByRole('button', { name: /^obetald/i })
    await waitFor(() => {
      expect(button.className).toContain('bg-primary')
    })
  })

  it('ogiltigt URL-värde strippas, default visas', async () => {
    await renderWithProviders(<InvoiceList onNavigate={vi.fn()} />, {
      initialRoute: '/income?invoices_status=xyz',
      axeCheck: false, // M133 exempt — dedicated axe test in InvoiceList.test.tsx
    })
    await waitFor(() => {
      expect(window.location.hash).not.toContain('invoices_status')
    })
    const alla = await screen.findByRole('button', { name: /^alla/i })
    expect(alla.className).toContain('bg-primary')
  })

  it('klick på "Alla" tar bort invoices_status från URL', async () => {
    await renderWithProviders(<InvoiceList onNavigate={vi.fn()} />, {
      initialRoute: '/income?invoices_status=unpaid',
      axeCheck: false, // M133 exempt — dedicated axe test in InvoiceList.test.tsx
    })
    const alla = await screen.findByRole('button', { name: /^alla/i })
    await userEvent.click(alla)
    await waitFor(() => {
      expect(window.location.hash).not.toContain('invoices_status')
    })
  })

  it('URL-init ?invoices_status=unpaid&invoices_page=3 triggar INTE page-reset', async () => {
    await renderWithProviders(<InvoiceList onNavigate={vi.fn()} />, {
      initialRoute: '/income?invoices_status=unpaid&invoices_page=3',
      axeCheck: false, // M133 exempt — dedicated axe test in InvoiceList.test.tsx
    })
    // Om page-reset hade triggats skulle invoices_page=3 tas bort
    // (usePageParam tar bort param vid page === defaultPage === 0).
    await waitFor(() => {
      expect(screen.getByText('Kund Alpha')).toBeDefined()
    })
    expect(window.location.hash).toContain('invoices_page=3')
    expect(window.location.hash).toContain('invoices_status=unpaid')
  })
})
