// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { PeriodList } from '../../../../src/renderer/components/overview/PeriodList'
import type { FiscalPeriod } from '../../../../src/shared/types'

function makePeriod(month: number, isClosed: boolean): FiscalPeriod {
  const m = String(month).padStart(2, '0')
  const endDay = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  return {
    id: month,
    fiscal_year_id: 1,
    period_number: month,
    start_date: `2026-${m}-01`,
    end_date: `2026-${m}-${endDay}`,
    is_closed: isClosed ? 1 : 0,
  }
}

function makeAllPeriods(closedUpTo: number): FiscalPeriod[] {
  return Array.from({ length: 12 }, (_, i) =>
    makePeriod(i + 1, i + 1 <= closedUpTo),
  )
}

beforeEach(() => {
  vi.setSystemTime(new Date('2026-06-15T12:00:00'))
  setupMockIpc()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PeriodList', () => {
  it('renders 12 month names', async () => {
    const periods = makeAllPeriods(3)
    mockIpcResponse('fiscal-period:list', { success: true, data: periods })
    await renderWithProviders(<PeriodList />, { axeCheck: false })

    await waitFor(() => {
      expect(screen.getByText('Januari')).toBeInTheDocument()
    })
    expect(screen.getByText('Februari')).toBeInTheDocument()
    expect(screen.getByText('Mars')).toBeInTheDocument()
    expect(screen.getByText('December')).toBeInTheDocument()
  })

  it('closed months show "Klar" badge', async () => {
    const periods = makeAllPeriods(2)
    mockIpcResponse('fiscal-period:list', { success: true, data: periods })
    await renderWithProviders(<PeriodList />, { axeCheck: false })

    await waitFor(() => {
      expect(screen.getByText('Januari')).toBeInTheDocument()
    })
    const klarBadges = screen.getAllByText('Klar')
    expect(klarBadges.length).toBe(2) // Jan, Feb
  })

  it('open months show "Öppen" badge', async () => {
    const periods = makeAllPeriods(2)
    mockIpcResponse('fiscal-period:list', { success: true, data: periods })
    await renderWithProviders(<PeriodList />, { axeCheck: false })

    await waitFor(() => {
      expect(screen.getByText('Januari')).toBeInTheDocument()
    })
    const oppenBadges = screen.getAllByText('Öppen')
    expect(oppenBadges.length).toBe(10) // Mar-Dec
  })

  it('close button only on firstOpenIndex', async () => {
    const periods = makeAllPeriods(2) // Jan-Feb closed, Mar is first open
    mockIpcResponse('fiscal-period:list', { success: true, data: periods })
    await renderWithProviders(<PeriodList />, { axeCheck: false })

    await waitFor(() => {
      expect(screen.getByText('Januari')).toBeInTheDocument()
    })
    // Only one "Stäng" button
    const closeBtn = screen.getByText(/Stäng mars/i)
    expect(closeBtn).toBeInTheDocument()
    expect(screen.queryByText(/Stäng april/i)).toBeNull()
  })

  it('reopen button only on lastClosedIndex', async () => {
    const periods = makeAllPeriods(3) // Jan-Mar closed
    mockIpcResponse('fiscal-period:list', { success: true, data: periods })
    await renderWithProviders(<PeriodList />, { axeCheck: false })

    await waitFor(() => {
      expect(screen.getByText('Januari')).toBeInTheDocument()
    })
    const reopenBtn = screen.getByText(/Öppna mars/i)
    expect(reopenBtn).toBeInTheDocument()
    expect(screen.queryByText(/Öppna februari/i)).toBeNull()
  })

  it('close click opens confirmation dialog', async () => {
    const periods = makeAllPeriods(0) // All open, Jan is first
    mockIpcResponse('fiscal-period:list', { success: true, data: periods })
    await renderWithProviders(<PeriodList />, { axeCheck: false })

    await waitFor(() => {
      expect(screen.getByText(/Stäng januari/i)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText(/Stäng januari/i))

    await waitFor(() => {
      expect(screen.getByText('Stäng Januari?')).toBeInTheDocument()
    })
    expect(screen.getByText('Stäng månaden')).toBeInTheDocument()
    expect(screen.getByText('Avbryt')).toBeInTheDocument()
  })

  it('cancel closes confirmation dialog', async () => {
    const periods = makeAllPeriods(0)
    mockIpcResponse('fiscal-period:list', { success: true, data: periods })
    await renderWithProviders(<PeriodList />, { axeCheck: false })

    await waitFor(() => {
      expect(screen.getByText(/Stäng januari/i)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText(/Stäng januari/i))

    await waitFor(() => {
      expect(screen.getByText('Avbryt')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Avbryt'))

    await waitFor(() => {
      expect(screen.queryByText('Stäng Januari?')).toBeNull()
    })
  })

  it('all-closed banner shows when every period is closed', async () => {
    const periods = makeAllPeriods(12)
    mockIpcResponse('fiscal-period:list', { success: true, data: periods })
    await renderWithProviders(<PeriodList />, { axeCheck: false })

    await waitFor(() => {
      expect(screen.getByText(/Alla månader för 2026 är stängda/)).toBeInTheDocument()
    })
  })

  it('returns null when no periods', async () => {
    mockIpcResponse('fiscal-period:list', { success: true, data: [] })
    const { container } = await renderWithProviders(<PeriodList />, { axeCheck: false })

    // Give time for query to resolve
    await waitFor(() => {})
    expect(container.querySelector('h2')).toBeNull()
  })

  it('isReadOnly hides close/reopen buttons', async () => {
    const periods = makeAllPeriods(3)
    mockIpcResponse('fiscal-period:list', { success: true, data: periods })

    await renderWithProviders(<PeriodList />, {
      fiscalYear: { id: 1, label: '2026', is_closed: 1 },
      axeCheck: false,
    })

    await waitFor(() => {
      expect(screen.getByText('Januari')).toBeInTheDocument()
    })
    // No close/reopen buttons when readOnly
    expect(screen.queryByText(/Stäng januari/)).toBeNull()
    expect(screen.queryByText(/Öppna mars/)).toBeNull()
  })

  it('passes axe a11y check', async () => {
    const periods = makeAllPeriods(6)
    mockIpcResponse('fiscal-period:list', { success: true, data: periods })
    const { axeResults } = await renderWithProviders(<PeriodList />)
    expect(axeResults?.violations).toEqual([])
  })
})
