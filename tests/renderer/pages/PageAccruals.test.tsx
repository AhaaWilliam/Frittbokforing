// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../setup/mock-ipc'
import { renderWithProviders } from '../../helpers/render-with-providers'
import { PageAccruals } from '../../../src/renderer/pages/PageAccruals'

const MOCK_SCHEDULES = [
  {
    id: 1,
    fiscal_year_id: 1,
    description: 'Förutbetald hyra',
    accrual_type: 'prepaid_expense',
    balance_account: '1710',
    result_account: '5010',
    total_amount_ore: 120000_00,
    period_count: 6,
    start_period: 1,
    is_active: 1,
    created_at: '2025-01-15',
    periodStatuses: [
      { periodNumber: 1, executed: true, journalEntryId: 10, amountOre: 20000_00 },
      { periodNumber: 2, executed: true, journalEntryId: 11, amountOre: 20000_00 },
      { periodNumber: 3, executed: false, amountOre: 20000_00 },
      { periodNumber: 4, executed: false, amountOre: 20000_00 },
      { periodNumber: 5, executed: false, amountOre: 20000_00 },
      { periodNumber: 6, executed: false, amountOre: 20000_00 },
    ],
    executedCount: 2,
    remainingOre: 80000_00,
  },
  {
    id: 2,
    fiscal_year_id: 1,
    description: 'Upplupen lön',
    accrual_type: 'accrued_expense',
    balance_account: '2910',
    result_account: '7010',
    total_amount_ore: 60000_00,
    period_count: 12,
    start_period: 1,
    is_active: 0,
    created_at: '2025-01-20',
    periodStatuses: Array.from({ length: 12 }, (_, i) => ({
      periodNumber: i + 1,
      executed: false,
      amountOre: 5000_00,
    })),
    executedCount: 0,
    remainingOre: 60000_00,
  },
]

function setupMocks() {
  mockIpcResponse('accrual:list', { success: true, data: MOCK_SCHEDULES })
  mockIpcResponse('account:list', { success: true, data: [] })
}

beforeEach(() => {
  setupMockIpc()
  setupMocks()
})

describe('PageAccruals', () => {
  it('R1: renders schedule cards', async () => {
    await renderWithProviders(<PageAccruals />, { axeCheck: false, initialRoute: '/accruals' })
    await waitFor(() => {
      expect(screen.getByText('Förutbetald hyra')).toBeDefined()
      expect(screen.getByText('Upplupen lön')).toBeDefined()
    })
  })

  it('R2: shows type badges', async () => {
    await renderWithProviders(<PageAccruals />, { axeCheck: false, initialRoute: '/accruals' })
    await waitFor(() => {
      expect(screen.getByText('Förutbetald kostnad')).toBeDefined()
      expect(screen.getByText('Upplupen kostnad')).toBeDefined()
    })
  })

  it('R3: shows progress (2 av 6 perioder körda)', async () => {
    await renderWithProviders(<PageAccruals />, { axeCheck: false, initialRoute: '/accruals' })
    await waitFor(() => {
      expect(screen.getByText('2 av 6 perioder körda')).toBeDefined()
    })
  })

  it('R4: shows execute button for next period', async () => {
    await renderWithProviders(<PageAccruals />, { axeCheck: false, initialRoute: '/accruals' })
    await waitFor(() => {
      expect(screen.getByText('Kör P3')).toBeDefined()
    })
  })

  it('R5: inactive schedule shows "Inaktiv" text', async () => {
    await renderWithProviders(<PageAccruals />, { axeCheck: false, initialRoute: '/accruals' })
    await waitFor(() => {
      expect(screen.getByText('Inaktiv')).toBeDefined()
    })
  })

  it('R6: "Ny periodisering" button opens create dialog', async () => {
    await renderWithProviders(<PageAccruals />, { axeCheck: false, initialRoute: '/accruals' })
    await waitFor(() => {
      expect(screen.getByText('Ny periodisering')).toBeDefined()
    })
    await userEvent.click(screen.getByText('Ny periodisering'))
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined()
      expect(screen.getByText('Beskrivning')).toBeDefined()
    })
  })

  it('R7: create dialog has type dropdown with 4 options', async () => {
    await renderWithProviders(<PageAccruals />, { axeCheck: false, initialRoute: '/accruals' })
    await waitFor(() => screen.getByText('Ny periodisering'))
    await userEvent.click(screen.getByText('Ny periodisering'))
    await waitFor(() => {
      const select = screen.getByDisplayValue('Förutbetald kostnad')
      expect(select).toBeDefined()
    })
  })

  it('R8: execute button calls executeAccrual', async () => {
    mockIpcResponse('accrual:execute', { success: true, data: { journalEntryId: 100 } })
    await renderWithProviders(<PageAccruals />, { axeCheck: false, initialRoute: '/accruals' })
    await waitFor(() => screen.getByText('Kör P3'))

    await userEvent.click(screen.getByText('Kör P3'))
    await waitFor(() => {
      expect(window.api.executeAccrual).toHaveBeenCalledWith({
        schedule_id: 1,
        period_number: 3,
      })
    })
  })

  it('R9: empty state when no schedules', async () => {
    mockIpcResponse('accrual:list', { success: true, data: [] })
    await renderWithProviders(<PageAccruals />, { axeCheck: false, initialRoute: '/accruals' })
    await waitFor(() => {
      expect(screen.getByText(/inga periodiseringsscheman/i)).toBeDefined()
    })
  })

  it('R10: axe-check passes', async () => {
    mockIpcResponse('accrual:list', { success: true, data: MOCK_SCHEDULES })
    const { axeResults } = await renderWithProviders(<PageAccruals />, { initialRoute: '/accruals' })
    expect(axeResults?.violations).toEqual([])
  })
})
