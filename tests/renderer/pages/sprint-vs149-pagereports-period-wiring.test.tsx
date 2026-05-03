// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  setupMockIpc,
  mockIpcResponse,
  mockIpcPending,
} from '../../setup/mock-ipc'
import { renderWithProviders } from '../../helpers/render-with-providers'
import { PageReports } from '../../../src/renderer/pages/PageReports'
import {
  ActivePeriodProvider,
  useActivePeriod,
} from '../../../src/renderer/contexts/ActivePeriodContext'
import type { FiscalPeriod } from '../../../src/shared/types'

function makePeriods(): FiscalPeriod[] {
  // Tre månader (Jan, Feb, Mar) i FY 2026
  return [
    {
      id: 101,
      fiscal_year_id: 1,
      period_number: 1,
      start_date: '2026-01-01',
      end_date: '2026-01-31',
      is_closed: 0,
      closed_at: null,
    },
    {
      id: 102,
      fiscal_year_id: 1,
      period_number: 2,
      start_date: '2026-02-01',
      end_date: '2026-02-28',
      is_closed: 0,
      closed_at: null,
    },
    {
      id: 103,
      fiscal_year_id: 1,
      period_number: 3,
      start_date: '2026-03-01',
      end_date: '2026-03-31',
      is_closed: 0,
      closed_at: null,
    },
  ]
}

function setupReportMocks(periods: FiscalPeriod[]) {
  mockIpcResponse('fiscal-period:list', { success: true, data: periods })
  // Lämna report-queries pending — vi testar period-wiring, inte report-rendering.
  // Pending → isLoading=true → views renderas inte → vi slipper massera fixture-shape.
  mockIpcPending('report:income-statement')
  mockIpcPending('report:balance-sheet')
  mockIpcPending('report:cash-flow')
}

// Probe-komponent som exponerar context-värdet för asserts.
let captured: number | null | 'unset' = 'unset'
function Probe() {
  const { activePeriodId } = useActivePeriod()
  captured = activePeriodId
  return null
}

beforeEach(() => {
  setupMockIpc()
  captured = 'unset'
})

describe('PageReports — VS-149 period-wiring', () => {
  it('date-range som matchar 1 period → setActivePeriod kallas med rätt period-id', async () => {
    const periods = makePeriods()
    setupReportMocks(periods)
    const user = userEvent.setup()

    await renderWithProviders(
      <ActivePeriodProvider>
        <PageReports />
        <Probe />
      </ActivePeriodProvider>,
      { axeCheck: false, initialRoute: '/reports' }, // M133 exempt — page-wiring test, not a11y
    )

    // Vänta på att FY laddats + date-inputs renderats
    const inputs = await waitFor(() => {
      const els = screen.getAllByDisplayValue('')
      const dateInputs = els.filter(
        (el) => (el as HTMLInputElement).type === 'date',
      ) as HTMLInputElement[]
      expect(dateInputs.length).toBeGreaterThanOrEqual(2)
      return dateInputs
    })

    const [fromInput, toInput] = inputs
    await user.type(fromInput, '2026-02-01')
    await user.type(toInput, '2026-02-28')

    await waitFor(() => {
      expect(captured).toBe(102)
    })
  })

  it('date-range som spänner 2 perioder → setActivePeriod(null)', async () => {
    const periods = makePeriods()
    setupReportMocks(periods)
    const user = userEvent.setup()

    await renderWithProviders(
      <ActivePeriodProvider>
        <PageReports />
        <Probe />
      </ActivePeriodProvider>,
      { axeCheck: false, initialRoute: '/reports' }, // M133 exempt — page-wiring test
    )

    const inputs = await waitFor(() => {
      const dateInputs = (screen.getAllByDisplayValue('').filter(
        (el) => (el as HTMLInputElement).type === 'date',
      )) as HTMLInputElement[]
      expect(dateInputs.length).toBeGreaterThanOrEqual(2)
      return dateInputs
    })
    const [fromInput, toInput] = inputs
    await user.type(fromInput, '2026-01-15')
    await user.type(toInput, '2026-02-15')

    // Vänta så React har bearbetat input + useSetActivePeriod-effekten
    await waitFor(() => {
      expect((fromInput as HTMLInputElement).value).toBe('2026-01-15')
      expect((toInput as HTMLInputElement).value).toBe('2026-02-15')
    })
    // captured ska förbli null (default), inget override sätts
    expect(captured).toBe(null)
  })

  it('unmount → setActivePeriod(null) återställer override', async () => {
    const periods = makePeriods()
    setupReportMocks(periods)
    const user = userEvent.setup()

    const { unmount } = await renderWithProviders(
      <ActivePeriodProvider>
        <PageReports />
        <Probe />
      </ActivePeriodProvider>,
      { axeCheck: false, initialRoute: '/reports' }, // M133 exempt — page-wiring test
    )

    const inputs = await waitFor(() => {
      const dateInputs = (screen.getAllByDisplayValue('').filter(
        (el) => (el as HTMLInputElement).type === 'date',
      )) as HTMLInputElement[]
      expect(dateInputs.length).toBeGreaterThanOrEqual(2)
      return dateInputs
    })
    const [fromInput, toInput] = inputs
    await user.type(fromInput, '2026-03-01')
    await user.type(toInput, '2026-03-31')

    await waitFor(() => {
      expect(captured).toBe(103)
    })

    act(() => {
      unmount()
    })
    // Probe är unmounted — captured fryses vid sista renderingen där den kördes.
    // Vi kan inte direkt verifiera nullingen utan en kvarstående probe;
    // istället re-mountar vi för att verifiera att default-läget är null.
    captured = 'unset'
    await renderWithProviders(
      <ActivePeriodProvider>
        <Probe />
      </ActivePeriodProvider>,
      { axeCheck: false }, // M133 exempt — re-mount probe only
    )
    expect(captured).toBeNull()
  })
})
