// @vitest-environment jsdom
/**
 * Sprint 45 — ExpenseForm + ConsequencePane wire-in (paritet med S18 manual + S45 invoice).
 *
 * Verifierar att ExpenseForm renderar ConsequencePane i höger-zon med
 * data-testid="expense-consequence" samt att den startar i idle state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ExpenseForm } from '../../../../src/renderer/components/expenses/ExpenseForm'
import { defaultExpenseVatCodes } from '../__fixtures__/expenses'

vi.mock('../../../../src/renderer/components/expenses/SupplierPicker', () => ({
  SupplierPicker: () => <div data-testid="picker-stub" />,
}))
vi.mock('../../../../src/renderer/components/expenses/ExpenseLineRow', () => ({
  ExpenseLineRow: () => <tr data-testid="line-row-stub" />,
}))
vi.mock('../../../../src/renderer/components/expenses/ExpenseTotals', () => ({
  ExpenseTotals: () => <div data-testid="totals-stub" />,
}))

describe('ExpenseForm — ConsequencePane wire-in (Sprint 45)', () => {
  beforeEach(() => {
    setupMockIpc()
    mockIpcResponse('vat-code:list', {
      success: true,
      data: defaultExpenseVatCodes,
    })
    mockIpcResponse('account:list', {
      success: true,
      data: [
        { account_number: '6230', name: 'Telefoni', is_active: 1 },
        { account_number: '2440', name: 'Leverantörsskuld', is_active: 1 },
      ],
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renderar ConsequencePane med data-testid="expense-consequence"', async () => {
    await renderWithProviders(
      <ExpenseForm onSave={() => {}} onCancel={() => {}} />,
    )
    expect(screen.getByTestId('expense-consequence')).toBeInTheDocument()
  })

  it('startar i idle state när inga rader finns', async () => {
    await renderWithProviders(
      <ExpenseForm onSave={() => {}} onCancel={() => {}} />,
    )
    expect(screen.getByTestId('consequence-pane-idle')).toBeInTheDocument()
  })
})
