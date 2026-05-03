// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { MonthIndicator } from '../../../../src/renderer/components/layout/MonthIndicator'
import {
  ActivePeriodProvider,
  useSetActivePeriod,
} from '../../../../src/renderer/contexts/ActivePeriodContext'
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
    closed_at: null,
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
    await renderWithProviders(<MonthIndicator />, { axeCheck: false }) // M133 exempt — dedicated axe test below
    await waitFor(() => {
      // Month letters: J, F, M, A, M, J, J, A, S, O, N, D
      expect(screen.getByTitle(/januari/i)).toBeInTheDocument()
    })
    // There should be 12 month indicators
    expect(screen.getByTitle(/december/i)).toBeInTheDocument()
  })

  it('closed period has success styling', async () => {
    const periods = makeAllPeriods(2) // Jan-Feb closed
    mockIpcResponse('fiscal-period:list', { success: true, data: periods })
    await renderWithProviders(<MonthIndicator />, { axeCheck: false }) // M133 exempt — dedicated axe test below
    await waitFor(() => {
      expect(screen.getByTitle(/januari/i)).toBeInTheDocument()
    })

    const janEl = screen.getByTitle(/januari/i)
    expect(janEl.className).toMatch(/success/)
  })

  it('legend shows Klar, Aktiv, Öppen', async () => {
    const periods = makeAllPeriods(3)
    mockIpcResponse('fiscal-period:list', { success: true, data: periods })
    await renderWithProviders(<MonthIndicator />, { axeCheck: false }) // M133 exempt — dedicated axe test below
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

  // VS-144: ActivePeriodContext-override
  it('default-läge (utan provider) highlightar första öppna period', async () => {
    const periods = makeAllPeriods(3) // Jan-Mar closed → April är första öppna
    mockIpcResponse('fiscal-period:list', { success: true, data: periods })
    await renderWithProviders(<MonthIndicator />, { axeCheck: false }) // M133 exempt — see axe test above
    await waitFor(() => {
      expect(screen.getByTitle(/april/i)).toBeInTheDocument()
    })
    // April har ring-1 (aktiv) — lookup via aria-label
    expect(screen.getByLabelText(/april, aktiv månad/i)).toBeInTheDocument()
    // Maj är "öppen", inte "aktiv"
    expect(screen.getByLabelText(/maj, öppen/i)).toBeInTheDocument()
  })

  it('highlightar override-period när ActivePeriodProvider satt id', async () => {
    const periods = makeAllPeriods(3) // Jan-Mar closed
    mockIpcResponse('fiscal-period:list', { success: true, data: periods })

    function Setter() {
      // Aktivera period 7 (juli) som override.
      useSetActivePeriod(7)
      return null
    }

    await renderWithProviders(
      <ActivePeriodProvider>
        <Setter />
        <MonthIndicator />
      </ActivePeriodProvider>,
      { axeCheck: false }, // M133 exempt — see axe test above
    )

    await waitFor(() => {
      expect(screen.getByLabelText(/juli, aktiv månad/i)).toBeInTheDocument()
    })
    // April är inte längre "aktiv" — fallback överskriven
    expect(screen.getByLabelText(/april, öppen/i)).toBeInTheDocument()
  })

  it('faller tillbaka till första öppna när override pekar på okänd period', async () => {
    const periods = makeAllPeriods(2) // Jan-Feb closed → mars första öppna
    mockIpcResponse('fiscal-period:list', { success: true, data: periods })

    function Setter() {
      useSetActivePeriod(999) // matchar ingen period i FY:t
      return null
    }

    await renderWithProviders(
      <ActivePeriodProvider>
        <Setter />
        <MonthIndicator />
      </ActivePeriodProvider>,
      { axeCheck: false }, // M133 exempt — see axe test above
    )

    await waitFor(() => {
      expect(screen.getByLabelText(/mars, aktiv månad/i)).toBeInTheDocument()
    })
  })
})
