// @vitest-environment jsdom
/**
 * Sprint 22 — Vardag routing + bottom-nav.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { HashRouter } from '../../../../src/renderer/lib/router'
import {
  vardagRoutes,
  VARDAG_FALLBACK,
} from '../../../../src/renderer/modes/vardag/vardag-routes'
import { VardagBottomNav } from '../../../../src/renderer/modes/vardag/VardagBottomNav'
import { VardagPageInbox } from '../../../../src/renderer/modes/vardag/VardagPageInbox'
import { VardagPageSpend } from '../../../../src/renderer/modes/vardag/VardagPageSpend'
import { VardagPageIncome } from '../../../../src/renderer/modes/vardag/VardagPageIncome'
import { VardagPageStatus } from '../../../../src/renderer/modes/vardag/VardagPageStatus'

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
}

beforeEach(() => {
  // Reset hash så HashRouter:s init blir deterministisk
  window.location.hash = ''
  ;(window as unknown as { api: unknown }).api = {
    getSetting: vi.fn().mockResolvedValue('vardag'),
    setSetting: vi.fn().mockResolvedValue(undefined),
  }
})

afterEach(() => {
  delete (window as unknown as { api?: unknown }).api
})

function renderWithRouter(initialPath: string, ui: React.ReactNode) {
  window.location.hash = initialPath
  return render(
    <HashRouter routes={[...vardagRoutes]} fallback={VARDAG_FALLBACK}>
      {ui}
    </HashRouter>,
  )
}

describe('VardagBottomNav', () => {
  it('renders four nav items', () => {
    renderWithRouter('/v/inbox', <VardagBottomNav />)
    expect(screen.getByTestId('vardag-nav-inbox')).toBeInTheDocument()
    expect(screen.getByTestId('vardag-nav-spend')).toBeInTheDocument()
    expect(screen.getByTestId('vardag-nav-income')).toBeInTheDocument()
    expect(screen.getByTestId('vardag-nav-status')).toBeInTheDocument()
  })

  it('marks active item with aria-current', () => {
    renderWithRouter('/v/spend', <VardagBottomNav />)
    const spend = screen.getByTestId('vardag-nav-spend')
    expect(spend.getAttribute('aria-current')).toBe('page')
    const inbox = screen.getByTestId('vardag-nav-inbox')
    expect(inbox.getAttribute('aria-current')).toBeNull()
  })

  it('clicking nav item updates hash', async () => {
    renderWithRouter('/v/inbox', <VardagBottomNav />)
    await userEvent.click(screen.getByTestId('vardag-nav-status'))
    expect(window.location.hash).toBe('#/v/status')
  })

  it('uses semantic <nav> with aria-label', () => {
    renderWithRouter('/v/inbox', <VardagBottomNav />)
    const nav = screen.getByRole('navigation', { name: 'Huvudnavigation' })
    expect(nav).toBeInTheDocument()
  })

  it('passes axe a11y check', async () => {
    const { container } = renderWithRouter('/v/inbox', <VardagBottomNav />)
    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})

describe('Vardag pages', () => {
  it('VardagPageInbox renders heading and tip', () => {
    render(<VardagPageInbox />)
    expect(screen.getByRole('heading', { name: 'Inkorg' })).toBeInTheDocument()
    expect(screen.getByText(/Hur fungerar inkorgen/)).toBeInTheDocument()
  })

  it('VardagPageSpend renders fallback link to Bokförare', async () => {
    render(<VardagPageSpend />)
    expect(
      screen.getByRole('heading', { name: 'Lägg till kostnad' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('spend-fallback-link')).toBeInTheDocument()
  })

  it('VardagPageSpend fallback-link calls setMode(bokforare)', async () => {
    const setSetting = vi.fn().mockResolvedValue(undefined)
    ;(window as unknown as { api: unknown }).api = {
      getSetting: vi.fn().mockResolvedValue('vardag'),
      setSetting,
    }
    render(<VardagPageSpend />)
    await userEvent.click(screen.getByTestId('spend-fallback-link'))
    expect(setSetting).toHaveBeenCalledWith('ui_mode', 'bokforare')
  })

  it('VardagPageIncome renders heading and fallback link', () => {
    render(<VardagPageIncome />)
    expect(
      screen.getByRole('heading', { name: 'Skicka faktura' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('income-fallback-link')).toBeInTheDocument()
  })

  it('VardagPageStatus renders three KPI-cards', () => {
    render(<VardagPageStatus />)
    expect(screen.getByText('Pengar i kassan')).toBeInTheDocument()
    expect(screen.getByText('Moms att betala')).toBeInTheDocument()
    expect(screen.getByText('Resultat YTD')).toBeInTheDocument()
  })

  it.each([
    ['Inbox', VardagPageInbox],
    ['Spend', VardagPageSpend],
    ['Income', VardagPageIncome],
    ['Status', VardagPageStatus],
  ] as const)('axe a11y on %s', async (_label, Page) => {
    const { container } = render(<Page />)
    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})

describe('vardag-routes', () => {
  it('all routes have /v/ prefix', () => {
    for (const route of vardagRoutes) {
      expect(route.pattern).toMatch(/^\/v\//)
    }
  })

  it('VARDAG_FALLBACK matchar en av routes', () => {
    expect(vardagRoutes.some((r) => r.pattern === VARDAG_FALLBACK)).toBe(true)
  })

  it('all page-id:s börjar med v-', () => {
    for (const route of vardagRoutes) {
      expect(route.page).toMatch(/^v-/)
    }
  })
})
