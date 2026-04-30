// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { VardagShell } from '../../../../src/renderer/modes/vardag/VardagShell'

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
      <VardagShell companyName="Acme AB">
        <p>Content</p>
      </VardagShell>,
    )
    expect(screen.getByText(/Acme AB/)).toBeInTheDocument()
  })

  it('renders children in main', () => {
    render(
      <VardagShell companyName="X">
        <p>Test child</p>
      </VardagShell>,
    )
    const main = screen.getByRole('main')
    expect(main).toContainElement(screen.getByText('Test child'))
  })

  it('switch-button calls setMode("bokforare") and persists', async () => {
    render(
      <VardagShell companyName="X">
        <p>x</p>
      </VardagShell>,
    )
    const button = await screen.findByTestId('switch-to-bokforare')
    await userEvent.click(button)
    expect(setSettingMock).toHaveBeenCalledWith('ui_mode', 'bokforare')
  })

  it('uses semantic landmarks (banner + main)', () => {
    render(
      <VardagShell companyName="X">
        <p>x</p>
      </VardagShell>,
    )
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('passes axe a11y check', async () => {
    const { container } = render(
      <VardagShell companyName="Acme AB">
        <div>
          <h1>Innehåll</h1>
          <p>Stub-innehåll för axe-kontroll.</p>
        </div>
      </VardagShell>,
    )
    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})
