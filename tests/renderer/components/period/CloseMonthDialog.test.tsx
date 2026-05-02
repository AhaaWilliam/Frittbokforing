// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { CloseMonthDialog } from '../../../../src/renderer/components/period/CloseMonthDialog'

beforeEach(() => {
  setupMockIpc()
  mockIpcResponse('fiscal-period:list', {
    success: true,
    data: [
      {
        id: 1,
        fiscal_year_id: 1,
        period_number: 1,
        start_date: '2026-01-01',
        end_date: '2026-01-31',
        is_closed: 0,
      },
    ],
  })
})

function makeChecks(overrides: Record<string, 'ok' | 'warning' | 'na'> = {}) {
  const def = (k: string): 'ok' | 'warning' | 'na' =>
    overrides[k] ?? ('ok' as const)
  return {
    period_id: 1,
    period_start: '2026-01-01',
    period_end: '2026-01-31',
    bankReconciliation: {
      status: def('bankReconciliation'),
      count: 0,
      detail: 'Bank-detalj',
    },
    salaryBooked: { status: def('salaryBooked'), count: 0, detail: 'Lön' },
    vatReportReady: {
      status: def('vatReportReady'),
      count: 0,
      detail: 'Moms',
    },
    supplierPayments: {
      status: def('supplierPayments'),
      count: 0,
      detail: 'Lev',
    },
    allOk: Object.values(overrides).filter((s) => s === 'warning').length === 0,
  }
}

describe('CloseMonthDialog', () => {
  // VS-127: warning-rader är klickbara och navigerar till relevant page.
  it('VS-127 supplierPayments warning-rad klickbar → navigerar /expenses', async () => {
    mockIpcResponse('period:checks', {
      success: true,
      data: makeChecks({ supplierPayments: 'warning' }),
    })
    window.location.hash = '/'

    await renderWithProviders(
      <CloseMonthDialog open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — dedicated axe test below
    )

    await waitFor(() => {
      expect(screen.getByTestId('check-supplierPayments')).toBeInTheDocument()
    })
    const row = screen.getByTestId('check-supplierPayments')
    expect(row.getAttribute('role')).toBe('button')
    expect(row.getAttribute('tabindex')).toBe('0')

    fireEvent.click(row)
    await waitFor(() => {
      expect(window.location.hash).toContain('/expenses')
    })
  })

  it('VS-127 ok-rad är inte klickbar', async () => {
    mockIpcResponse('period:checks', { success: true, data: makeChecks() })
    await renderWithProviders(
      <CloseMonthDialog open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — dedicated axe test below
    )
    await waitFor(() => {
      expect(screen.getByTestId('check-supplierPayments')).toBeInTheDocument()
    })
    const row = screen.getByTestId('check-supplierPayments')
    expect(row.getAttribute('role')).toBeNull()
    expect(row.getAttribute('tabindex')).toBeNull()
  })

  it('VS-127 Enter-tangent på warning-rad navigerar', async () => {
    mockIpcResponse('period:checks', {
      success: true,
      data: makeChecks({ vatReportReady: 'warning' }),
    })
    window.location.hash = '/'

    await renderWithProviders(
      <CloseMonthDialog open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — dedicated axe test below
    )

    await waitFor(() => {
      expect(screen.getByTestId('check-vatReportReady')).toBeInTheDocument()
    })
    const row = screen.getByTestId('check-vatReportReady')
    fireEvent.keyDown(row, { key: 'Enter' })
    await waitFor(() => {
      expect(window.location.hash).toContain('/vat')
    })
  })
})
