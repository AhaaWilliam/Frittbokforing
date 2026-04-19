// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { Sidebar } from '../../../../src/renderer/components/layout/Sidebar'
import type { Company } from '../../../../src/shared/types'
import type { FiscalPeriod } from '../../../../src/shared/types'

function makeCompany(overrides?: Partial<Company>): Company {
  return {
    id: 1,
    name: 'Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 2500000,
    registration_date: '2020-01-01',
    board_members: null,
    vat_number: null,
    address_line1: null,
    postal_code: null,
    city: null,
    email: null,
    phone: null,
    bankgiro: null,
    plusgiro: null,
    website: null,
    created_at: '2020-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeAllPeriods(): FiscalPeriod[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    return {
      id: i + 1,
      fiscal_year_id: 1,
      period_number: i + 1,
      start_date: `2026-${m}-01`,
      end_date: `2026-${m}-28`,
      is_closed: 0,
    }
  })
}

beforeEach(() => {
  setupMockIpc()
  // MonthIndicator needs fiscal-period:list
  mockIpcResponse('fiscal-period:list', { success: true, data: makeAllPeriods() })
})

describe('Sidebar', () => {
  it('renders company name and fiscal_rule K2', async () => {
    const company = makeCompany({ name: 'Mitt Företag AB', fiscal_rule: 'K2' })
    await renderWithProviders(<Sidebar company={company} />, {
      axeCheck: false, // M133 exempt — dedicated axe test below
      company,
    })

    await waitFor(() => {
      expect(screen.getByText('Mitt Företag AB')).toBeInTheDocument()
    })
    expect(screen.getByText('Förenklad (K2)')).toBeInTheDocument()
  })

  it('renders K3 label', async () => {
    const company = makeCompany({ fiscal_rule: 'K3' })
    await renderWithProviders(<Sidebar company={company} />, { axeCheck: false }) // M133 exempt — dedicated axe test below

    await waitFor(() => {
      expect(screen.getByText('Fullständig (K3)')).toBeInTheDocument()
    })
  })

  it('renders all nav sections', async () => {
    const company = makeCompany()
    await renderWithProviders(<Sidebar company={company} />, { axeCheck: false }) // M133 exempt — dedicated axe test below

    await waitFor(() => {
      expect(screen.getByText('Hantera')).toBeInTheDocument()
    })
    expect(screen.getByText('Register')).toBeInTheDocument()
    expect(screen.getByText('Stamdata')).toBeInTheDocument()
    // "Rapporter" appears as both section heading and nav link
    expect(screen.getAllByText('Rapporter').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Övrigt')).toBeInTheDocument()
  })

  it('renders nav links with correct testIds', async () => {
    const company = makeCompany()
    const { container } = await renderWithProviders(<Sidebar company={company} />, { axeCheck: false }) // M133 exempt — dedicated axe test below

    await waitFor(() => {
      expect(screen.getByText('Översikt')).toBeInTheDocument()
    })

    const expectedLinks = [
      'nav-overview', 'nav-income', 'nav-expenses', 'nav-manual-entries',
      'nav-customers', 'nav-suppliers', 'nav-products',
      'nav-accounts',
      'nav-reports', 'nav-account-statement', 'nav-vat', 'nav-tax',
      'nav-export', 'nav-settings',
    ]
    for (const testId of expectedLinks) {
      expect(container.querySelector(`[data-testid="${testId}"]`)).not.toBeNull()
    }
  })

  it('renders YearPicker child', async () => {
    const company = makeCompany()
    await renderWithProviders(<Sidebar company={company} />, { axeCheck: false }) // M133 exempt — dedicated axe test below

    await waitFor(() => {
      expect(screen.getByTestId('year-picker')).toBeInTheDocument()
    })
  })

  it('renders GlobalSearch child', async () => {
    const company = makeCompany()
    await renderWithProviders(<Sidebar company={company} />, { axeCheck: false }) // M133 exempt — dedicated axe test below

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Sök/)).toBeInTheDocument()
    })
  })

  it('passes axe a11y check', async () => {
    const company = makeCompany()
    const { axeResults } = await renderWithProviders(<Sidebar company={company} />)
    expect(axeResults?.violations).toEqual([])
  })
})
