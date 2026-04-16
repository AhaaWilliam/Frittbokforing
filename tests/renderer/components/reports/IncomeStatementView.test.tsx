// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { IncomeStatementView } from '../../../../src/renderer/components/reports/IncomeStatementView'
import type { IncomeStatementResult } from '../../../../src/shared/types'

// IncomeStatementView is a pure presentational component — no providers needed.

function makeData(
  overrides?: Partial<IncomeStatementResult>,
): IncomeStatementResult {
  return {
    fiscalYear: { startDate: '2026-01-01', endDate: '2026-12-31' },
    groups: [
      {
        id: 'net_revenue',
        label: 'Nettoomsättning',
        lines: [
          {
            id: 'sales',
            label: 'Försäljning',
            netAmount: 20000000,
            displayAmount: 20000000,
            accounts: [
              { accountNumber: '3001', accountName: 'Försäljning tjänster', netAmount: 20000000, displayAmount: 20000000 },
            ],
          },
        ],
        subtotalNet: 20000000,
        subtotalDisplay: 20000000,
      },
      {
        id: 'operating_costs',
        label: 'Övriga externa kostnader',
        lines: [
          {
            id: 'rent',
            label: 'Lokalkostnader',
            netAmount: -5000000,
            displayAmount: 5000000,
            accounts: [
              { accountNumber: '5010', accountName: 'Lokalhyra', netAmount: -5000000, displayAmount: 5000000 },
            ],
          },
        ],
        subtotalNet: -5000000,
        subtotalDisplay: 5000000,
      },
    ],
    operatingResult: 15000000,
    resultAfterFinancial: 14500000,
    netResult: 14500000,
    ...overrides,
  }
}

describe('IncomeStatementView', () => {
  it('axe-check passes', async () => {
    const { container } = render(<IncomeStatementView data={makeData()} />)
    const results = await axe.run(container, {
      rules: {
        'color-contrast': { enabled: false },
        // heading-order: component renders h2→h4 (h3 is in parent page context)
        'heading-order': { enabled: false },
      },
    })
    expect(results.violations).toEqual([])
  })

  it('renders group labels', () => {
    render(<IncomeStatementView data={makeData()} />)
    expect(screen.getByText('Nettoomsättning')).toBeInTheDocument()
    expect(screen.getByText('Övriga externa kostnader')).toBeInTheDocument()
  })

  it('renders result totals', () => {
    render(<IncomeStatementView data={makeData()} />)
    expect(screen.getByText('Rörelseresultat')).toBeInTheDocument()
    expect(
      screen.getByText('Resultat efter finansiella poster'),
    ).toBeInTheDocument()
    expect(screen.getByText('Årets resultat')).toBeInTheDocument()
  })
})
