// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { YearPicker, formatFiscalYearLabel } from '../../../../src/renderer/components/layout/YearPicker'
import type { FiscalYear } from '../../../../src/shared/types'

function makeFy(overrides?: Partial<FiscalYear>): FiscalYear {
  return {
    id: 1,
    company_id: 1,
    year_label: '2026',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    is_closed: 0,
    annual_report_status: 'not_started',
    ...overrides,
  }
}

beforeEach(() => {
  setupMockIpc()
})

describe('formatFiscalYearLabel', () => {
  it('standard year: same start/end year', () => {
    const fy = makeFy({ start_date: '2026-01-01', end_date: '2026-12-31' })
    expect(formatFiscalYearLabel(fy)).toBe('2026')
  })

  it('broken fiscal year: different start/end year', () => {
    const fy = makeFy({ start_date: '2025-07-01', end_date: '2026-06-30' })
    expect(formatFiscalYearLabel(fy)).toBe('2025/26')
  })
})

describe('YearPicker', () => {
  it('renders fiscal year options plus create option', async () => {
    // Default renderWithProviders gives 1 FY
    await renderWithProviders(<YearPicker />, { axeCheck: false }) // M133 exempt — dedicated axe test below

    await waitFor(() => {
      expect(screen.getByDisplayValue('2026')).toBeInTheDocument()
    })
    const select = screen.getByDisplayValue('2026') as HTMLSelectElement
    // 1 fiscal year + 1 "create" option
    expect(select.options.length).toBe(2)
    expect(select.options[0].textContent).toBe('2026')
    expect(select.options[1].textContent).toContain('Skapa nytt')
  })

  it('closed year has warning styling on select', async () => {
    await renderWithProviders(<YearPicker />, {
      fiscalYear: { id: 1, label: '2026', is_closed: 1 },
      axeCheck: false, // M133 exempt — dedicated axe test in outer describe
    })

    await waitFor(() => {
      const select = screen.getByRole('combobox') as HTMLSelectElement
      expect(select.className).toMatch(/warning/)
    })
  })

  it('closed year shows lock icon and read-only text', async () => {
    await renderWithProviders(<YearPicker />, {
      fiscalYear: { id: 1, label: '2026', is_closed: 1 },
      axeCheck: false, // M133 exempt — dedicated axe test in outer describe
    })

    await waitFor(() => {
      expect(screen.getByText(/Stängt år/)).toBeInTheDocument()
    })
  })

  it('open year has no warning styling or lock text', async () => {
    await renderWithProviders(<YearPicker />, { axeCheck: false }) // M133 exempt — dedicated axe test below

    await waitFor(() => {
      const select = screen.getByDisplayValue('2026')
      expect(select.className).not.toMatch(/warning/)
    })
    expect(screen.queryByText(/Stängt år/)).toBeNull()
  })

  it('closed year option shows "(stängt)" suffix', async () => {
    await renderWithProviders(<YearPicker />, {
      fiscalYear: { id: 1, label: '2026', is_closed: 1 },
      axeCheck: false, // M133 exempt — dedicated axe test in outer describe
    })

    await waitFor(() => {
      const select = screen.getByRole('combobox') as HTMLSelectElement
      expect(select.options[0].textContent).toBe('2026 (stängt)')
    })
  })

  it('returns null when no fiscal years', async () => {
    const { container } = await renderWithProviders(<YearPicker />, {
      fiscalYear: 'none',
      axeCheck: false, // M133 exempt — dedicated axe test in outer describe
    })
    expect(container.querySelector('[data-testid="year-picker"]')).toBeNull()
  })

  it('"+ Skapa nytt räkenskapsår" option exists', async () => {
    await renderWithProviders(<YearPicker />, { axeCheck: false }) // M133 exempt — dedicated axe test below

    await waitFor(() => {
      expect(screen.getByText('+ Skapa nytt räkenskapsår')).toBeInTheDocument()
    })
  })

  it('passes axe a11y check', async () => {
    const { axeResults } = await renderWithProviders(<YearPicker />)
    expect(axeResults?.violations).toEqual([])
  })
})
