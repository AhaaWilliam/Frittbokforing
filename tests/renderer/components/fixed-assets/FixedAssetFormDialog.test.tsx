// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { FixedAssetFormDialog } from '../../../../src/renderer/components/fixed-assets/FixedAssetFormDialog'
import type { FixedAssetWithAccumulation } from '../../../../src/shared/types'

const ASSET: FixedAssetWithAccumulation = {
  id: 42,
  company_id: 1,
  name: 'MacBook Pro',
  acquisition_date: '2025-03-15',
  acquisition_cost_ore: 2_500_000,
  residual_value_ore: 100_000,
  useful_life_months: 24,
  method: 'declining',
  declining_rate_bp: 2500,
  account_asset: '1220',
  account_accumulated_depreciation: '1229',
  account_depreciation_expense: '7832',
  status: 'active',
  disposed_date: null,
  disposed_journal_entry_id: null,
  created_at: '2025-03-15',
  updated_at: '2025-03-15',
  accumulated_depreciation_ore: 0,
  book_value_ore: 2_500_000,
  schedules_generated: 24,
  schedules_executed: 0,
}

beforeEach(() => {
  setupMockIpc()
})

describe('FixedAssetFormDialog — create mode', () => {
  it('axe-check passes', async () => {
    const { axeResults } = await renderWithProviders(
      <FixedAssetFormDialog
        open
        onOpenChange={vi.fn()}
        mode="create"
      />,
    )
    expect(axeResults?.violations).toEqual([])
  })

  it('visar "Ny anläggningstillgång" som titel', async () => {
    await renderWithProviders(
      <FixedAssetFormDialog open onOpenChange={vi.fn()} mode="create" />,
      { axeCheck: false }, // M133 exempt — dedicated axe test above
    )
    expect(screen.getByText('Ny anläggningstillgång')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skapa tillgång' })).toBeInTheDocument()
  })

  it('fälten är tomma/defaults', async () => {
    await renderWithProviders(
      <FixedAssetFormDialog open onOpenChange={vi.fn()} mode="create" />,
      { axeCheck: false }, // M133 exempt — dedicated axe test above
    )
    expect(screen.getByTestId('fa-name')).toHaveValue('')
    expect(screen.getByTestId('fa-cost')).toHaveValue(null)
    expect(screen.getByLabelText(/Anskaffning$/i)).toHaveValue('1220')
  })
})

describe('FixedAssetFormDialog — edit mode', () => {
  it('axe-check passes (edit mode)', async () => {
    const { axeResults } = await renderWithProviders(
      <FixedAssetFormDialog
        open
        onOpenChange={vi.fn()}
        mode="edit"
        initialAsset={ASSET}
      />,
    )
    expect(axeResults?.violations).toEqual([])
  })

  it('pre-populerar fält från initialAsset med .toFixed(2)-format', async () => {
    await renderWithProviders(
      <FixedAssetFormDialog
        open
        onOpenChange={vi.fn()}
        mode="edit"
        initialAsset={ASSET}
      />,
      { axeCheck: false }, // M133 exempt — dedicated axe test above
    )
    expect(screen.getByTestId('fa-name')).toHaveValue('MacBook Pro')
    expect(screen.getByTestId('fa-cost')).toHaveValue(25000)
    expect(screen.getByLabelText(/Restvärde/i)).toHaveValue(1000)
    expect(screen.getByLabelText(/Nyttjandeperiod/i)).toHaveValue(24)
    expect(screen.getByLabelText(/Avskrivningssats/i)).toHaveValue(25)
  })

  it('titel är "Redigera {name}" + submit-text "Spara ändringar"', async () => {
    await renderWithProviders(
      <FixedAssetFormDialog
        open
        onOpenChange={vi.fn()}
        mode="edit"
        initialAsset={ASSET}
      />,
      { axeCheck: false }, // M133 exempt — dedicated axe test above
    )
    expect(screen.getByText('Redigera MacBook Pro')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spara ändringar' })).toBeInTheDocument()
  })

  it('konto-fält är editable i edit-mode', async () => {
    await renderWithProviders(
      <FixedAssetFormDialog
        open
        onOpenChange={vi.fn()}
        mode="edit"
        initialAsset={ASSET}
      />,
      { axeCheck: false }, // M133 exempt — dedicated axe test above
    )
    const assetAccount = screen.getByLabelText(/Anskaffning$/i)
    expect(assetAccount).not.toBeDisabled()
  })

  it('handleAssetAccountChange auto-populerar INTE i edit-mode', async () => {
    const user = userEvent.setup()
    await renderWithProviders(
      <FixedAssetFormDialog
        open
        onOpenChange={vi.fn()}
        mode="edit"
        initialAsset={ASSET}
      />,
      { axeCheck: false }, // M133 exempt — dedicated axe test above
    )
    const assetAccount = screen.getByLabelText(/Anskaffning$/i) as HTMLInputElement
    const accAccount = screen.getByLabelText(/Ack. avskrivningar/i) as HTMLInputElement
    const expAccount = screen.getByLabelText(/Avskrivningskostnad/i) as HTMLInputElement

    expect(accAccount.value).toBe('1229')
    expect(expAccount.value).toBe('7832')

    await user.clear(assetAccount)
    await user.type(assetAccount, '1230')

    // Initialvärden ska inte skrivas över
    expect(accAccount.value).toBe('1229')
    expect(expAccount.value).toBe('7832')
  })

  it('submit anropar updateFixedAsset med rätt payload', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    mockIpcResponse('depreciation:update-asset', {
      success: true,
      data: { scheduleCount: 24 },
    })
    await renderWithProviders(
      <FixedAssetFormDialog
        open
        onOpenChange={onOpenChange}
        mode="edit"
        initialAsset={ASSET}
      />,
      { axeCheck: false }, // M133 exempt — dedicated axe test above
    )
    const name = screen.getByTestId('fa-name')
    await user.clear(name)
    await user.type(name, 'Macbook (uppdaterad)')
    await user.click(screen.getByRole('button', { name: 'Spara ändringar' }))

    const api = window.api as unknown as {
      updateFixedAsset: ReturnType<typeof vi.fn>
    }
    expect(api.updateFixedAsset).toHaveBeenCalledTimes(1)
    const call = api.updateFixedAsset.mock.calls[0][0] as {
      id: number
      input: { name: string }
    }
    expect(call.id).toBe(42)
    expect(call.input.name).toBe('Macbook (uppdaterad)')
  })
})
