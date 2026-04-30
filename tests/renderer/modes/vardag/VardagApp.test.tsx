// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { VardagApp } from '../../../../src/renderer/modes/vardag/VardagApp'

beforeEach(() => {
  setupMockIpc()
  mockIpcResponse('settings:get', 'vardag')
})

describe('VardagApp (H+G-3 hero-screen)', () => {
  it('renders three BigButtons med korrekta etiketter', async () => {
    await renderWithProviders(<VardagApp />, { axeCheck: false }) // M133 exempt — dedicated axe test below

    await waitFor(() => {
      expect(screen.getByTestId('vardag-bigbtn-kostnad')).toBeInTheDocument()
    })
    expect(screen.getByTestId('vardag-bigbtn-faktura')).toBeInTheDocument()
    expect(screen.getByTestId('vardag-bigbtn-stang-manad')).toBeInTheDocument()
    expect(screen.getByText(/Bokför kostnad/)).toBeInTheDocument()
    expect(screen.getByText(/Skapa faktura/)).toBeInTheDocument()
    expect(screen.getByText(/Stäng månad/)).toBeInTheDocument()
  })

  it('renders status-pills och kbd-hints', async () => {
    await renderWithProviders(<VardagApp />, { axeCheck: false }) // M133 exempt — dedicated axe test below

    await waitFor(() => {
      expect(screen.getByTestId('vardag-status-pills')).toBeInTheDocument()
    })
    expect(screen.getByText(/Inkorgen är tom/)).toBeInTheDocument()
    expect(screen.getByText(/Momsperiod/)).toBeInTheDocument()
    expect(screen.getByText('⌘K')).toBeInTheDocument()
    // ⌘⇧B förekommer både i topbar-switch-knapp och kbd-hints — räcker med >0
    expect(screen.getAllByText('⌘⇧B').length).toBeGreaterThan(0)
  })

  it('renders greeting "Vad vill du göra idag?"', async () => {
    await renderWithProviders(<VardagApp />, { axeCheck: false }) // M133 exempt — dedicated axe test below
    await waitFor(() => {
      expect(screen.getByText(/Vad vill du göra idag/)).toBeInTheDocument()
    })
  })

  it('öppnar BokforKostnadSheet vid klick på kostnad-knapp', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<VardagApp />, { axeCheck: false }) // M133 exempt — dedicated axe test below

    await waitFor(() => {
      expect(screen.getByTestId('vardag-bigbtn-kostnad')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('vardag-bigbtn-kostnad'))

    // BottomSheet öppnar — sökord från sheet-titel
    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /Bokför kostnad/i }),
      ).toBeInTheDocument()
    })
  })

  it('öppnar SkapaFakturaSheet vid klick på faktura-knapp', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<VardagApp />, { axeCheck: false }) // M133 exempt — dedicated axe test below

    await waitFor(() => {
      expect(screen.getByTestId('vardag-bigbtn-faktura')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('vardag-bigbtn-faktura'))

    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /Skapa faktura/i }),
      ).toBeInTheDocument()
    })
  })

  it('Escape stänger öppen sheet', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<VardagApp />, { axeCheck: false }) // M133 exempt — dedicated axe test below

    await waitFor(() => {
      expect(screen.getByTestId('vardag-bigbtn-kostnad')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('vardag-bigbtn-kostnad'))
    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /Bokför kostnad/i }),
      ).toBeInTheDocument()
    })

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /Bokför kostnad/i }),
      ).not.toBeInTheDocument()
    })
  })

  it('passes axe a11y check', async () => {
    const { axeResults } = await renderWithProviders(<VardagApp />)
    expect(axeResults?.violations).toEqual([])
  })
})
