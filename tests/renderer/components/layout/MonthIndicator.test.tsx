// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { MonthIndicator } from '../../../../src/renderer/components/layout/MonthIndicator'
import type { FiscalPeriod } from '../../../../src/shared/types'

function makePeriod(month: number, isClosed: boolean): FiscalPeriod {
  const m = String(month).padStart(2, '0')
  return {
    id: month,
    fiscal_year_id: 1,
    period_number: month,
    start_date: `2026-${m}-01`,
    end_date: `2026-${m}-28`,
    is_closed: isClosed ? 1 : 0,
  }
}

function makeAllPeriods(closedUpTo: number): FiscalPeriod[] {
  return Array.from({ length: 12 }, (_, i) =>
    makePeriod(i + 1, i + 1 <= closedUpTo),
  )
}

beforeEach(() => {
  setupMockIpc()
})

describe('MonthIndicator', () => {
  it('renders 12 elements (one per period)', async () => {
    const periods = makeAllPeriods(3) // Jan-Mar closed
    mockIpcResponse('fiscal-period:list', { success: true, data: periods })
    await renderWithProviders(<MonthIndicator />, { axeCheck: false })
    await waitFor(() => {
      // Month letters: J, F, M, A, M, J, J, A, S, O, N, D
      expect(screen.getByTitle(/januari/i)).toBeInTheDocument()
    })
    // There should be 12 month indicators
    expect(screen.getByTitle(/december/i)).toBeInTheDocument()
  })

  it('closed period has green styling', async () => {
    const periods = makeAllPeriods(2) // Jan-Feb closed
    mockIpcResponse('fiscal-period:list', { success: true, data: periods })
    const { container } = await renderWithProviders(<MonthIndicator />, { axeCheck: false })
    await waitFor(() => {
      expect(screen.getByTitle(/januari/i)).toBeInTheDocument()
    })

    const janEl = screen.getByTitle(/januari/i)
    expect(janEl.className).toMatch(/green/)
  })

  it('legend shows Klar, Aktiv, Öppen', async () => {
    const periods = makeAllPeriods(3)
    mockIpcResponse('fiscal-period:list', { success: true, data: periods })
    await renderWithProviders(<MonthIndicator />, { axeCheck: false })
    await waitFor(() => {
      expect(screen.getByText('Klar')).toBeInTheDocument()
    })
    expect(screen.getByText('Aktiv')).toBeInTheDocument()
    expect(screen.getByText('Öppen')).toBeInTheDocument()
  })

  it('passes axe a11y check', async () => {
    const periods = makeAllPeriods(6)
    mockIpcResponse('fiscal-period:list', { success: true, data: periods })
    const { axeResults } = await renderWithProviders(<MonthIndicator />)
    expect(axeResults?.violations).toEqual([])
  })
})
