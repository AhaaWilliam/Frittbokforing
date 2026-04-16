// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent, act } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../setup/mock-ipc'
import { renderWithProviders } from '../../helpers/render-with-providers'
import { PageAgingReport } from '../../../src/renderer/pages/PageAgingReport'
import type { AgingReport } from '../../../src/main/services/aging-service'

const RECEIVABLES: AgingReport = {
  buckets: [
    { label: 'Ej förfallet', items: [], totalRemainingOre: 0 },
    {
      label: '1–30 dagar',
      items: [
        {
          id: 1,
          identifier: '#1',
          counterpartyName: 'Acme AB',
          totalAmountOre: 125_00,
          paidAmountOre: 0,
          remainingOre: 125_00,
          dueDate: '2026-05-20',
          daysOverdue: 26,
        },
      ],
      totalRemainingOre: 125_00,
    },
    { label: '31–60 dagar', items: [], totalRemainingOre: 0 },
    { label: '61–90 dagar', items: [], totalRemainingOre: 0 },
    { label: '90+ dagar', items: [], totalRemainingOre: 0 },
  ],
  totalRemainingOre: 125_00,
  asOfDate: '2026-06-15',
}

const PAYABLES: AgingReport = {
  buckets: [
    { label: 'Ej förfallet', items: [], totalRemainingOre: 0 },
    { label: '1–30 dagar', items: [], totalRemainingOre: 0 },
    {
      label: '31–60 dagar',
      items: [
        {
          id: 2,
          identifier: 'LF-001',
          counterpartyName: 'Leverantör AB',
          totalAmountOre: 250_00,
          paidAmountOre: 50_00,
          remainingOre: 200_00,
          dueDate: '2026-05-01',
          daysOverdue: 45,
        },
      ],
      totalRemainingOre: 200_00,
    },
    { label: '61–90 dagar', items: [], totalRemainingOre: 0 },
    { label: '90+ dagar', items: [], totalRemainingOre: 0 },
  ],
  totalRemainingOre: 200_00,
  asOfDate: '2026-06-15',
}

const EMPTY_REPORT: AgingReport = {
  buckets: [
    { label: 'Ej förfallet', items: [], totalRemainingOre: 0 },
    { label: '1–30 dagar', items: [], totalRemainingOre: 0 },
    { label: '31–60 dagar', items: [], totalRemainingOre: 0 },
    { label: '61–90 dagar', items: [], totalRemainingOre: 0 },
    { label: '90+ dagar', items: [], totalRemainingOre: 0 },
  ],
  totalRemainingOre: 0,
  asOfDate: '2026-06-15',
}

beforeEach(() => {
  setupMockIpc()
  mockIpcResponse('aging:receivables', { success: true, data: RECEIVABLES })
  mockIpcResponse('aging:payables', { success: true, data: PAYABLES })
})

describe('PageAgingReport', () => {
  it('renders title and receivables tab by default', async () => {
    await renderWithProviders(<PageAgingReport />, { axeCheck: false })

    await waitFor(() => {
      expect(screen.getByText('Åldersanalys')).toBeInTheDocument()
    })
    expect(screen.getByText('Kundfordringar')).toBeInTheDocument()
    expect(screen.getByText('Leverantörsskulder')).toBeInTheDocument()
  })

  it('shows receivables bucket with items', async () => {
    await renderWithProviders(<PageAgingReport />, { axeCheck: false })

    await waitFor(() => {
      expect(screen.getByText('Acme AB')).toBeInTheDocument()
    })
    expect(screen.getByText('#1')).toBeInTheDocument()
    expect(screen.getByText('1–30 dagar')).toBeInTheDocument()
  })

  it('shows total remaining', async () => {
    await renderWithProviders(<PageAgingReport />, { axeCheck: false })

    await waitFor(() => {
      expect(screen.getByText(/Totalt utestående/)).toBeInTheDocument()
    })
  })

  it('switches to payables tab', async () => {
    await renderWithProviders(<PageAgingReport />, { axeCheck: false })

    await waitFor(() => {
      expect(screen.getByText('Kundfordringar')).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(screen.getByText('Leverantörsskulder'))
    })

    await waitFor(() => {
      expect(screen.getByText('Leverantör AB')).toBeInTheDocument()
    })
    expect(screen.getByText('LF-001')).toBeInTheDocument()
  })

  it('empty report shows "Inga utestående poster"', async () => {
    mockIpcResponse('aging:receivables', { success: true, data: EMPTY_REPORT })
    await renderWithProviders(<PageAgingReport />, { axeCheck: false })

    await waitFor(() => {
      expect(screen.getByText(/Inga utestående poster/)).toBeInTheDocument()
    })
  })

  it('shows as_of_date disclaimer', async () => {
    await renderWithProviders(<PageAgingReport />, { axeCheck: false })

    await waitFor(() => {
      expect(screen.getByText(/Per datum: 2026-06-15/)).toBeInTheDocument()
    })
    expect(screen.getByText(/retroaktivt/)).toBeInTheDocument()
  })

  it('passes axe a11y check', async () => {
    const { axeResults } = await renderWithProviders(<PageAgingReport />)
    expect(axeResults?.violations).toEqual([])
  })
})
