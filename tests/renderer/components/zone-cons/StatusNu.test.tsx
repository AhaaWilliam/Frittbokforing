// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusNu } from '../../../../src/renderer/components/zone-cons/StatusNu'

vi.mock('../../../../src/renderer/lib/hooks', () => ({
  useDashboardSummary: vi.fn(),
}))

vi.mock('../../../../src/renderer/contexts/FiscalYearContext', () => ({
  useFiscalYearContextOptional: vi.fn(),
}))

import { useDashboardSummary } from '../../../../src/renderer/lib/hooks'
import { useFiscalYearContextOptional } from '../../../../src/renderer/contexts/FiscalYearContext'

const mockUseDashboard = vi.mocked(useDashboardSummary)
const mockUseFY = vi.mocked(useFiscalYearContextOptional)

const FY_CONTEXT = {
  activeFiscalYear: {
    id: 1,
    company_id: 1,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    status: 'open',
  },
} as unknown as ReturnType<typeof useFiscalYearContextOptional>

function makeQueryResult(data: unknown, isLoading = false) {
  return { data, isLoading } as unknown as ReturnType<
    typeof useDashboardSummary
  >
}

describe('StatusNu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty-state when no active fiscal year', () => {
    mockUseFY.mockReturnValue(null)
    mockUseDashboard.mockReturnValue(makeQueryResult(null))
    render(<StatusNu />)
    expect(screen.getByText(/Inget aktivt räkenskapsår/)).toBeInTheDocument()
  })

  it('renders loading-state while data is fetching', () => {
    mockUseFY.mockReturnValue(FY_CONTEXT)
    mockUseDashboard.mockReturnValue(makeQueryResult(null, true))
    render(<StatusNu />)
    expect(screen.getByText(/Hämtar status/)).toBeInTheDocument()
  })

  it('renders four status-cards when data loaded', () => {
    mockUseFY.mockReturnValue(FY_CONTEXT)
    mockUseDashboard.mockReturnValue(
      makeQueryResult({
        revenueOre: 10000000,
        expensesOre: 5000000,
        operatingResultOre: 5000000,
        vatOutgoingOre: 2500000,
        vatIncomingOre: 1250000,
        vatNetOre: 1250000,
        unpaidReceivablesOre: 0,
        unpaidPayablesOre: 0,
        bankBalanceOre: 250000,
      }),
    )
    render(<StatusNu />)
    expect(screen.getByText('Likvida medel')).toBeInTheDocument()
    expect(screen.getByText('Obetalt')).toBeInTheDocument()
    expect(screen.getByText('Moms-netto')).toBeInTheDocument()
    expect(screen.getByText('Resultat hittills')).toBeInTheDocument()
  })

  it('shows "Att betala" when vat-net is positive (skuld)', () => {
    mockUseFY.mockReturnValue(FY_CONTEXT)
    mockUseDashboard.mockReturnValue(
      makeQueryResult({
        revenueOre: 0,
        expensesOre: 0,
        operatingResultOre: 0,
        vatOutgoingOre: 0,
        vatIncomingOre: 0,
        vatNetOre: 1000000, // positiv = att betala
        unpaidReceivablesOre: 0,
        unpaidPayablesOre: 0,
        bankBalanceOre: 0,
      }),
    )
    render(<StatusNu />)
    expect(screen.getByText('Att betala')).toBeInTheDocument()
  })

  it('shows "Att få tillbaka" when vat-net is non-positive', () => {
    mockUseFY.mockReturnValue(FY_CONTEXT)
    mockUseDashboard.mockReturnValue(
      makeQueryResult({
        revenueOre: 0,
        expensesOre: 0,
        operatingResultOre: 0,
        vatOutgoingOre: 0,
        vatIncomingOre: 0,
        vatNetOre: -500000, // negativ = att få tillbaka
        unpaidReceivablesOre: 0,
        unpaidPayablesOre: 0,
        bankBalanceOre: 0,
      }),
    )
    render(<StatusNu />)
    expect(screen.getByText('Att få tillbaka')).toBeInTheDocument()
  })
})
