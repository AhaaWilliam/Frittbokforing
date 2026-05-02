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
    approved_for_f_tax: 0,
    vat_frequency: 'quarterly',
    has_employees: 0,
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

  it('renders nav-counts when list-IPCs returnerar data (H+G-15)', async () => {
    mockIpcResponse('invoice:list', {
      success: true,
      data: { items: [], counts: { total: 7, draft: 0, unpaid: 0, partial: 0, paid: 0, overdue: 0 }, total_items: 7 },
    })
    mockIpcResponse('expense:list', {
      success: true,
      data: { expenses: [], counts: { total: 3, draft: 0, unpaid: 0, partial: 0, paid: 0, overdue: 0 }, total_items: 3 },
    })
    const cp = (id: number, name: string) => ({
      id,
      company_id: 1,
      name,
      type: 'customer' as const,
      org_number: null,
      vat_number: null,
      vat_label: null,
      address_line1: null,
      address_line2: null,
      postal_code: null,
      city: null,
      country: null,
      email: null,
      phone: null,
      bankgiro: null,
      iban: null,
      bic: null,
      bank_country_code: null,
      website: null,
      default_payment_terms: 30,
      notes: null,
      active: 1 as const,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    mockIpcResponse('counterparty:list', {
      success: true,
      data: [cp(1, 'A AB'), cp(2, 'B AB')],
    })

    const company = makeCompany()
    await renderWithProviders(<Sidebar company={company} />, {
      axeCheck: false, // M133 exempt — dedicated axe test above
    })

    await waitFor(() => {
      expect(screen.getByTestId('nav-income-count')).toHaveTextContent('7')
    })
    expect(screen.getByTestId('nav-expenses-count')).toHaveTextContent('3')
    // Counterparties används både för customers och suppliers (samma mock)
    expect(screen.getByTestId('nav-customers-count')).toHaveTextContent('2')
    expect(screen.getByTestId('nav-suppliers-count')).toHaveTextContent('2')
  })

  it('renders manual-drafts/accruals/fixed-assets/imported counts (H+G-27)', async () => {
    // Stora invoice/expense/counterparty-mocks får default = []
    mockIpcResponse('invoice:list', {
      success: true,
      data: { items: [], counts: { total: 0, draft: 0, unpaid: 0, partial: 0, paid: 0, overdue: 0 }, total_items: 0 },
    })
    mockIpcResponse('expense:list', {
      success: true,
      data: { expenses: [], counts: { total: 0, draft: 0, unpaid: 0, partial: 0, paid: 0, overdue: 0 }, total_items: 0 },
    })
    mockIpcResponse('counterparty:list', { success: true, data: [] })
    // 2 utkast
    mockIpcResponse('manual-entry:list-drafts', {
      success: true,
      data: [
        { id: 1, fiscal_year_id: 1, description: 'd1', date: '2026-01-01', total_amount_ore: 0, status: 'draft', created_at: '', updated_at: '' },
        { id: 2, fiscal_year_id: 1, description: 'd2', date: '2026-01-02', total_amount_ore: 0, status: 'draft', created_at: '', updated_at: '' },
      ],
    })
    // 2 schedules: en aktiv med remaining, en deaktiverad → 1
    mockIpcResponse('accrual:list', {
      success: true,
      data: [
        {
          id: 1, fiscal_year_id: 1, description: 'a1', accrual_type: 'prepaid_expense',
          balance_account: '1700', result_account: '5000',
          total_amount_ore: 12000, period_count: 12, start_period: 1,
          is_active: 1, created_at: '',
          periodStatuses: [], executedCount: 0, remainingOre: 12000,
        },
        {
          id: 2, fiscal_year_id: 1, description: 'a2', accrual_type: 'prepaid_expense',
          balance_account: '1700', result_account: '5000',
          total_amount_ore: 6000, period_count: 6, start_period: 1,
          is_active: 0, created_at: '',
          periodStatuses: [], executedCount: 0, remainingOre: 6000,
        },
      ],
    })
    // 3 fixed assets
    mockIpcResponse('depreciation:list', {
      success: true,
      data: [
        { id: 1, fiscal_year_id: 1, name: 'fa1', acquisition_date: '2026-01-01', acquisition_cost_ore: 100000, residual_value_ore: 0, useful_life_months: 60, depreciation_method: 'linear', declining_rate: null, account_acquisition: '1230', account_accumulated: '1239', account_depreciation_expense: '7832', status: 'active', disposed_at: null, created_at: '', accumulated_depreciation_ore: 0, book_value_ore: 100000 },
        { id: 2, fiscal_year_id: 1, name: 'fa2', acquisition_date: '2026-01-01', acquisition_cost_ore: 200000, residual_value_ore: 0, useful_life_months: 60, depreciation_method: 'linear', declining_rate: null, account_acquisition: '1230', account_accumulated: '1239', account_depreciation_expense: '7832', status: 'active', disposed_at: null, created_at: '', accumulated_depreciation_ore: 0, book_value_ore: 200000 },
        { id: 3, fiscal_year_id: 1, name: 'fa3', acquisition_date: '2026-01-01', acquisition_cost_ore: 300000, residual_value_ore: 0, useful_life_months: 60, depreciation_method: 'linear', declining_rate: null, account_acquisition: '1230', account_accumulated: '1239', account_depreciation_expense: '7832', status: 'active', disposed_at: null, created_at: '', accumulated_depreciation_ore: 0, book_value_ore: 300000 },
      ],
    })
    // 5 importerade verifikat
    mockIpcResponse('journal-entry:list-imported', {
      success: true,
      data: Array.from({ length: 5 }, (_, i) => ({
        journal_entry_id: i + 1, verification_number: i + 1,
        verification_series: 'I', journal_date: '2026-01-01',
        description: `i${i}`, source_reference: 'file.sie',
        total_amount_ore: 0,
      })),
    })

    const company = makeCompany()
    await renderWithProviders(<Sidebar company={company} />, {
      axeCheck: false, // M133 exempt — dedicated axe test above
    })

    await waitFor(() => {
      expect(screen.getByTestId('nav-manual-entries-count')).toHaveTextContent('2')
      expect(screen.getByTestId('nav-accruals-count')).toHaveTextContent('1')
      expect(screen.getByTestId('nav-fixed-assets-count')).toHaveTextContent('3')
      expect(screen.getByTestId('nav-imported-entries-count')).toHaveTextContent('5')
    })
  })

  it('count=0 visas i faint-färg (H+G-15)', async () => {
    mockIpcResponse('invoice:list', {
      success: true,
      data: { items: [], counts: { total: 0, draft: 0, unpaid: 0, partial: 0, paid: 0, overdue: 0 }, total_items: 0 },
    })
    mockIpcResponse('expense:list', {
      success: true,
      data: { expenses: [], counts: { total: 0, draft: 0, unpaid: 0, partial: 0, paid: 0, overdue: 0 }, total_items: 0 },
    })
    mockIpcResponse('counterparty:list', { success: true, data: [] })

    const company = makeCompany()
    await renderWithProviders(<Sidebar company={company} />, {
      axeCheck: false, // M133 exempt — dedicated axe test above
    })

    await waitFor(() => {
      expect(screen.getByTestId('nav-income-count')).toHaveTextContent('0')
    })
    expect(screen.getByTestId('nav-income-count').className).toContain(
      'text-[var(--text-faint)]',
    )
  })
})
