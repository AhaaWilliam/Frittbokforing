// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ManualEntryForm } from '../../../../src/renderer/components/manual-entries/ManualEntryForm'

beforeEach(() => {
  setupMockIpc()
  mockIpcResponse('company:get', {
    id: 1, fiscal_rule: 'K2', name: 'Test AB', org_number: '556000-0000',
    address: '', postal_code: '', city: '', country: 'SE',
    bankgiro: null, plusgiro: null, iban: null, bic: null,
    phone: null, email: null, website: null, contact_person: null,
  })
  mockIpcResponse('account:list', { success: true, data: [] })
})

describe('ManualEntryForm — F49 a11y', () => {
  it('submit-failure moves focus to first invalid field in DOM order', async () => {
    const user = userEvent.setup()
    const { container, getByRole, getByLabelText } = await renderWithProviders(
      <ManualEntryForm fiscalYearId={1} onSave={vi.fn()} onCancel={vi.fn()} />,
    )

    // Clear date field to trigger entryDate validation error
    const dateInput = getByLabelText(/datum/i) as HTMLInputElement
    await user.clear(dateInput)

    // Click save
    const saveButton = getByRole('button', { name: /spara utkast/i })
    await user.click(saveButton)

    await waitFor(() => {
      const firstInvalid = container.querySelector('[aria-invalid="true"]')
      expect(firstInvalid).not.toBeNull()
      expect(document.activeElement).toBe(firstInvalid)
    })
  })
})
