// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor, act } from '@testing-library/react'
import { setupMockIpc } from '../setup/mock-ipc'
import { renderWithProviders } from '../helpers/render-with-providers'
import { useFiscalYearContext } from '../../src/renderer/contexts/FiscalYearContext'

// ── Test helper component ─────────────────────────────────────────────

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

describe('render-with-providers', () => {
  beforeEach(() => {
    setupMockIpc()
  })

  it('renders with loaded fiscal year from mock-IPC', async () => {
    renderWithProviders(<FiscalYearDisplay />, {
      fiscalYear: { id: 5, label: '2025' },
    })

    await waitFor(() => {
      expect(screen.getByTestId('fy-label').textContent).toBe('2025')
    })
    expect(screen.getByTestId('fy-count').textContent).toBe('1')
    expect(screen.getByTestId('fy-readonly').textContent).toBe('no')
  })

  it('renders loading state when fiscalYear is "loading"', async () => {
    renderWithProviders(<FiscalYearDisplay />, {
      fiscalYear: 'loading',
    })

    // In loading state, FiscalYearContext has no activeFiscalYear yet
    // because useFiscalYears() query hasn't resolved
    // The provider still renders children — it just has null/empty state
    await waitFor(() => {
      expect(screen.getByTestId('fy-label').textContent).toBe('none')
    })
    expect(screen.getByTestId('fy-count').textContent).toBe('0')
  })

  it('respects initialRoute via hash router', async () => {
    function RouteDisplay() {
      return <span data-testid="hash">{window.location.hash}</span>
    }

    renderWithProviders(<RouteDisplay />, {
      initialRoute: '/products',
    })

    expect(window.location.hash).toBe('#/products')
    expect(screen.getByTestId('hash').textContent).toBe('#/products')

    // Verify navigation works via hash change
    act(() => {
      window.location.hash = '/customers'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(window.location.hash).toBe('#/customers')
  })
})
