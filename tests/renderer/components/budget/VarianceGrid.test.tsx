// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse, mockIpcPending } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { VarianceGrid } from '../../../../src/renderer/components/budget/VarianceGrid'
import type {
  BudgetVarianceLine,
  BudgetVarianceReport,
} from '../../../../src/shared/types'

beforeEach(() => {
  setupMockIpc()
})

function makeLine(overrides?: Partial<BudgetVarianceLine>): BudgetVarianceLine {
  return {
    lineId: 'rev',
    label: 'Nettoomsättning',
    groupId: 'income',
    groupLabel: 'Intäkter',
    signMultiplier: 1,
    periods: Array.from({ length: 12 }, (_, i) => ({
      periodNumber: i + 1,
      budgetOre: 100000,
      actualOre: 110000,
      varianceOre: 10000,
      variancePercent: 10,
    })),
    totalBudgetOre: 1200000,
    totalActualOre: 1320000,
    totalVarianceOre: 120000,
    totalVariancePercent: 10,
    ...overrides,
  }
}

function makeReport(lines: BudgetVarianceLine[]): BudgetVarianceReport {
  return { lines }
}

describe('VarianceGrid', () => {
  it('visar LoadingSpinner medan data hämtas', async () => {
    mockIpcPending('budget:variance')
    await renderWithProviders(<VarianceGrid fiscalYearId={1} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('tom lines-array renderar period-headers utan rader', async () => {
    mockIpcResponse('budget:variance', {
      success: true,
      data: makeReport([]),
    })
    await renderWithProviders(<VarianceGrid fiscalYearId={1} />)
    // Tom report → ingen rad-data men period-headers från fallback (12)
    await waitFor(() => {
      expect(screen.getByText('P1')).toBeInTheDocument()
    })
    expect(screen.getByText('P12')).toBeInTheDocument()
  })

  it('renderar 12 period-rubriker + Helår-kolumn', async () => {
    mockIpcResponse('budget:variance', {
      success: true,
      data: makeReport([makeLine()]),
    })
    await renderWithProviders(<VarianceGrid fiscalYearId={1} />)
    await waitFor(() => {
      expect(screen.getByText('P1')).toBeInTheDocument()
    })
    expect(screen.getByText('P12')).toBeInTheDocument()
    expect(screen.getAllByText('Helår').length).toBeGreaterThan(0)
  })

  it('renderar group-header för första rad i varje grupp', async () => {
    const r1 = makeLine({ lineId: 'r1', groupId: 'income', label: 'Försäljning' })
    const r2 = makeLine({ lineId: 'r2', groupId: 'income', label: 'Övriga intäkter' })
    const r3 = makeLine({
      lineId: 'r3',
      groupId: 'expenses',
      groupLabel: 'Kostnader',
      label: 'Lokal',
    })
    mockIpcResponse('budget:variance', {
      success: true,
      data: makeReport([r1, r2, r3]),
    })
    await renderWithProviders(<VarianceGrid fiscalYearId={1} />)
    await waitFor(() => {
      expect(screen.getByText('Intäkter')).toBeInTheDocument()
    })
    expect(screen.getByText('Kostnader')).toBeInTheDocument()
    expect(screen.getByText('Försäljning')).toBeInTheDocument()
    expect(screen.getByText('Övriga intäkter')).toBeInTheDocument()
  })

  it('positiv variance får success-färg, negativ får danger-färg', async () => {
    const positive = makeLine({
      lineId: 'pos',
      label: 'Positiv',
      totalVarianceOre: 50000,
      periods: [
        { periodNumber: 1, budgetOre: 100, actualOre: 150, varianceOre: 50, variancePercent: 50 },
      ],
    })
    const negative = makeLine({
      lineId: 'neg',
      label: 'Negativ',
      totalVarianceOre: -50000,
      periods: [
        { periodNumber: 1, budgetOre: 100, actualOre: 50, varianceOre: -50, variancePercent: -50 },
      ],
    })
    mockIpcResponse('budget:variance', {
      success: true,
      data: makeReport([positive, negative]),
    })
    const { container } = await renderWithProviders(<VarianceGrid fiscalYearId={1} />)
    await waitFor(() => {
      expect(screen.getByText('Positiv')).toBeInTheDocument()
    })
    // Hitta cell med positiv varians via klassmatch
    expect(container.querySelector('.text-success-600')).not.toBeNull()
    expect(container.querySelector('.text-danger-600')).not.toBeNull()
  })

  it('visar em-dash när belopp är 0', async () => {
    const zero = makeLine({
      lineId: 'z',
      label: 'Nollrad',
      periods: [
        { periodNumber: 1, budgetOre: 0, actualOre: 0, varianceOre: 0, variancePercent: null },
      ],
      totalBudgetOre: 0,
      totalActualOre: 0,
      totalVarianceOre: 0,
      totalVariancePercent: null,
    })
    mockIpcResponse('budget:variance', {
      success: true,
      data: makeReport([zero]),
    })
    await renderWithProviders(<VarianceGrid fiscalYearId={1} />)
    await waitFor(() => {
      expect(screen.getByText('Nollrad')).toBeInTheDocument()
    })
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('respekterar period-count från första rad (M161 — inte hårdkodad 12)', async () => {
    const shortFy = makeLine({
      periods: Array.from({ length: 6 }, (_, i) => ({
        periodNumber: i + 1,
        budgetOre: 0,
        actualOre: 0,
        varianceOre: 0,
        variancePercent: null,
      })),
    })
    mockIpcResponse('budget:variance', {
      success: true,
      data: makeReport([shortFy]),
    })
    await renderWithProviders(<VarianceGrid fiscalYearId={1} />)
    await waitFor(() => {
      expect(screen.getByText('P1')).toBeInTheDocument()
    })
    expect(screen.getByText('P6')).toBeInTheDocument()
    // P7 ska inte renderas
    expect(screen.queryByText('P7')).not.toBeInTheDocument()
  })
})
