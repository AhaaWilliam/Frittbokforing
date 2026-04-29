// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { VardagShell } from '../../../../src/renderer/modes/vardag/VardagShell'
import { VardagPageOverview } from '../../../../src/renderer/modes/vardag/VardagPageOverview'

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
}

describe('VardagShell', () => {
  let setSettingMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setSettingMock = vi.fn().mockResolvedValue(undefined)
    ;(window as unknown as { api: unknown }).api = {
      getSetting: vi.fn().mockResolvedValue('vardag'),
      setSetting: setSettingMock,
    }
  })

  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api
  })

  it('renders company name in header', () => {
    render(
      <VardagShell companyName="Acme AB" showBottomNav={false}>
        <p>Content</p>
      </VardagShell>,
    )
    expect(screen.getByText(/Acme AB/)).toBeInTheDocument()
  })

  it('renders children in main', () => {
    render(
      <VardagShell companyName="X" showBottomNav={false}>
        <p>Test child</p>
      </VardagShell>,
    )
    const main = screen.getByRole('main')
    expect(main).toContainElement(screen.getByText('Test child'))
  })

  it('switch-button calls setMode("bokforare") and persists', async () => {
    render(
      <VardagShell companyName="X" showBottomNav={false}>
        <p>x</p>
      </VardagShell>,
    )
    const button = screen.getByTestId('switch-to-bokforare')
    await userEvent.click(button)
    expect(setSettingMock).toHaveBeenCalledWith('ui_mode', 'bokforare')
  })

  it('uses semantic landmarks (banner + main)', () => {
    render(
      <VardagShell companyName="X" showBottomNav={false}>
        <p>x</p>
      </VardagShell>,
    )
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('passes axe a11y check', async () => {
    const { container } = render(
      <VardagShell companyName="Acme AB" showBottomNav={false}>
        <VardagPageOverview />
      </VardagShell>,
    )
    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})

describe('VardagPageOverview', () => {
  it('renders greeting heading', () => {
    render(<VardagPageOverview />)
    expect(
      screen.getByRole('heading', { name: 'God morgon' }),
    ).toBeInTheDocument()
  })

  it('renders three KPI-cards', () => {
    render(<VardagPageOverview />)
    expect(screen.getByText('Pengar i kassan')).toBeInTheDocument()
    expect(screen.getByText('Obetalda kostnader')).toBeInTheDocument()
    expect(screen.getByText('Obetalda fakturor')).toBeInTheDocument()
  })

  it('renders MVP-callout', () => {
    render(<VardagPageOverview />)
    expect(
      screen.getByText(/Vardag-läget är under uppbyggnad/),
    ).toBeInTheDocument()
  })

  it('passes axe a11y check', async () => {
    const { container } = render(<VardagPageOverview />)
    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})
