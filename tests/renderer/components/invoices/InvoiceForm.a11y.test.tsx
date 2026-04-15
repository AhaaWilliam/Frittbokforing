// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { InvoiceForm } from '../../../../src/renderer/components/invoices/InvoiceForm'
import type { VatCode } from '../../../../src/shared/types'

const defaultVatCodes: VatCode[] = [
  { id: 1, code: '25', description: 'Moms 25%', rate_percent: 25, vat_type: 'outgoing', report_box: null },
]

beforeEach(() => {
  setupMockIpc()
  mockIpcResponse('invoice:next-number', { preview: 1001 })
  mockIpcResponse('vat-code:list', defaultVatCodes)
})

describe('InvoiceForm — F49 a11y', () => {
  it('submit-failure moves focus to first invalid field in DOM order', async () => {
    const { container } = await renderWithProviders(
      <InvoiceForm onSave={vi.fn()} onCancel={vi.fn()} />,
    )

    // Click save without filling required fields
    const saveButton = screen.getByRole('button', { name: /spara/i })
    saveButton.click()

    await waitFor(() => {
      // The first invalid field should receive focus (CustomerPicker input)
      const firstInvalid = container.querySelector('[aria-invalid="true"]')
      expect(firstInvalid).not.toBeNull()
      expect(document.activeElement).toBe(firstInvalid)
    })
  })

  it('dynamic line addition is announced via aria-live region', async () => {
    const { container } = await renderWithProviders(
      <InvoiceForm onSave={vi.fn()} onCancel={vi.fn()} />,
    )

    const liveRegion = container.querySelector('tbody[aria-live="polite"]')
    expect(liveRegion).not.toBeNull()

    // Count initial rows
    const initialRows = liveRegion!.querySelectorAll('tr')
    const initialCount = initialRows.length

    // Add a line
    const addButton = screen.getByRole('button', { name: /lägg till rad/i })
    addButton.click()

    await waitFor(() => {
      const rows = liveRegion!.querySelectorAll('tr')
      expect(rows.length).toBe(initialCount + 1)
    })
  })
})
