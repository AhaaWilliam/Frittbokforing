// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { BalanceSheetView } from '../../../../src/renderer/components/reports/BalanceSheetView'
import type { BalanceSheetResult } from '../../../../src/shared/types'

// BalanceSheetView is a pure presentational component — no providers needed.

function makeData(overrides?: Partial<BalanceSheetResult>): BalanceSheetResult {
  return {
    fiscalYear: { startDate: '2026-01-01', endDate: '2026-12-31' },
    assets: {
      groups: [
        {
          id: 'current_assets',
          label: 'Omsättningstillgångar',
          lines: [
            {
              id: 'receivables',
              label: 'Kundfordringar',
              netAmount: 5000000,
              displayAmount: 5000000,
              accounts: [
                { accountNumber: '1510', accountName: 'Kundfordringar', netAmount: 5000000, displayAmount: 5000000 },
              ],
            },
            {
              id: 'bank',
              label: 'Kassa och bank',
              netAmount: 10000000,
              displayAmount: 10000000,
              accounts: [
                { accountNumber: '1930', accountName: 'Företagskonto', netAmount: 10000000, displayAmount: 10000000 },
              ],
            },
          ],
          subtotalNet: 15000000,
          subtotalDisplay: 15000000,
        },
      ],
      total: 15000000,
    },
    equityAndLiabilities: {
      groups: [
        {
          id: 'equity',
          label: 'Eget kapital',
          lines: [
            {
              id: 'share_capital',
              label: 'Aktiekapital',
              netAmount: 5000000,
              displayAmount: 5000000,
              accounts: [
                { accountNumber: '2081', accountName: 'Aktiekapital', netAmount: 5000000, displayAmount: 5000000 },
              ],
            },
          ],
          subtotalNet: 5000000,
          subtotalDisplay: 5000000,
        },
        {
          id: 'liabilities',
          label: 'Skulder',
          lines: [
            {
              id: 'supplier_debt',
              label: 'Leverantörsskulder',
              netAmount: 5000000,
              displayAmount: 5000000,
              accounts: [
                { accountNumber: '2440', accountName: 'Leverantörsskulder', netAmount: 5000000, displayAmount: 5000000 },
              ],
            },
          ],
          subtotalNet: 5000000,
          subtotalDisplay: 5000000,
        },
      ],
      calculatedNetResult: 5000000,
      total: 15000000,
    },
    balanceDifference: 0,
    ...overrides,
  }
}

describe('BalanceSheetView', () => {
  it('axe-check passes', async () => {
    const { container } = render(<BalanceSheetView data={makeData()} />)
    const results = await axe.run(container, {
      rules: {
        'color-contrast': { enabled: false },
        // heading-order: component renders h2→h3→h4 in isolation but parent
        // page provides broader heading context
        'heading-order': { enabled: false },
      },
    })
    expect(results.violations).toEqual([])
  })

  it('renders main headings', () => {
    render(<BalanceSheetView data={makeData()} />)
    expect(screen.getByText('Tillgångar')).toBeInTheDocument()
    expect(screen.getByText('Eget kapital och skulder')).toBeInTheDocument()
  })

  it('renders SUMMA totals', () => {
    render(<BalanceSheetView data={makeData()} />)
    expect(screen.getByText('SUMMA TILLGÅNGAR')).toBeInTheDocument()
    expect(
      screen.getByText('SUMMA EGET KAPITAL OCH SKULDER'),
    ).toBeInTheDocument()
  })

  it('shows årets resultat when calculatedNetResult is non-zero', () => {
    render(<BalanceSheetView data={makeData()} />)
    expect(screen.getByText(/Årets resultat/)).toBeInTheDocument()
  })

  it('shows balance difference warning when non-zero', () => {
    render(
      <BalanceSheetView data={makeData({ balanceDifference: 10000 })} />,
    )
    expect(screen.getByText(/Differens/)).toBeInTheDocument()
  })

  it('hides balance difference warning when zero', () => {
    render(<BalanceSheetView data={makeData({ balanceDifference: 0 })} />)
    expect(screen.queryByText(/Differens/)).not.toBeInTheDocument()
  })
})
