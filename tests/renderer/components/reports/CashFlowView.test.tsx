// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { CashFlowView } from '../../../../src/renderer/components/reports/CashFlowView'
import type { CashFlowReport } from '../../../../src/main/services/cash-flow-service'

function makeData(overrides?: Partial<CashFlowReport>): CashFlowReport {
  return {
    netResultOre: 10000_00,
    openingCashOre: 5000_00,
    closingCashOre: 12500_00,
    operating: {
      label: 'Operativ verksamhet',
      items: [
        { label: 'Årets resultat', amount_ore: 10000_00 },
        { label: 'Återlagda avskrivningar', amount_ore: 1500_00 },
        { label: 'Förändring rörelsekapital', amount_ore: -500_00 },
      ],
      subtotal_ore: 11000_00,
    },
    investing: {
      label: 'Investeringsverksamhet',
      items: [{ label: 'Anläggningstillgångar netto', amount_ore: -3000_00 }],
      subtotal_ore: -3000_00,
    },
    financing: {
      label: 'Finansieringsverksamhet',
      items: [
        { label: 'Eget kapital netto (exkl. årets resultat)', amount_ore: 0 },
        { label: 'Långfristiga skulder netto', amount_ore: -500_00 },
      ],
      subtotal_ore: -500_00,
    },
    netChangeOre: 7500_00,
    ...overrides,
  }
}

describe('CashFlowView', () => {
  it('axe-check passes', async () => {
    const { container } = render(<CashFlowView data={makeData()} />)
    const results = await axe.run(container, {
      rules: {
        'color-contrast': { enabled: false },
        'heading-order': { enabled: false },
      },
    })
    expect(results.violations).toEqual([])
  })

  it('renders all three sections', () => {
    render(<CashFlowView data={makeData()} />)
    expect(screen.getByText('Operativ verksamhet')).toBeInTheDocument()
    expect(screen.getByText('Investeringsverksamhet')).toBeInTheDocument()
    expect(screen.getByText('Finansieringsverksamhet')).toBeInTheDocument()
  })

  it('renders net change + opening + closing cash', () => {
    render(<CashFlowView data={makeData()} />)
    expect(screen.getByText('Periodens kassaflöde')).toBeInTheDocument()
    expect(screen.getByText('Ingående likvida medel')).toBeInTheDocument()
    expect(screen.getByText('Utgående likvida medel')).toBeInTheDocument()
    expect(screen.getByTestId('cash-flow-net-change')).toHaveAttribute(
      'data-raw-ore',
      '750000',
    )
    expect(screen.getByTestId('cash-flow-closing-cash')).toHaveAttribute(
      'data-raw-ore',
      '1250000',
    )
  })

  it('does not show drift warning when reconciliation matches', () => {
    render(<CashFlowView data={makeData()} />)
    expect(
      screen.queryByTestId('cash-flow-drift-warning'),
    ).not.toBeInTheDocument()
  })

  it('shows drift warning when opening+netChange != closing (F65-b edge case)', () => {
    const drift = makeData({ netChangeOre: 8000_00 })
    render(<CashFlowView data={drift} />)
    expect(screen.getByTestId('cash-flow-drift-warning')).toBeInTheDocument()
  })

  it('renders fiscal year label when provided', () => {
    render(<CashFlowView data={makeData()} fiscalYearLabel="2026-01-01 – 2026-12-31" />)
    expect(screen.getByText('2026-01-01 – 2026-12-31')).toBeInTheDocument()
  })
})
