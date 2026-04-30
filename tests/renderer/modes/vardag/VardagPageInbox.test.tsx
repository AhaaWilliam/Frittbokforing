// @vitest-environment jsdom
/**
 * Sprint 77 — VardagPageInbox överdue-rader.
 *
 * Sprint 26 hade utkast + obetalda fordringar/skulder via DashboardSummary.
 * Sprint 77 lägger till överdue-rader (placerade överst) med exakt
 * count från invoice:list / expense:list-counts.
 *
 * Testar att:
 * - Överdue-fakturor visas som första item när count > 0
 * - Överdue-kostnader visas analogt
 * - Pills är danger-variant (markerar action behövs)
 * - Singular/plural-form för "är förfallna"
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { VardagPageInbox } from '../../../../src/renderer/modes/vardag/VardagPageInbox'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'

const ZERO_SUMMARY = {
  success: true as const,
  data: {
    revenueOre: 0,
    expensesOre: 0,
    operatingResultOre: 0,
    vatOutgoingOre: 0,
    vatIncomingOre: 0,
    vatNetOre: 0,
    unpaidReceivablesOre: 0,
    unpaidPayablesOre: 0,
    bankBalanceOre: 0,
  },
}

function invoiceListResp(overdue: number) {
  return {
    success: true as const,
    data: {
      items: [],
      total_items: 0,
      counts: {
        total: overdue,
        draft: 0,
        unpaid: 0,
        partial: 0,
        paid: 0,
        overdue,
      },
    },
  }
}

function expenseListResp(overdue: number) {
  return {
    success: true as const,
    data: {
      expenses: [],
      total_items: 0,
      counts: {
        total: overdue,
        draft: 0,
        unpaid: 0,
        partial: 0,
        paid: 0,
        overdue,
      },
    },
  }
}

beforeEach(() => {
  setupMockIpc()
})

describe('VardagPageInbox — Sprint 77 överdue-rader', () => {
  it('visar inte overdue-rader när count = 0', async () => {
    mockIpcResponse('dashboard:summary', ZERO_SUMMARY)
    mockIpcResponse('invoice:list-drafts', { success: true, data: [] })
    mockIpcResponse('expense:list-drafts', { success: true, data: [] })
    mockIpcResponse('invoice:list', invoiceListResp(0))
    mockIpcResponse('expense:list', expenseListResp(0))
    await renderWithProviders(<VardagPageInbox />)
    expect(screen.queryByTestId('inbox-overdue-invoices')).toBeNull()
    expect(screen.queryByTestId('inbox-overdue-expenses')).toBeNull()
  })

  it('visar överdue-fakturor när count > 0 (singular form vid 1)', async () => {
    mockIpcResponse('dashboard:summary', ZERO_SUMMARY)
    mockIpcResponse('invoice:list-drafts', { success: true, data: [] })
    mockIpcResponse('expense:list-drafts', { success: true, data: [] })
    mockIpcResponse('invoice:list', invoiceListResp(1))
    mockIpcResponse('expense:list', expenseListResp(0))
    await renderWithProviders(<VardagPageInbox />)
    const row = await screen.findByTestId('inbox-overdue-invoices')
    expect(row.textContent).toContain('1 faktura är förfallna')
  })

  it('visar överdue-fakturor med plural-form vid > 1', async () => {
    mockIpcResponse('dashboard:summary', ZERO_SUMMARY)
    mockIpcResponse('invoice:list-drafts', { success: true, data: [] })
    mockIpcResponse('expense:list-drafts', { success: true, data: [] })
    mockIpcResponse('invoice:list', invoiceListResp(3))
    mockIpcResponse('expense:list', expenseListResp(0))
    await renderWithProviders(<VardagPageInbox />)
    const row = await screen.findByTestId('inbox-overdue-invoices')
    expect(row.textContent).toContain('3 fakturor är förfallna')
  })

  it('visar överdue-kostnader analogt', async () => {
    mockIpcResponse('dashboard:summary', ZERO_SUMMARY)
    mockIpcResponse('invoice:list-drafts', { success: true, data: [] })
    mockIpcResponse('expense:list-drafts', { success: true, data: [] })
    mockIpcResponse('invoice:list', invoiceListResp(0))
    mockIpcResponse('expense:list', expenseListResp(2))
    await renderWithProviders(<VardagPageInbox />)
    const row = await screen.findByTestId('inbox-overdue-expenses')
    expect(row.textContent).toContain('2 leverantörsfakturor är förfallna')
  })
})
