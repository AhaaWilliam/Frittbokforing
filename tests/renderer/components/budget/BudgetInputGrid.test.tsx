// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse, mockIpcPending } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { BudgetInputGrid } from '../../../../src/renderer/components/budget/BudgetInputGrid'
import type { BudgetLineMeta } from '../../../../src/shared/types'

beforeEach(() => {
  setupMockIpc()
  // Default svar — overridas i tester
  mockIpcResponse('budget:get', { success: true, data: [] })
  mockIpcResponse('fiscal-year:list', {
    success: true,
    data: [
      { id: 1, company_id: 1, year_label: '2026', start_date: '2026-01-01', end_date: '2026-12-31', is_closed: 0, annual_report_status: 'open', closed_at: null },
    ],
  })
})

const lines: BudgetLineMeta[] = [
  {
    lineId: 'rev-net',
    label: 'Nettoomsättning',
    groupId: 'income',
    groupLabel: 'Intäkter',
    signMultiplier: 1,
  },
  {
    lineId: 'cost-rent',
    label: 'Lokalkostnad',
    groupId: 'expenses',
    groupLabel: 'Kostnader',
    signMultiplier: -1,
  },
]

describe('BudgetInputGrid', () => {
  it('visar LoadingSpinner medan targets hämtas', async () => {
    mockIpcPending('budget:get')
    await renderWithProviders(
      <BudgetInputGrid lines={lines} fiscalYearId={1} />,
    )
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renderar group-header per första rad i grupp', async () => {
    await renderWithProviders(
      <BudgetInputGrid lines={lines} fiscalYearId={1} />,
    )
    await waitFor(() => {
      expect(screen.getByText('Intäkter')).toBeInTheDocument()
    })
    expect(screen.getByText('Kostnader')).toBeInTheDocument()
    expect(screen.getByText('Nettoomsättning')).toBeInTheDocument()
    expect(screen.getByText('Lokalkostnad')).toBeInTheDocument()
  })

  it('renderar 12 period-input-celler per rad + Helår', async () => {
    await renderWithProviders(
      <BudgetInputGrid lines={lines} fiscalYearId={1} />,
    )
    await waitFor(() => {
      expect(screen.getByText('P1')).toBeInTheDocument()
    })
    expect(screen.getByText('P12')).toBeInTheDocument()
    // Aria-labels för cellerna är "Nettoomsättning P1"...
    expect(
      screen.getByRole('spinbutton', { name: /Nettoomsättning P1$/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('spinbutton', { name: /Nettoomsättning P12/ }),
    ).toBeInTheDocument()
  })

  it('Spara-knapp disabled när ingen ändring', async () => {
    await renderWithProviders(
      <BudgetInputGrid lines={lines} fiscalYearId={1} />,
    )
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Spara$/ })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /^Spara$/ })).toBeDisabled()
  })

  it('input-ändring sätter dirty och enablar Spara', async () => {
    const user = userEvent.setup()
    await renderWithProviders(
      <BudgetInputGrid lines={lines} fiscalYearId={1} />,
    )
    await waitFor(() => {
      expect(
        screen.getByRole('spinbutton', { name: /Nettoomsättning P1$/ }),
      ).toBeInTheDocument()
    })
    await user.type(
      screen.getByRole('spinbutton', { name: /Nettoomsättning P1$/ }),
      '1000',
    )
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Spara$/ })).not.toBeDisabled()
    })
  })

  it('Kopiera-knapp disabled när inget tidigare FY finns', async () => {
    await renderWithProviders(
      <BudgetInputGrid lines={lines} fiscalYearId={1} />,
    )
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Kopiera från förra året/ }),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByRole('button', { name: /Kopiera från förra året/ }),
    ).toBeDisabled()
  })

  // Note: "Kopiera enablas när tidigare FY finns" testas inte här eftersom
  // renderWithProviders själv mockar fiscal-year:list med en single-FY
  // baserat på fiscalYear-prop, vilket överrider test-level mock.

  it('"Fördela jämnt" delar total per period när total > 0', async () => {
    const user = userEvent.setup()
    mockIpcResponse('budget:get', {
      success: true,
      data: [
        { id: 1, fiscal_year_id: 1, line_id: 'rev-net', period_number: 1, amount_ore: 1200 },
      ],
    })
    await renderWithProviders(
      <BudgetInputGrid lines={lines} fiscalYearId={1} />,
    )
    await waitFor(() => {
      // Initial: P1 = 12 (1200 öre)
      const p1 = screen.getByRole('spinbutton', {
        name: /Nettoomsättning P1$/,
      }) as HTMLInputElement
      expect(p1.value).toBe('12')
    })
    await user.click(screen.getByRole('button', { name: /Fördela jämnt/ }))
    // Efter fördelning: 1200 / 12 = 100 per period (1 kr); rest till sista
    await waitFor(() => {
      const p1 = screen.getByRole('spinbutton', {
        name: /Nettoomsättning P1$/,
      }) as HTMLInputElement
      expect(p1.value).toBe('1')
    })
  })

  it('respekterar periodCount=6 (kortat FY, M161)', async () => {
    await renderWithProviders(
      <BudgetInputGrid lines={lines} fiscalYearId={1} periodCount={6} />,
    )
    await waitFor(() => {
      expect(screen.getByText('P1')).toBeInTheDocument()
    })
    expect(screen.getByText('P6')).toBeInTheDocument()
    expect(screen.queryByText('P7')).not.toBeInTheDocument()
  })
})
