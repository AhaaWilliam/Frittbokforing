// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor, act } from '@testing-library/react'
import { setupMockIpc } from '../setup/mock-ipc'
import { renderWithProviders } from '../helpers/render-with-providers'
import { useFiscalYearContext } from '../../src/renderer/contexts/FiscalYearContext'

// ── Test helper components ────────────────────────────────────────────

function FiscalYearDisplay() {
  const { activeFiscalYear, allFiscalYears, isReadOnly } =
    useFiscalYearContext()
  return (
    <div>
      <span data-testid="fy-label">
        {activeFiscalYear?.year_label ?? 'none'}
      </span>
      <span data-testid="fy-count">{allFiscalYears.length}</span>
      <span data-testid="fy-readonly">{isReadOnly ? 'yes' : 'no'}</span>
    </div>
  )
}

function CleanComponent() {
  return (
    <main>
      <button type="button">OK</button>
    </main>
  )
}

function BrokenA11yComponent() {
  // eslint-disable-next-line jsx-a11y/alt-text
  return <img src="x" />
}

describe('render-with-providers', () => {
  beforeEach(() => {
    setupMockIpc()
  })

  it('renders with loaded fiscal year from mock-IPC', async () => {
    await renderWithProviders(<FiscalYearDisplay />, {
      fiscalYear: { id: 5, label: '2025' },
    })

    await waitFor(() => {
      expect(screen.getByTestId('fy-label').textContent).toBe('2025')
    })
    expect(screen.getByTestId('fy-count').textContent).toBe('1')
    expect(screen.getByTestId('fy-readonly').textContent).toBe('no')
  })

  it('renders loading state when fiscalYear is "loading"', async () => {
    await renderWithProviders(<FiscalYearDisplay />, {
      fiscalYear: 'loading',
    })

    await waitFor(() => {
      expect(screen.getByTestId('fy-label').textContent).toBe('none')
    })
    expect(screen.getByTestId('fy-count').textContent).toBe('0')
  })

  it('respects initialRoute via hash router', async () => {
    function RouteDisplay() {
      return <span data-testid="hash">{window.location.hash}</span>
    }

    await renderWithProviders(<RouteDisplay />, {
      initialRoute: '/products',
    })

    expect(window.location.hash).toBe('#/products')
    expect(screen.getByTestId('hash').textContent).toBe('#/products')

    act(() => {
      window.location.hash = '/customers'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(window.location.hash).toBe('#/customers')
  })

  it('axe-core passes with clean semantic HTML (default-on)', async () => {
    const { axeResults } = await renderWithProviders(<CleanComponent />)

    expect(axeResults).not.toBeNull()
    expect(axeResults!.violations).toEqual([])
  })

  it('axeCheck: false skips check; default detects violations', async () => {
    // Opt-out: render passes, axeResults is null
    const { axeResults } = await renderWithProviders(<BrokenA11yComponent />, {
      axeCheck: false,
    })
    expect(axeResults).toBeNull()

    // Default (axeCheck: true): should throw with violation id
    await expect(
      renderWithProviders(<BrokenA11yComponent />),
    ).rejects.toThrow('image-alt')
  })
})
