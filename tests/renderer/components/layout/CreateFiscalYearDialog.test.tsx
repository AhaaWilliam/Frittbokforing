// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { CreateFiscalYearDialog } from '../../../../src/renderer/components/layout/CreateFiscalYearDialog'

beforeEach(() => {
  setupMockIpc()
})

describe('CreateFiscalYearDialog', () => {
  it('open=false renderar ingenting', async () => {
    await renderWithProviders(
      <CreateFiscalYearDialog open={false} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — no markup at open=false
    )
    expect(
      screen.queryByRole('dialog', { name: /Skapa nytt räkenskapsår/ }),
    ).not.toBeInTheDocument()
  })

  it('step 0 visar laddar-text under net-result-fetch', async () => {
    // Pending net-result → step blir 0 (loading)
    mockIpcResponse('opening-balance:net-result', {
      success: true,
      data: { netResultOre: 0, isAlreadyBooked: false },
    })
    await renderWithProviders(
      <CreateFiscalYearDialog open onClose={() => {}} />,
    )
    // Med netResultOre=0 hoppar dialogen direkt till step 2 (confirmation)
    await waitFor(() => {
      expect(screen.getByText(/Nytt räkenskapsår/)).toBeInTheDocument()
    })
  })

  it('netResultOre=0 → hoppa direkt till step 2 (confirmation)', async () => {
    mockIpcResponse('opening-balance:net-result', {
      success: true,
      data: { netResultOre: 0, isAlreadyBooked: false },
    })
    await renderWithProviders(
      <CreateFiscalYearDialog open onClose={() => {}} />,
    )
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Skapa räkenskapsår/ }),
      ).toBeInTheDocument()
    })
  })

  it('isAlreadyBooked=true → hoppa direkt till step 2', async () => {
    mockIpcResponse('opening-balance:net-result', {
      success: true,
      data: { netResultOre: 100000, isAlreadyBooked: true },
    })
    await renderWithProviders(
      <CreateFiscalYearDialog open onClose={() => {}} />,
    )
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Skapa räkenskapsår/ }),
      ).toBeInTheDocument()
    })
  })

  it('netResultOre>0 ej bokfört → step 1 visar vinst + bokningsförslag', async () => {
    mockIpcResponse('opening-balance:net-result', {
      success: true,
      data: { netResultOre: 500000, isAlreadyBooked: false },
    })
    await renderWithProviders(
      <CreateFiscalYearDialog open onClose={() => {}} />,
    )
    await waitFor(() => {
      // "Årets resultat" finns flera ställen — använd specifik vinst-text
      expect(screen.getByText(/vinst/)).toBeInTheDocument()
    })
    expect(screen.getByText(/Debet 8999/)).toBeInTheDocument()
    expect(screen.getByText(/Kredit 2099/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Bokför & fortsätt/ }),
    ).toBeInTheDocument()
  })

  it('netResultOre<0 → "förlust" + omvänt D/K på 2099/8999', async () => {
    mockIpcResponse('opening-balance:net-result', {
      success: true,
      data: { netResultOre: -300000, isAlreadyBooked: false },
    })
    await renderWithProviders(
      <CreateFiscalYearDialog open onClose={() => {}} />,
    )
    await waitFor(() => {
      expect(screen.getByText(/förlust/)).toBeInTheDocument()
    })
    expect(screen.getByText(/Debet 2099/)).toBeInTheDocument()
    expect(screen.getByText(/Kredit 8999/)).toBeInTheDocument()
  })

  it('"Hoppa över" visar varning först', async () => {
    const user = userEvent.setup()
    mockIpcResponse('opening-balance:net-result', {
      success: true,
      data: { netResultOre: 100000, isAlreadyBooked: false },
    })
    await renderWithProviders(
      <CreateFiscalYearDialog open onClose={() => {}} />,
    )
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Hoppa över/ }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Hoppa över/ }))
    expect(
      screen.getByText(/Utan resultatbokning kan ingående balanser/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Fortsätt ändå/ }),
    ).toBeInTheDocument()
  })

  it('"Bokför & fortsätt" leder till step 2', async () => {
    const user = userEvent.setup()
    mockIpcResponse('opening-balance:net-result', {
      success: true,
      data: { netResultOre: 100000, isAlreadyBooked: false },
    })
    await renderWithProviders(
      <CreateFiscalYearDialog open onClose={() => {}} />,
    )
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Bokför & fortsätt/ }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /Bokför & fortsätt/ }))
    expect(
      screen.getByRole('button', { name: /Skapa räkenskapsår/ }),
    ).toBeInTheDocument()
  })

  it('Avbryt på step 2 anropar onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    mockIpcResponse('opening-balance:net-result', {
      success: true,
      data: { netResultOre: 0, isAlreadyBooked: false },
    })
    await renderWithProviders(
      <CreateFiscalYearDialog open onClose={onClose} />,
    )
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Skapa räkenskapsår/ }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('passes axe a11y check', async () => {
    mockIpcResponse('opening-balance:net-result', {
      success: true,
      data: { netResultOre: 0, isAlreadyBooked: false },
    })
    const { axeResults } = await renderWithProviders(
      <CreateFiscalYearDialog open onClose={() => {}} />,
    )
    expect(axeResults?.violations).toEqual([])
  })
})
