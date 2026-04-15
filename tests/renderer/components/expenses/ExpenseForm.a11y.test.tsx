// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ExpenseForm } from '../../../../src/renderer/components/expenses/ExpenseForm'
import type { VatCode } from '../../../../src/shared/types'

const defaultVatCodes: VatCode[] = [
  { id: 1, code: '25', description: 'Moms 25%', rate_percent: 25, vat_type: 'incoming', report_box: null },
]

beforeEach(() => {
  setupMockIpc()
  mockIpcResponse('vat-code:list', defaultVatCodes)
  mockIpcResponse('account:list', [])
  mockIpcResponse('counterparty:list', [])
  mockIpcResponse('company:get', { id: 1, fiscal_rule: 'K2', name: 'Test AB', org_number: '556000-0000', address: '', postal_code: '', city: '', country: 'SE', bankgiro: null, plusgiro: null, iban: null, bic: null, phone: null, email: null, website: null, contact_person: null })
})

describe('ExpenseForm — F49 a11y', () => {
  it('submit-failure moves focus to first invalid field in DOM order', async () => {
    const { container } = await renderWithProviders(
      <ExpenseForm onSave={vi.fn()} onCancel={vi.fn()} />,
    )

    const saveButton = screen.getByRole('button', { name: /spara/i })
    saveButton.click()

    await waitFor(() => {
      const firstInvalid = container.querySelector('[aria-invalid="true"]')
      expect(firstInvalid).not.toBeNull()
      expect(document.activeElement).toBe(firstInvalid)
    })
  })

  it('dynamic line addition is announced via aria-live region', async () => {
    const { container } = await renderWithProviders(
      <ExpenseForm onSave={vi.fn()} onCancel={vi.fn()} />,
    )

    const liveRegion = container.querySelector('tbody[aria-live="polite"]')
    expect(liveRegion).not.toBeNull()

    const initialRows = liveRegion!.querySelectorAll('tr')
    const initialCount = initialRows.length

    const addButton = screen.getByRole('button', { name: /lägg till rad/i })
    addButton.click()

    await waitFor(() => {
      const rows = liveRegion!.querySelectorAll('tr')
      expect(rows.length).toBe(initialCount + 1)
    })
  })
})
