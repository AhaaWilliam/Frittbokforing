// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
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
    // VS-115c: pillen visar "Moms <period>: <datum> (<dagar>)" eller
    // "Moms: ingen deadline" (om FY saknas i mock).
    expect(screen.getByTestId('vardag-pill-vat')).toBeInTheDocument()
    expect(screen.getByText('⌘K')).toBeInTheDocument()
    // ⌘⇧B förekommer både i topbar-switch-knapp och kbd-hints — räcker med >0
    expect(screen.getAllByText('⌘⇧B').length).toBeGreaterThan(0)
    // VS-24
    expect(screen.getByText('⌘N')).toBeInTheDocument()
    expect(screen.getByText('⌘I')).toBeInTheDocument()
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

  // VS-59: regressionstest för VS-42 (latest-verification-pill).
  it('VS-42 visar "Senast bokfört: A0042" när IPC returnerar data', async () => {
    mockIpcResponse('journal:latest-verification', {
      success: true,
      data: { series: 'A', number: 42, entry_date: '2026-04-15' },
    })
    await renderWithProviders(<VardagApp />, { axeCheck: false }) // M133 exempt — dedicated axe test above
    await waitFor(() => {
      expect(screen.getByTestId('vardag-pill-latest')).toBeInTheDocument()
    })
    expect(screen.getByTestId('vardag-pill-latest')).toHaveTextContent(
      'Senast bokfört: A0042',
    )
  })

  // VS-62: dayLabel och greeting refreshar vid timme/dag-skifte
  describe('VS-62 minute-tick refresh', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('greeting går från "God morgon" till "Hej" vid 10:00-passering', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      vi.setSystemTime(new Date('2026-05-02T09:59:00'))

      await renderWithProviders(<VardagApp />, { axeCheck: false }) // M133 exempt — dedicated axe test above

      await waitFor(() => {
        expect(screen.getByText(/God morgon/)).toBeInTheDocument()
      })

      await act(async () => {
        vi.setSystemTime(new Date('2026-05-02T10:00:30'))
        await vi.advanceTimersByTimeAsync(60_000)
      })

      await waitFor(() => {
        expect(screen.getByText(/^Hej\.$/)).toBeInTheDocument()
      })
    })
  })

  // VS-117: VAT-pillen är klickbar och navigerar till /vat i bokförare-läget.
  it('VS-117 klick på vat-pill navigerar till /vat och växlar mode', async () => {
    const user = userEvent.setup()
    window.location.hash = '/'
    await renderWithProviders(<VardagApp />, { axeCheck: false }) // M133 exempt — dedicated axe test above

    await waitFor(() => {
      expect(screen.getByTestId('vardag-pill-vat')).toBeInTheDocument()
    })
    const pill = screen.getByTestId('vardag-pill-vat')
    expect(pill.tagName).toBe('BUTTON')
    await user.click(pill)
    await waitFor(() => {
      expect(window.location.hash).toContain('/vat')
    })
  })

  // VS-118: mod+k i Vardag växlar till bokförare och dispatchar
  // global-search:focus så GlobalSearch-input tar fokus.
  it('VS-118 mod+k växlar mode och dispatchar global-search:focus', async () => {
    const events: string[] = []
    const listener = () => events.push('focus-requested')
    window.addEventListener('global-search:focus', listener)

    await renderWithProviders(<VardagApp />, { axeCheck: false }) // M133 exempt — dedicated axe test above
    await waitFor(() => {
      expect(screen.getByTestId('vardag-hero')).toBeInTheDocument()
    })

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true }),
      )
      // setTimeout(0) inom handlern → flush via real timers.
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    expect(events).toContain('focus-requested')
    window.removeEventListener('global-search:focus', listener)
  })

  it('VS-42 visar inte latest-pill när IPC returnerar null', async () => {
    mockIpcResponse('journal:latest-verification', {
      success: true,
      data: null,
    })
    await renderWithProviders(<VardagApp />, { axeCheck: false }) // M133 exempt — dedicated axe test above
    await waitFor(() => {
      expect(screen.getByTestId('vardag-status-pills')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('vardag-pill-latest')).not.toBeInTheDocument()
  })
})
