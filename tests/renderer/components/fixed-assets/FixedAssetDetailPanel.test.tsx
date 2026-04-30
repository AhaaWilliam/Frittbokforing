// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse, mockIpcPending } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { FixedAssetDetailPanel } from '../../../../src/renderer/components/fixed-assets/FixedAssetDetailPanel'

beforeEach(() => {
  setupMockIpc()
})

interface ScheduleRow {
  id: number
  period_number: number
  period_start: string
  period_end: string
  amount_ore: number
  status: string
  journal_entry_id: number | null
}

function makeAssetData(overrides?: {
  method?: 'linear' | 'declining'
  declining_rate_bp?: number | null
  status?: 'active' | 'disposed' | 'fully_depreciated'
  disposed_date?: string | null
  schedule?: ScheduleRow[]
}) {
  return {
    id: 1,
    fiscal_year_id: 1,
    name: 'Dator',
    acquisition_date: '2026-01-01',
    acquisition_cost_ore: 1500000,
    residual_value_ore: 100000,
    useful_life_months: 36,
    method: overrides?.method ?? 'linear',
    declining_rate_bp: overrides?.declining_rate_bp ?? null,
    account_asset: '1230',
    account_accumulated_depreciation: '1239',
    account_depreciation_expense: '7832',
    status: overrides?.status ?? 'active',
    disposed_date: overrides?.disposed_date ?? null,
    created_at: '',
    schedule:
      overrides?.schedule ??
      ([
        {
          id: 1,
          period_number: 1,
          period_start: '2026-01-01',
          period_end: '2026-01-31',
          amount_ore: 38888,
          status: 'executed',
          journal_entry_id: 100,
        },
        {
          id: 2,
          period_number: 2,
          period_start: '2026-02-01',
          period_end: '2026-02-28',
          amount_ore: 38888,
          status: 'pending',
          journal_entry_id: null,
        },
      ] satisfies ScheduleRow[]),
  }
}

describe('FixedAssetDetailPanel', () => {
  it('visar LoadingSpinner medan data hämtas', async () => {
    mockIpcPending('depreciation:get')
    await renderWithProviders(<FixedAssetDetailPanel assetId={1} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('visar fel-text när data är null', async () => {
    mockIpcResponse('depreciation:get', { success: true, data: null })
    await renderWithProviders(<FixedAssetDetailPanel assetId={1} />)
    await waitFor(() => {
      expect(screen.getByText(/Kunde inte hämta detaljer/)).toBeInTheDocument()
    })
  })

  it('visar Linjär metod-label', async () => {
    mockIpcResponse('depreciation:get', {
      success: true,
      data: makeAssetData({ method: 'linear' }),
    })
    await renderWithProviders(<FixedAssetDetailPanel assetId={1} />)
    await waitFor(() => {
      expect(screen.getByText('Linjär')).toBeInTheDocument()
    })
  })

  it('visar Degressiv metod-label med rate', async () => {
    mockIpcResponse('depreciation:get', {
      success: true,
      data: makeAssetData({ method: 'declining', declining_rate_bp: 250 }),
    })
    await renderWithProviders(<FixedAssetDetailPanel assetId={1} />)
    await waitFor(() => {
      expect(
        screen.getByText(/Degressiv \(2\.5% per månad\)/),
      ).toBeInTheDocument()
    })
  })

  it('visar nyttjandetid och konton', async () => {
    mockIpcResponse('depreciation:get', { success: true, data: makeAssetData() })
    await renderWithProviders(<FixedAssetDetailPanel assetId={1} />)
    await waitFor(() => {
      expect(screen.getByText(/36 mån/)).toBeInTheDocument()
    })
    expect(screen.getByText('1230')).toBeInTheDocument()
    expect(screen.getByText('1239')).toBeInTheDocument()
    expect(screen.getByText('7832')).toBeInTheDocument()
  })

  it('visar avyttrad-datum när status="disposed"', async () => {
    mockIpcResponse('depreciation:get', {
      success: true,
      data: makeAssetData({
        status: 'disposed',
        disposed_date: '2026-06-15',
      }),
    })
    await renderWithProviders(<FixedAssetDetailPanel assetId={1} />)
    await waitFor(() => {
      expect(screen.getByText('2026-06-15')).toBeInTheDocument()
    })
  })

  it('rendrar schedule-tabell med Bokförd/Väntar pill-status', async () => {
    mockIpcResponse('depreciation:get', { success: true, data: makeAssetData() })
    await renderWithProviders(<FixedAssetDetailPanel assetId={1} />)
    await waitFor(() => {
      expect(screen.getByTestId('fa-schedule-1')).toBeInTheDocument()
    })
    expect(screen.getByText('Bokförd')).toBeInTheDocument()
    expect(screen.getByText('Väntar')).toBeInTheDocument()
    // Verifikat-id för executed-rad
    expect(screen.getByText('#100')).toBeInTheDocument()
    // pending-rad har em-dash
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
